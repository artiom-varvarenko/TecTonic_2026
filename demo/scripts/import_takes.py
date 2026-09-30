# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["faster-whisper>=1.0", "soundfile>=0.12", "numpy>=1.26"]
# ///
"""Import finished voice-over takes (e.g. from ElevenLabs) for whole scenes.

A take is one recording of a scene's narration: `<takes-dir>/<scene>.<n>.mp3|wav`. A scene that
switches speaker (consecutive cues with the same `speaker` form a part) has one take per part:
`<scene>.p<k>.<n>.mp3`, k counting parts from 1. For every part the take whose transcript best
matches the script wins; Whisper word timestamps then place each cue and word, so the scene's
animations stay in sync. Parts are joined with a short pause. The scene is marked `locked`, and
make_narration.py leaves locked scenes alone unless they are named with --only.

    uv run demo/scripts/import_takes.py <takes-dir> --scenes hook problem outro \\
        --label "ElevenLabs eleven_v4 · voice clones"
"""

from __future__ import annotations

import argparse
import difflib
import json
import math
import re
from pathlib import Path

import numpy as np
import soundfile as sf
from faster_whisper import WhisperModel

DEMO = Path(__file__).resolve().parents[1]
SCRIPT = DEMO / "src" / "narration" / "script.json"
MANIFEST = DEMO / "src" / "narration" / "manifest.json"
AUDIO_DIR = DEMO / "public" / "narration"


def words(text: str) -> list[str]:
    text = re.sub(r"([a-z])([A-Z])", r"\1 \2", text)  # TrustLabel → Trust Label, as Whisper may hear it
    text = re.sub(r"\[[^\]]*\]", " ", text.lower())  # audio tags
    return re.findall(r"[a-z0-9']+", text.replace("-", " "))


def load(path: Path) -> tuple[np.ndarray, int]:
    audio, rate = sf.read(path, dtype="float32", always_2d=True)
    return audio.mean(axis=1), rate


def to16k(audio: np.ndarray, rate: int) -> np.ndarray:
    t = np.arange(0, len(audio) / rate, 1 / 16000)
    return np.interp(t, np.arange(len(audio)) / rate, audio).astype(np.float32)


def transcribe(model: WhisperModel, audio: np.ndarray, rate: int) -> list[tuple[str, float, float]]:
    segments, _ = model.transcribe(to16k(audio, rate), beam_size=5, word_timestamps=True)
    out = []
    for segment in segments:
        for w in segment.words or []:
            for token in words(w.word):
                out.append((token, w.start, w.end))
    return out


def speaker_runs(cues: list[dict]) -> list[list[dict]]:
    """Consecutive cues by the same speaker form one part, recorded as one take."""
    runs: list[list[dict]] = []
    for cue in cues:
        if not runs or runs[-1][0].get("speaker") != cue.get("speaker"):
            runs.append([])
        runs[-1].append(cue)
    return runs


def takes_for(takes_dir: Path, scene: str, part: int, parts: int) -> list[Path]:
    pattern = re.compile(rf"^{re.escape(scene)}\.(?:p(\d+)\.)?(\d+)\.(mp3|wav)$")
    found = []
    for path in sorted(takes_dir.iterdir()):
        m = pattern.match(path.name)
        if m and (int(m.group(1)) if m.group(1) else 1) == part and (m.group(1) or parts == 1):
            found.append(path)
    return found


