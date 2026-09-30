# /// script
# requires-python = ">=3.11,<3.14"
# dependencies = ["kokoro-onnx>=0.4", "soundfile>=0.12", "numpy>=1.26", "httpx>=0.27"]
# ///
"""Voice the demo from src/narration/script.json.

Every cue is synthesised on its own and joined with a short pause, so the exact start of each cue
is known. That goes to src/narration/manifest.json, which the scenes use to time their animations,
and the audio goes to public/narration/<scene>.wav.

    uv run demo/scripts/make_narration.py                         # Kokoro, local and free
    uv run demo/scripts/make_narration.py --voices rufina=bf_emma # another Kokoro voice for a speaker
    ELEVENLABS_API_KEY=... uv run demo/scripts/make_narration.py --engine elevenlabs \
        --voices rufina=<voice_id> artiom=<voice_id> [--model eleven_v4]

Every cue names a `speaker`; `--voices` maps speakers to voices. Kokoro defaults come from
`speakers.<name>.kokoro` in the script; ElevenLabs needs a voice id per speaker.

A cue may carry `text_elevenlabs` when ElevenLabs needs no pronunciation respelling (e.g. "Lotte").
"""

from __future__ import annotations

import argparse
import json
import math
import os
import urllib.request
from pathlib import Path

import numpy as np
import soundfile as sf

DEMO = Path(__file__).resolve().parents[1]
SCRIPT = DEMO / "src" / "narration" / "script.json"
MANIFEST = DEMO / "src" / "narration" / "manifest.json"
AUDIO_DIR = DEMO / "public" / "narration"
SAMPLE_RATE = 24000
KOKORO_DIR = Path(os.environ.get("KOKORO_DIR", Path.home() / ".cache" / "kokoro-onnx"))
KOKORO_FILES = {
    "kokoro-v1.0.onnx": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/kokoro-v1.0.onnx",
    "voices-v1.0.bin": "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.0/voices-v1.0.bin",
}


def kokoro_engine(speed: float):
    from kokoro_onnx import Kokoro

    KOKORO_DIR.mkdir(parents=True, exist_ok=True)
    for name, url in KOKORO_FILES.items():
        if not (KOKORO_DIR / name).exists():
            print(f"downloading {name} …")
            urllib.request.urlretrieve(url, KOKORO_DIR / name)
    model = Kokoro(str(KOKORO_DIR / "kokoro-v1.0.onnx"), str(KOKORO_DIR / "voices-v1.0.bin"))

    def speak(text: str, voice: str) -> np.ndarray:
        lang = "en-gb" if voice.startswith("b") else "en-us"
        samples, rate = model.create(text, voice=voice, speed=speed, lang=lang)
        if rate != SAMPLE_RATE:
            raise ValueError(f"Kokoro returned {rate} Hz audio; expected {SAMPLE_RATE} Hz")
        return samples.astype(np.float32)

    return speak


def elevenlabs_engine(speed: float, model: str):
    import httpx

    key = os.environ.get("ELEVENLABS_API_KEY")
    if not key:
        raise SystemExit("Set ELEVENLABS_API_KEY to use --engine elevenlabs")

    def speak(text: str, voice: str) -> np.ndarray:
        body: dict = {"text": text, "model_id": model}
        if speed != 1.0:
            body["voice_settings"] = {"speed": speed}
        response = httpx.post(
            f"https://api.elevenlabs.io/v1/text-to-speech/{voice}",
            params={"output_format": f"pcm_{SAMPLE_RATE}"},
            headers={"xi-api-key": key},
            json=body,
            timeout=120,
        )
        if response.is_error:
            raise SystemExit(f"ElevenLabs error {response.status_code}: {response.text[:500]}")
        return np.frombuffer(response.content, dtype="<i2").astype(np.float32) / 32768

    return speak


def trim(samples: np.ndarray, threshold: float = 0.004) -> np.ndarray:
    """Drop leading/trailing near-silence so cue starts are exact."""
    loud = np.flatnonzero(np.abs(samples) > threshold)
    if loud.size == 0:
        return samples
    pad = int(0.03 * SAMPLE_RATE)
    return samples[max(0, loud[0] - pad) : loud[-1] + pad]


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--engine", choices=["kokoro", "elevenlabs"], default="kokoro")
    parser.add_argument("--voices", nargs="*", default=[], help="speaker=voice pairs, e.g. rufina=af_heart")
    parser.add_argument("--speed", type=float, default=1.0)
    parser.add_argument("--model", default="eleven_v4", help="ElevenLabs model id (default eleven_v4)")
    parser.add_argument("--only", nargs="*", help="Only re-voice these scenes")
    args = parser.parse_args()

    script = json.loads(SCRIPT.read_text(encoding="utf-8"))
    fps, gap = script["fps"], np.zeros(int(script["gap_seconds"] * SAMPLE_RATE), dtype=np.float32)
    voices = {name: spec.get("kokoro") for name, spec in script["speakers"].items()} if args.engine == "kokoro" else {}
    for pair in args.voices:
        name, _, voice = pair.partition("=")
        if name not in script["speakers"] or not voice:
            parser.error(f"--voices expects speaker=voice with speaker in {sorted(script['speakers'])}")
        voices[name] = voice
    if missing := sorted(set(script["speakers"]) - {k for k, v in voices.items() if v}):
        parser.error(f"no voice for speaker(s) {missing}; pass --voices name=<voice>")
    if args.engine == "kokoro":
        speak = kokoro_engine(args.speed)
    else:
        speak = elevenlabs_engine(args.speed, args.model)

    manifest = json.loads(MANIFEST.read_text(encoding="utf-8")) if MANIFEST.exists() else {"scenes": {}}
    manifest.pop("engine", None)
    manifest.pop("voice", None)
    engine = "Kokoro" if args.engine == "kokoro" else f"ElevenLabs {args.model}"
    AUDIO_DIR.mkdir(parents=True, exist_ok=True)
    for scene, cues in script["scenes"].items():
        if args.only and scene not in args.only:
            continue
        if not args.only and manifest["scenes"].get(scene, {}).get("locked"):
            print(f"{scene:14} locked (imported take), skipped; name it with --only to re-voice")
            continue
        parts, starts, cursor = [], {}, 0
        for index, cue in enumerate(cues):
            if index:
                parts.append(gap)
                cursor += gap.size
            audio = trim(speak(cue.get(f"text_{args.engine}", cue["text"]), voices[cue["speaker"]]))
            starts[cue["id"]] = {
                "start": round(cursor / SAMPLE_RATE * fps),
                "end": round((cursor + audio.size) / SAMPLE_RATE * fps),
            }
            parts.append(audio)
            cursor += audio.size
        track = np.concatenate(parts)
        peak = float(np.max(np.abs(track))) or 1.0
        sf.write(AUDIO_DIR / f"{scene}.wav", track * (0.89 / peak), SAMPLE_RATE, subtype="PCM_16")
        manifest["scenes"][scene] = {
            "file": f"narration/{scene}.wav",
            "durationInFrames": math.ceil(track.size / SAMPLE_RATE * fps),
            "cues": starts,
            "source": {"label": f"{engine} · " + ", ".join(sorted({f"{c['speaker']}={voices[c['speaker']]}" for c in cues}))},
        }
        print(f"{scene:14} {track.size / SAMPLE_RATE:5.1f}s  { {k: v['start'] for k, v in starts.items()} }")
    MANIFEST.write_text(json.dumps(manifest, indent=2) + "\n", encoding="utf-8")


if __name__ == "__main__":
    main()
