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
| 10 | Team | Rufina and Artiom (photos and roles from `src/team.json`) |
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

Two narrators. Every cue in `src/narration/script.json` has a `speaker`:

| Speaker | Scenes |
|---|---|
| **Rufina** (female) | hook, problem, reveal, verify by voice, verified answer, "Humans verify. TrustLabel." |
| **Artiom** (male) | trust label, applicability, conflict triage, expert routing, team, "AI reads. Rules judge." |

The target voices are Rufina's and Artiom's **ElevenLabs voice clones** on `eleven_v4`. Until those takes exist,
the video uses local Kokoro stand-ins (`af_heart` and `am_michael`), so the split and timing can already be
reviewed. `src/narration/manifest.json` records which voice each scene currently uses.

Scenes time their animations from the cue and word timings in the manifest (`cue()` / `cueWord()` in
`src/timeline.ts`). Swap the voice, regenerate, render: everything re-syncs and scene lengths adapt.

### Voice-clone takes (ElevenLabs)

1. `elevenlabs_takes` in `script.json` lists, per scene, each part's speaker and the exact prompt, including audio
   tags and IPA for "Lotte". Generate every part with `eleven_v4` and that speaker's clone. Four variations per part
   let the importer keep the best one.
2. Save the takes as `<scene>.<n>.mp3`. A scene that switches speaker (only the outro: part 1 Artiom, part 2 Rufina)
   uses `<scene>.p<k>.<n>.mp3`.
3. Import, then render:

   ```bash
   uv run demo/scripts/import_takes.py path/to/takes \
       --scenes hook problem reveal grading applicability triage routing voice verified team outro \
       --label "ElevenLabs eleven_v4 · Rufina & Artiom voice clones"
   npm run render
   ```

   For every part, the importer transcribes each take with Whisper and keeps the one closest to the script. It then
   places each cue and word from the timestamps, joins the parts, and marks the scene `locked`.

In a Claude session with the ElevenLabs connector, "generate and import the voice-clone takes" covers steps 1–3.

### Per-cue synthesis

Fully scripted. It skips `locked` scenes unless they are named with `--only`.

```bash
npm run narration                                                    # Kokoro stand-ins, local, no key
ELEVENLABS_API_KEY=... npm run narration -- --engine elevenlabs --voices rufina=<voice_id> artiom=<voice_id>
# other options: --model eleven_multilingual_v2 · --speed 1.05 · --only grading triage
```

Spellings like "Trust Label" or "Lot-tuh" in `text` only steer Kokoro's pronunciation; `text_elevenlabs` overrides
the text for ElevenLabs.

## Team photos

Put the photos in `public/team/` (square-ish JPG/PNG, at least 600×600) and reference them in `src/team.json`,
adding roles and any other team members:

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