def pick_and_align(model: WhisperModel, takes: list[Path], cues: list[dict], fps: int):
    """Best-matching take for these cues, trimmed, with cue and word timings in frames."""
    cue_words = [words(c.get("text_elevenlabs", c["text"])) for c in cues]
    expected = [w for ws in cue_words for w in ws]
    best = None
    for take in takes:
        audio, rate = load(take)
        heard = transcribe(model, audio, rate)
        score = difflib.SequenceMatcher(a=expected, b=[h[0] for h in heard], autojunk=False).ratio()
        print(f"  {take.name:18} match {score:.3f}  {' '.join(h[0] for h in heard)}")
        if heard and (best is None or score > best[0]):
            best = (score, take, audio, rate, heard)
    if best is None:
        raise SystemExit(f"no usable takes among {[t.name for t in takes]}")
    score, take, audio, rate, heard = best

    # Map every expected word to a heard word, then read cue boundaries off the timestamps.
    matcher = difflib.SequenceMatcher(a=expected, b=[h[0] for h in heard], autojunk=False)
    mapping: dict[int, int] = {}
    for tag, a0, a1, b0, b1 in matcher.get_opcodes():
        if tag in ("equal", "replace"):
            for k in range(a1 - a0):
                mapping[a0 + k] = min(b0 + k, b1 - 1)

    def heard_index(i: int, forward: bool) -> int:
        step = 1 if forward else -1
        while i not in mapping:
            i += step
            if not 0 <= i < len(expected):
                raise SystemExit(f"{take.name}: could not align the take with the script")
        return mapping[i]

    offset = max(0.0, heard[0][1] - 0.06)
    end = min(len(audio) / rate, heard[-1][2] + 0.3)
    timings, first = {}, 0
    for cue, ws in zip(cues, cue_words):
        last = first + len(ws) - 1
        h0, h1 = heard_index(first, True), heard_index(last, False)
        timings[cue["id"]] = {
            "start": max(0, round((heard[h0][1] - offset) * fps)),
            "end": round((heard[h1][2] - offset) * fps),
            # Exact word onsets, so scenes can key animations to a spoken word.
            "words": [[w, max(0, round((t - offset) * fps))] for w, t, _ in heard[h0 : h1 + 1]],
        }
        first = last + 1
    clip = audio[int(offset * rate) : int(end * rate)]
    return clip, rate, timings, take.name, score


def resample(audio: np.ndarray, rate: int, target: int) -> np.ndarray:
    if rate == target:
        return audio
    t = np.arange(0, len(audio) / rate, 1 / target)
    return np.interp(t, np.arange(len(audio)) / rate, audio).astype(np.float32)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("takes_dir", type=Path)
    parser.add_argument("--scenes", nargs="+", required=True)
    parser.add_argument("--label", required=True, help="Where the takes came from, recorded in the manifest")
    parser.add_argument("--gap", type=float, default=0.35, help="Pause between two speakers' parts, seconds")
    args = parser.parse_args()

    script = json.loads(SCRIPT.read_text(encoding="utf-8"))
    fps = script["fps"]
    manifest = json.loads(MANIFEST.read_text(encoding="utf-8"))
    model = WhisperModel("small.en", device="cpu", compute_type="int8")

    for scene in args.scenes:
        runs = speaker_runs(script["scenes"][scene])
        pieces, timings, picked, rate = [], {}, [], None
        for k, run in enumerate(runs, start=1):
            takes = takes_for(args.takes_dir, scene, k, len(runs))
            if not takes:
                name = f"{scene}.<n>.mp3" if len(runs) == 1 else f"{scene}.p{k}.<n>.mp3"
                raise SystemExit(f"no takes for {scene} part {k} ({run[0].get('speaker')}): expected {name}")
            clip, clip_rate, part_timings, take, score = pick_and_align(model, takes, run, fps)
            rate = rate or clip_rate
            if pieces:
                pieces.append(np.zeros(int(args.gap * rate), dtype=np.float32))
            shift = round(sum(len(p) for p in pieces) / rate * fps)
            for cue_id, t in part_timings.items():
                timings[cue_id] = {
                    "start": t["start"] + shift,
                    "end": t["end"] + shift,
                    "words": [[w, f + shift] for w, f in t["words"]],
                }
            pieces.append(resample(clip, clip_rate, rate))
            picked.append({"speaker": run[0].get("speaker"), "take": take, "match": round(score, 3)})

        track = np.concatenate(pieces)
        track = track * (0.89 / (float(np.max(np.abs(track))) or 1.0))
        AUDIO_DIR.mkdir(parents=True, exist_ok=True)
        sf.write(AUDIO_DIR / f"{scene}.wav", track, rate, subtype="PCM_16")
        manifest["scenes"][scene] = {
            "file": f"narration/{scene}.wav",
            "durationInFrames": math.ceil(len(track) / rate * fps),
            "cues": timings,
            "locked": True,
            "source": {"label": args.label, "takes": picked},
        }
        print(f"{scene:14} ← {', '.join(p['take'] for p in picked)}  { {k: v['start'] for k, v in timings.items()} }")

    MANIFEST.write_text(json.dumps(manifest, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
