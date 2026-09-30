# TrustLabel

**Search finds it. TrustLabel shows whether you can rely on it.**

Built for the SD Worx challenge of the Tectonic Hackathon 2026 preselection (30 Sep 2026).
An urgent customer question comes in. An assistant finds three documents: one recently updated, one without an owner,
one that may apply to another country. A colleague then shares contradictory information from a Teams chat.
The employee has found information but still cannot act with confidence. TrustLabel is the trust layer under
whatever search or assistant SD Worx already uses; it is not another assistant.

## What it does

- **Trust label per source.** Every source gets an A–G grade, styled like the EU energy label, and every point of
  that grade is explained ("Owner left SD Worx", "Review overdue by 577 days", "Superseded by …").
- **Applicability, separate from quality.** A good Dutch procedure is still *not applicable* to a Belgian client.
  Sources are checked against the asker's country, client and date.
- **Conflict triage.** Disagreements are sorted into other country, outdated/superseded, client-specific exception
  (claimed only in chat, or formally overridden) and true conflict. The answer says *use*, *use with caution* or
  *don't act yet*.
- **Expert routing.** Remaining doubt goes to the best-qualified active expert (client lead, listed expertise, owner
  of the evidence, same country); client-specific questions only go to that client's team. The request is
  pre-packaged with the competing values and their grades.
- **Verified answers.** The expert's confirmation becomes an expiring, grade-A answer for everyone asking in that
  context, and only in that context (a Van Dam exception never leaks into "Belgium — all clients").
- **Verify by voice.** The expert answers with a short voice note: ElevenLabs Scribe transcribes it, OpenAI
  structured outputs extract value, valid-until and a verbatim quote, the form is prefilled and the expert confirms.
- **Capture from chat.** Paste a Teams message; OpenAI extracts claims, the server keeps only claims whose quote
  appears verbatim and states the value, and the rules grade and conflict-check it instantly.

**AI reads, rules judge, humans verify.** No model ever assigns a grade or answers a question.

### Grading rules (`trustlabel/engine.py`)

| Rule | Effect |
|---|---|
| Base by kind | policy 80 · procedure 75 · FAQ 65 · Teams message 60 · verified answer 95 |
| No owner, or owner left | −20 |
| Review overdue / due within 30 days | −15 / −5 |
| Chat message older than 90 days | −10 |
| Client exception claimed only informally | −10 on the general sources |
| True conflict (same scope, different value) | −15 |
| Corroborated by a source from another author | +10 |
| Confirmed by an expert verification | +15 |
| Superseded by a newer source | grade capped at F |
| Contradicted by an expert verification | grade capped at G |
| Grade thresholds | A ≥ 95 · B ≥ 80 · C ≥ 70 · D ≥ 60 · E ≥ 50 · F ≥ 40 · G < 40 |

A client-specific formal source (policy, procedure or verified answer) overrides the general rule for that client only.

## Demo video

[`demo/out/trustlabel-demo.mp4`](demo/out/trustlabel-demo.mp4) is a narrated walkthrough of the demo path below,
made with Remotion from the engine's real output and narrated by two voices, Rufina and Artiom. See
[`demo/README.md`](demo/README.md) to re-render it, voice it with the ElevenLabs voice clones, or add the team's photos.

## Run it

Requires [uv](https://docs.astral.sh/uv/).

```bash
uv sync
cp .env.example .env        # set TRUSTLABEL_SECRET_KEY (e.g. `openssl rand -hex 32`);
                            # TRUSTLABEL_COOKIE_SECURE=0 for plain-http localhost
uv run python -m trustlabel.credentials   # prints one random demo password per user, once
uv run --env-file .env main.py            # then open http://127.0.0.1:8000
```

Users: `lotte`, `jonas` (consultants); `ellen`, `pieter`, `anke`, `sanne` (experts).
"Answer by voice" appears when both `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` are set; "Capture a Teams message"
needs `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-6-luna`; any model with Structured Outputs support can be set.

Demo path: log in as lotte → context "Van Dam Logistics NV (BE)" → ask *"What's the cut-off for submitting overtime
this month?"* → "Don't act yet: 20th (C) vs 25th (D)" → "Ask Ellen to verify". Log in as ellen in a private window →
Verification inbox → resolve (by voice or form). Lotte asks again → 25th, grade A, verified by Ellen.
"Belgium — all clients" still answers 20th (B).

## Security

- Per-user passwords, stored only as scrypt hashes in the gitignored `.credentials.json`; nothing secret is in the
  repo. Unknown users are checked against a dummy hash (no username timing oracle).
- Server-side sessions: a random session id in a signed, `HttpOnly`, `SameSite=Strict` cookie (8 h); logout revokes
  it on the server. A new session id on every login.
- CSRF: SameSite=Strict plus an `Origin` check on every state-changing request.
- Login rate limits: 5 failures per username and IP, and 30 failures per IP across usernames, per 5 minutes; the
  server ignores `X-Forwarded-For`, and concurrent scrypt checks are capped. AI budget: 20 voice/capture calls per
  user per hour.
- Authorization: client-specific knowledge is only visible to that client's team, and verification requests for a
  client only go to experts on that client's team; the verifier is chosen by the server, never by the client; only
  the assigned expert can resolve or answer by voice (others get 404, same as a missing id); a context can only be
  asked about for clients in your own portfolio.
- Input limits: 3 MB request cap, 2 MB audio-only uploads, strict request schemas (`extra="forbid"`), validation
  errors never echo input back.
- LLM output is never trusted: the topic, the value range, a verbatim quote from the input and that the quote states
  the value are all checked server-side. A model never decides who can see a claim (a capture takes the scope of the
  context it was made in). A voice statement is only shown to the requester, and kept as evidence, once the expert
  confirms the value it states.
- Strict CSP (`script-src 'self'`, no inline code), `nosniff`, `frame-ancestors 'none'`, no `innerHTML` in the UI,
  no API docs endpoints, `Cache-Control: no-store` on API responses. Fonts (Geist, Geist Mono, Instrument Serif;
  SIL OFL 1.1) are self-hosted in `static/fonts/`, so no third-party requests leave the browser.

## Tests

```bash
uv run pytest -q
```

Engine rules on the demo dataset (conflict triage, scoping of verified answers, caps, gaps), plus API tests for
authentication, authorization, request guards, rate limiting, session revocation, voice and capture (AI services
stubbed).

## Unfinished

- State is in memory: a restart resets requests and verified answers. Data is synthetic and fictional.
- No SharePoint/Teams/M365 connectors; sources are loaded from `data/*.json`.
- No owner-facing "knowledge debt" dashboard (orphaned and overdue sources are only visible per question).
- Topic matching is keyword-based over three demo topics.
