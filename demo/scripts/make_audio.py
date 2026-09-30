# /// script
# requires-python = ">=3.11"
# dependencies = ["numpy>=1.26", "soundfile>=0.12"]
# ///
"""Synthesise the demo's sound effects and music bed (no samples, no licences).

    uv run demo/scripts/make_audio.py

Writes public/sfx/*.wav and public/music/bed.wav; `npm run audio` then encodes the bed to MP3.
"""

from pathlib import Path

import numpy as np
import soundfile as sf

DEMO = Path(__file__).resolve().parents[1]
SR = 44100
rng = np.random.default_rng(7)


def t(seconds: float) -> np.ndarray:
    return np.arange(int(seconds * SR)) / SR


def env(n: int, attack: float, decay: float) -> np.ndarray:
    x = np.arange(n) / SR
    return np.minimum(1, x / max(attack, 1e-4)) * np.exp(-x / decay)


def lowpass(x: np.ndarray, cutoff: float) -> np.ndarray:
    a = np.exp(-2 * np.pi * cutoff / SR)
    y = np.empty_like(x)
    acc = 0.0
    for i, v in enumerate(x):
        acc = (1 - a) * v + a * acc
        y[i] = acc
    return y


def save(name: str, x: np.ndarray, peak: float = 0.9) -> None:
    x = x / (np.max(np.abs(x)) or 1) * peak
    path = DEMO / "public" / "sfx" / f"{name}.wav"
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, x.astype(np.float32), SR, subtype="PCM_16")


def sfx() -> None:
    x = t(0.06)
    save("click", np.sin(2 * np.pi * 2400 * x) * env(x.size, 0.001, 0.008) + rng.normal(0, 0.3, x.size) * env(x.size, 0.0005, 0.004))
    x = t(0.12)
    save("pop", np.sin(2 * np.pi * (520 + 500 * np.exp(-x / 0.02)) * x) * env(x.size, 0.002, 0.035), 0.7)
    x = t(0.09)
    save("tick", (np.sin(2 * np.pi * 1760 * x) + 0.4 * np.sin(2 * np.pi * 3520 * x)) * env(x.size, 0.001, 0.018), 0.6)
    x = t(0.6)
    noise = lowpass(rng.normal(0, 1, x.size), 2500) - lowpass(rng.normal(0, 1, x.size), 300) * 0.5
    save("whoosh", noise * np.sin(np.pi * x / 0.6) ** 2, 0.55)
    x = t(1.6)
    bell = sum(a * np.sin(2 * np.pi * f * x) * env(x.size, 0.003, d) for f, a, d in [(1318.5, 1, 0.5), (2637, 0.3, 0.25), (1975.5, 0.7, 0.6)])
    late = np.concatenate([np.zeros(int(0.11 * SR)), (np.sin(2 * np.pi * 1975.5 * x) * env(x.size, 0.003, 0.55))[: x.size - int(0.11 * SR)]])
    save("chime", bell + 0.8 * late, 0.7)
    x = t(0.5)
    tone = np.where(x < 0.14, np.sin(2 * np.pi * 880 * x), np.sin(2 * np.pi * 1318.5 * x))
    first = np.sin(2 * np.pi * 880 * x) * env(x.size, 0.003, 0.06)
    second = np.sin(2 * np.pi * 1318.5 * x) * env(x.size, 0.003, 0.12)
    save("alert", first + np.concatenate([np.zeros(int(0.14 * SR)), second[: x.size - int(0.14 * SR)]]), 0.6)
    x = t(0.35)
    save("stamp", np.sin(2 * np.pi * (70 + 90 * np.exp(-x / 0.03)) * x) * env(x.size, 0.001, 0.09) + lowpass(rng.normal(0, 1, x.size), 1800) * env(x.size, 0.001, 0.03) * 0.8, 0.85)


def music(seconds: float = 150.0, bpm: float = 92.0) -> None:
    """Warm pad + soft arpeggio + sub; percussion enters after the intro."""
    n = int(seconds * SR)
    out = np.zeros((n, 2))
    beat = 60 / bpm
    bar = 4 * beat
    # Cmaj9 – Am7 – Fmaj7 – G6, two bars each.
    chords = [[48, 55, 59, 62, 64], [45, 52, 55, 60, 64], [41, 48, 52, 57, 60], [43, 50, 55, 59, 64]]
    hz = lambda m: 440 * 2 ** ((m - 69) / 12)
    step = 2 * bar
    for k in range(int(seconds / step) + 1):
        start = int(k * step * SR)
        chord = chords[k % len(chords)]
        length = int(step * SR * 1.25)
        x = np.arange(length) / SR
        fade = np.minimum(1, x / 1.2) * np.minimum(1, (length / SR - x) / 1.2).clip(0)
        for i, note in enumerate(chord[1:]):
            for side, detune in ((0, -0.08), (1, 0.08)):
                f = hz(note + detune)
                wave = np.sin(2 * np.pi * f * x) + 0.25 * np.sin(2 * np.pi * 2 * f * x + 0.3) + 0.08 * np.sin(2 * np.pi * 3 * f * x)
                seg = wave * fade * 0.07
                end = min(n, start + length)
                out[start:end, side] += seg[: end - start]
        bass = np.sin(2 * np.pi * hz(chord[0] - 12) * x) * fade * 0.16
        end = min(n, start + length)
        out[start:end] += bass[: end - start, None]
        # Arpeggio: eighth notes, soft plucks with a dotted-eighth echo.
        for e in range(16):
            note = chord[1:][[0, 1, 2, 3, 2, 1, 3, 2][e % 8]] + 12
            at = start + int(e * beat / 2 * SR)
            px = t(0.9)
            pluck = np.sin(2 * np.pi * hz(note) * px) * env(px.size, 0.004, 0.22) * 0.05
            for delay, gain, side in ((0, 1, None), (0.75 * beat, 0.35, 0), (1.5 * beat, 0.18, 1)):
                s = at + int(delay * SR)
                if s >= n:
                    continue
                e_ = min(n, s + px.size)
                if side is None:
                    out[s:e_] += pluck[: e_ - s, None] * gain
                else:
                    out[s:e_, side] += pluck[: e_ - s] * gain
    # Percussion from bar 4: soft kick on 1 and 3, shaker on off-beats.
    kx = t(0.3)
    kick = np.sin(2 * np.pi * (45 + 70 * np.exp(-kx / 0.025)) * kx) * env(kx.size, 0.001, 0.12) * 0.28
    sx = t(0.08)
    shaker = lowpass(rng.normal(0, 1, sx.size), 9000) * env(sx.size, 0.004, 0.02) * 0.035
    b = 4
    while (b * bar) < seconds - bar:
        for q in range(4):
            at = int((b * bar + q * beat) * SR)
            if q in (0, 2):
                out[at : at + kick.size] += kick[: max(0, min(kick.size, n - at)), None]
            s = at + int(beat / 2 * SR)
            out[s : s + shaker.size] += shaker[: max(0, min(shaker.size, n - s)), None]
        b += 1
    out = np.stack([lowpass(out[:, 0], 7000), lowpass(out[:, 1], 7000)], axis=1)
    out /= np.max(np.abs(out))
    out *= 0.9
    path = DEMO / "public" / "music" / "bed.wav"
    path.parent.mkdir(parents=True, exist_ok=True)
    sf.write(path, out.astype(np.float32), SR, subtype="PCM_16")


if __name__ == "__main__":
    sfx()
    music()
    print("wrote public/sfx/*.wav and public/music/bed.wav")
