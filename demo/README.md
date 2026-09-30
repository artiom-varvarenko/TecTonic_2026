# TrustLabel demo video

A narrated, ~2:20 product video of TrustLabel, built with [Remotion](https://www.remotion.dev) (React → MP4).
Rendered output: `out/trustlabel-demo.mp4` (1920×1080, 30 fps).

Nothing on screen is made up: every grade, score, reason, expert ranking and answer comes from the real engine,
snapshotted in `src/data/demo-data.json` by running the README demo path against the API (2026-09-30).

## Storyline

| # | Scene | Shows |
|---|---|---|
| 1 | Hook | Van Dam Logistics asks Lotte for the overtime cut-off, urgently |
| 2 | Problem | Search finds 3 documents (20th / 22nd / 15th); Teams says 25th |
| 3 | Reveal | TrustLabel: "Search finds it. TrustLabel shows whether you can rely on it." |
| 4 | Trust label | DOC-BE-009 graded live: base 75, −20 owner left, −15 review overdue, superseded → F |
| 5 | Applicability | A grade-C Dutch procedure is still not applicable to a Belgian client |
| 6 | Conflict triage | Sources sorted into other country / outdated / chat-only exception → "Don't act yet" |
| 7 | Expert routing | Ellen scores 9; Pieter (not on the client team) and Marc (left) excluded; request sent |
| 8 | Verify by voice | ElevenLabs Scribe → OpenAI → rules check the quote → Ellen confirms |
| 9 | Verified answer | 25th, grade A for Van Dam; "Belgium — all clients" still 20th (B) |
| 10 | Team | Team photos (from `src/team.json`) |
| 11 | Outro | AI reads. Rules judge. Humans verify. |

## Commands

```bash
cd demo
npm install
npm run studio          # live preview + timeline scrubbing in the browser
npm run render          # → out/trustlabel-demo.mp4
npm run render:silent   # same, without the music bed
npm run still           # one frame → out/poster.png
npm run stills -- 300 1440 3300   # quick half-size previews → out/still-<frame>.png
```

Remotion downloads its own headless Chrome on first render. To use an installed one instead:
`REMOTION_BROWSER_EXECUTABLE=/path/to/chrome npm run render`.

## Voice-over

Current voices:

| Scenes | Voice |
|---|---|
| hook, problem, reveal, team, outro (the locked-in story) | ElevenLabs `eleven_v4`, voice Talia |
| grading → verified (the product walkthrough, waiting on the new UI) | Kokoro `af_heart` (open-source, local) |

`src/narration/manifest.json` records the source of every scene.

The narration lives in `src/narration/script.json`, split into short **cues**. Scenes time their animations from
the cue timings in `src/narration/manifest.json` (`cue()` / `cueWord()` in `src/timeline.ts`). Change the script or
the voice, regenerate, render: everything re-syncs and scene lengths adapt.

**Whole-scene takes (how the ElevenLabs scenes were made).** Generate one take per scene, for example with the
ElevenLabs connector. The exact prompts are under `elevenlabs_takes` in `script.json`. Save the takes as
`<scene>.<n>.mp3` and import them:

```bash
uv run demo/scripts/import_takes.py path/to/takes --scenes hook problem reveal team outro \
    --label "ElevenLabs eleven_v4 · Talia"
```

For each scene, the importer transcribes every take with Whisper and keeps the one closest to the script. It then
places each cue, and each word, from the word timestamps, and marks the scene `locked`.

**Per-cue synthesis** (fully scripted, skips locked scenes unless named with `--only`):

```bash
npm run narration                                    # Kokoro, local, no key
ELEVENLABS_API_KEY=... npm run narration -- --engine elevenlabs --voice <voice_id> --only grading triage
# other options: --model eleven_multilingual_v2 · --speed 1.05
```

Spellings like "Trust Label" or "Lot-tuh" in `text` only steer Kokoro's pronunciation; `text_elevenlabs` overrides
the text for ElevenLabs.

## Team photos

Put the photos in `public/team/` (square-ish JPG/PNG, at least 600×600) and list the members in `src/team.json`:

```json
{"name": "Artiom Varvarenko", "role": "Engine & API", "photo": "artiom.jpg"}
```

Members without a photo get an initials avatar. Up to ~5 fit on one row.

## Changing the look (e.g. after a UI redesign)

The app's UI is rebuilt as React components rather than screenshots, so it stays sharp and animatable:

- `src/theme.ts` has the colours (mirrors `static/styles.css`) and the fonts.
- `src/components/` holds the grade tile, the energy-label ladder, cards, answer banner, reason badges and cursor.
- `src/scenes/` holds one file per scene.

Restyle the components and every scene follows.

## Regenerating assets

```bash
npm run data     # re-snapshot the engine's answers (after changing data/*.json or the rules)
npm run audio    # re-synthesise sound effects and the music bed (procedural, no licences needed)
```
