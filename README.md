# TrustLabel

## [Open the live demo →](https://wage-deputy-practices-represents.trycloudflare.com)

Runs on a team laptop through a Cloudflare Tunnel. Sign-in required: demo accounts are not published in this repo.

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
- **Trust overview.** Before anyone asks, the Ask page shows each topic's verdict for the chosen client or country,
  the grade mix of current sources, knowledge debt (orphaned, overdue or superseded sources and their owner) and
  recent verifications. It refreshes every 15 s and tells a requester when their expert has answered.
- **Microsoft Teams over MCP.** TrustLabel is a remote MCP server (`POST /mcp`, Streamable HTTP) with the tools
  `ask_trustlabel`, `request_verification` and `capture_teams_message`. Add it to a Copilot Studio agent published
  in Teams: same grades, reasons, expert routing and client scoping as the web UI, under the user's own permissions.
- **Google sign-in (optional).** OpenID Connect code flow with PKCE, state and nonce; only allow-listed, verified
  Google emails mapped to a TrustLabel user can sign in. Password login stays.

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
from Google sign-in and the trust overview to verifying by voice, the Teams agent over MCP, and the Cloudflare
Tunnel deployment. It is made with Remotion from the app's real output and narrated by Rufina and Artiom's ElevenLabs
voice clones. See [`demo/README.md`](demo/README.md) to render it (`cd demo && npm install && npm run render`),
re-voice it, or add the team's photos.

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

**Connect Microsoft Teams.** Serve TrustLabel over public HTTPS (below). In TrustLabel, *Microsoft Teams → Connect
Teams* shows the MCP URL and a personal key (shown once, 8 h). In Copilot Studio: agent → Tools → Add a tool → New
tool → Model Context Protocol → URL `https://<host>/mcp`, authentication *API key*, header `X-API-Key`; publish to Teams.

**Google sign-in.** Create an OAuth web client with redirect URI `<base>/api/auth/google/callback`
(`http://127.0.0.1:8000/…` locally), then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`TRUSTLABEL_GOOGLE_ACCOUNTS=you@example.com=lotte` and, behind a proxy, `TRUSTLABEL_PUBLIC_URL`.

**Public URL (Cloudflare Tunnel).** Secure cookies on, and trust the tunnel's client-IP header:

```bash
TRUSTLABEL_COOKIE_SECURE=1 TRUSTLABEL_BEHIND_PROXY=1 uv run --env-file .env main.py
cloudflared tunnel --no-autoupdate --url http://127.0.0.1:8000   # prints https://<name>.trycloudflare.com
```

## Security

- Per-user passwords, stored only as scrypt hashes in the gitignored `.credentials.json`; nothing secret is in the
  repo. Unknown users are checked against a dummy hash (no username timing oracle).
- Server-side sessions: a random session id in a signed, `HttpOnly`, `SameSite=Strict` cookie (8 h); logout revokes
  it on the server. A new session id on every login.
- CSRF: SameSite=Strict plus an `Origin` check on every state-changing request.
- Login rate limits: 5 failures per username and IP, and 30 failures per IP across usernames, per 5 minutes; the
  server ignores `X-Forwarded-For` unless `TRUSTLABEL_BEHIND_PROXY=1`, and then trusts it only from 127.0.0.1
  (a local tunnel); concurrent scrypt checks are capped. AI budget: 20 voice/capture calls per user per hour.
- Teams/MCP keys are random, stored only as a SHA-256 hash, one per user, expire after 8 h and can be revoked; they
  never work as a session cookie, and every tool call runs with that user's permissions (60 calls per 10 minutes).
- Google sign-in uses a signed 10-minute flow cookie (state, nonce, PKCE verifier) and checks the ID token's issuer,
  audience, expiry, nonce and `email_verified`; errors never echo provider text.
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
stubbed), the trust overview, the MCP server and Google sign-in (token exchange stubbed).

## Unfinished

- State is in memory: a restart resets requests and verified answers. Data is synthetic and fictional.
- Teams reaches TrustLabel through MCP, but sources still load from `data/*.json` (no SharePoint/Teams ingestion).
- The public URL is a Cloudflare quick tunnel to a laptop: no uptime guarantee, and each restart gets a new hostname.
- Topic matching is keyword-based over three demo topics.
