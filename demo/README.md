# TrustLabel demo video

A narrated, ~3:38 product video of TrustLabel, built with [Remotion](https://www.remotion.dev) (React → MP4).
Rendered output: `out/trustlabel-demo.mp4` (1920×1080, 30 fps).

Nothing on screen is made up: every grade, score, reason, expert ranking, trust overview and answer, including the
Teams answer over MCP, comes from the real app, snapshotted in `src/data/demo-data.json` by running the README demo
path against the API (2026-09-30). Ellen's voice note transcript is ElevenLabs Scribe's real output for her take
(it spells the client "Van Damme"; the rules only check the quote). The trycloudflare hostname is the live demo's address when the
video was made; a quick tunnel gets a new one on every start (`MCP_URL` in `src/scenes/Teams.tsx`).

## Storyline

| # | Scene | Shows |
|---|---|---|
| 1 | Hook | Van Dam Logistics asks Lotte for the overtime cut-off, urgently |
| 2 | Problem | Search finds 3 documents (20th / 22nd / 15th); Teams says 25th |
| 3 | Reveal | TrustLabel: "Search finds it. TrustLabel shows whether you can rely on it." |
| 4 | Sign-in & trust overview | "Continue with Google" (OpenID Connect, PKCE), then the Van Dam overview: 1 of 3 topics safe, knowledge debt flagged |
| 5 | Trust label | DOC-BE-009 graded live: base 75, −20 owner left, −15 review overdue, superseded → F |
| 6 | Applicability | A grade-C Dutch procedure is still not applicable to a Belgian client |
| 7 | Conflict triage | Sources sorted into other country / outdated / chat-only exception → "Don't act yet" |
| 8 | Expert routing | Ellen scores 9; Pieter (not on the client team) and Marc (left) excluded; request sent |
| 9 | Verify by voice | Ellen's voice note → ElevenLabs Scribe → OpenAI → rules check the quote → Ellen confirms |
| 10 | Verified answer | 25th, grade A for Van Dam; "Belgium — all clients" still 20th (B) |
| 11 | Microsoft Teams | A Copilot Studio agent calls `ask_trustlabel` over MCP, with Lotte's own key and permissions |
| 12 | Deployment & security | Cloudflare Tunnel to public HTTPS; Aikido checks passing; hashing, sessions, rate limits, CSP |
| 13 | Team | Rufina Chyhohidze and Artiom Varvarenko, and the ElevenLabs voices behind the narration |
| 14 | Outro | AI reads. Rules judge. Humans verify. |

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

Two narrators and one voice note. Every cue in `src/narration/script.json` has a `speaker`:

| Speaker | Scenes |
|---|---|
| **Rufina** (female) | hook, problem, reveal, sign-in & overview, verify by voice, verified answer, "Hi, I'm Rufina", the voice-clone line, "Humans verify. TrustLabel." |
| **Artiom** (male) | trust label, applicability, conflict triage, expert routing, Microsoft Teams, deployment & security, "And I'm Artiom", "AI reads. Rules judge." |
| **Ellen** (the fictional expert) | her voice note in "verify by voice" |

The narration is Rufina's and Artiom's **ElevenLabs voice clones** on `eleven_v4` (voice IDs `IKjOL6DF5xUQMihsrDMj`
and `tZYHx3XprsArEZVsdYKX`). Ellen's voice note uses the ElevenLabs library voice "Laura Peeters - Flemish accent"
(`gC9jy9VUxaXAswovchvQ`), and the transcript on screen is what ElevenLabs Scribe (`eleven_scribe_v1`) made of it.
Surnames appear on screen only, not in the voice-over. The local Kokoro voices (`af_heart`, `am_michael`,
`bf_emma`) remain as stand-ins for drafting new lines without a key. `src/narration/manifest.json` records which
take each scene uses.

Scenes time their animations from the cue and word timings in the manifest (`cue()` / `cueWord()` in
`src/timeline.ts`). Swap the voice, regenerate, render: everything re-syncs and scene lengths adapt.

### Voice-clone takes (ElevenLabs)

1. `elevenlabs_takes` in `script.json` lists, per scene, each part's speaker and the exact prompt, including audio
   tags and IPA for "Lotte". Generate every part with `eleven_v4` and that speaker's clone. Four variations per part
   let the importer keep the best one.
2. Save the takes as `<scene>.<n>.mp3`. A scene that switches speaker (voice, team and outro) is split into parts,
   one per speaker run: `<scene>.p<k>.<n>.mp3`.
3. Import, then render:

   ```bash
   uv run demo/scripts/import_takes.py path/to/takes \
       --scenes hook problem reveal overview grading applicability triage routing voice verified teams ship team outro \
       --label "ElevenLabs eleven_v4 · Rufina & Artiom voice clones (Ellen: library voice)"
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
{"name": "Artiom Varvarenko", "role": "Engine & API", "photo": "artiom.jpg", "speaker": "artiom"}
```

Members without a photo get an initials avatar. `speaker` lights up a member's avatar while their voice is
talking. Up to ~5 fit on one row.

## Changing the look (e.g. after a UI redesign)

The app's UI is rebuilt as React components rather than screenshots, so it stays sharp and animatable:

- `src/theme.ts` has the colours (mirrors `static/styles.css`) and the fonts: Geist, Geist Mono and Instrument
  Serif, self-hosted in `public/fonts/` (SIL OFL 1.1), as in the app.
- `src/components/` holds the grade tile, the energy-label ladder, source and verdict cards, reason badges, the app
  header, ask bar and trust-overview cards, and the cursor.
- `src/scenes/` holds one file per scene.

Restyle the components and every scene follows. Keep JSX out of module top level (constants, lookup tables): with
TypeScript 7 Remotion's bundler falls back to the classic JSX transform, and `React` only exists once rendering
starts, so module-level JSX fails with "React is not defined".

## Regenerating assets

```bash
npm run data     # re-snapshot the engine's answers (after changing data/*.json or the rules)
npm run audio    # re-synthesise sound effects and the music bed (procedural, no licences needed)
```
