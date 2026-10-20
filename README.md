# TrustLabel

## [▶ Watch the demo video](https://vimeo.com/1231811162/d3b1beb1b5) · [Open the live demo →](https://trustlabel-lpbw.onrender.com)

### Test logins: `lotte` / `DDLokxtZlPuvx9vh` (consultant) · `ellen` / `JLLzQlsJHBa1yZ8V` (expert)

Render free plan, shared accounts: it sleeps after 15 idle minutes; waking takes about a minute and resets the data.

[![TrustLabel demo video on Vimeo](https://i.vimeocdn.com/filter/overlay?src0=https%3A%2F%2Fi.vimeocdn.com%2Fvideo%2F2207060175-8f213a435c638d217f73ca8e53ce1a5c52781fc5aaffb373f374add5d18df633-d_640%3Fregion%3Dus&src1=http%3A%2F%2Ff.vimeocdn.com%2Fp%2Fimages%2Fcrawler_play.png)](https://vimeo.com/1231811162/d3b1beb1b5)

**Search finds it. TrustLabel shows whether you can rely on it.**

Built for the SD Worx challenge of the Tectonic Hackathon 2026 preselection (30 Sep 2026).
An urgent customer question comes in. An assistant finds three documents: one recently updated, one without an owner,
one that may apply to another country. A colleague then shares contradictory information from a Teams chat.
The employee has found information but still cannot act with confidence. TrustLabel is the trust layer under
whatever search or assistant SD Worx already uses; it is not another assistant, and not another app to open.

It works inside the channels SD Worx already uses: an **Outlook** add-in next to the client's email, an internal
comment on new **Salesforce Service Cloud** cases (the platform behind MyServicePoint), **Microsoft Teams** through
MCP, and optionally a **Spott** workspace. Talkdesk is reached through Salesforce and Teams, which it already
connects to. The web app remains for experts (verification inbox) and setup (Integrations page).

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
- **Capture from chat, email, meetings and calls.** Paste a Teams message, an email, a meeting summary (e.g. a Teams
  recap), phone call notes or another note (up to 4,000 characters) and pick its type; OpenAI extracts claims, the
  server keeps only claims whose quote appears verbatim and states the value, and the rules grade and conflict-check
  it instantly. The type sets the source's kind, label and source line (e.g. "Meeting summary", "Teams meeting ·
  summary captured via TrustLabel") and its base score: Teams message 60, email 55, meeting summary and phone call
  50, other note 45.
- **Trust overview.** Before anyone asks, the Ask page shows each topic's verdict for the chosen client or country,
  the grade mix of current sources, knowledge debt (orphaned, overdue or superseded sources and their owner) and
  recent verifications. It refreshes every 15 s and tells a requester when their expert has answered.
- **Outlook add-in.** Open a client email → TrustLabel shows the client, the label, up to three current sources and
  the best verifier. "Reply with this" (or "Send holding reply" when the answer is *don't act yet*) opens Outlook's
  reply form prefilled; it never sends. "Ask <expert>" creates a verification request. "Add this email as a source"
  (`POST /api/v1/capture`) sends the email to the claim extractor for the detected or chosen client; claims whose quote
  appears word for word are stored as an email source (title: the subject; source line: "Email · from <sender>")
  and shown with their grades. Unlike the brief, this stores the email text (subject and body, first 4,000
  characters), because the user clicked to add it. Needs `OPENAI_API_KEY`; 422 when no claim is verifiable.
- **Salesforce cases.** New cases are polled every 15 s and get an internal case comment (never visible to the
  client) with the label, sources, verifier and a suggested reply. The client comes from the case's account, else the
  sender's email domain or a client name in the case text; if it can't tell, the comment says "Don't act yet" without
  a value.
- **Salesforce closed cases and logged calls as sources.** In the same 15 s cadence, closed cases (subject,
  description, case comments) and calls logged as Tasks with `TaskSubtype = 'Call'` (how Talkdesk and other phone
  systems log calls; subject and call notes) become graded sources (`salesforce_case`, `phone_call`), scoped to the
  client and its country. Only verbatim-quoted claims are kept. See "Connect Salesforce" below.
- **Microsoft Teams over MCP.** TrustLabel is a remote MCP server (`POST /mcp`, Streamable HTTP) with the tools
  `ask_trustlabel`, `request_verification` and `capture_source` (optional `kind`: `teams_message`, `email`,
  `meeting_summary`, `phone_call` or `note`). Add it to a Copilot Studio agent published
  in Teams: same grades, reasons, expert routing and client scoping as the web UI, under the user's own permissions.
- **Spott, both ways.** [Spott](https://www.gospott.com) is an AI-native recruitment CRM. A note on a Spott client
  record, typed or written by Spott's Note Taker, reaches TrustLabel through a signed webhook. TrustLabel fetches it,
  keeps only the claims it states verbatim, scopes them to that client and grades them like a chat message. When an
  expert verifies an answer for a client, it goes back onto that client's Spott record as a note. Nobody maintains a
  document.
- **Google sign-in (optional).** OpenID Connect code flow with PKCE, state and nonce; only allow-listed, verified
  Google emails mapped to a TrustLabel user can sign in. Password login stays.

**AI reads, rules judge, humans verify.** No model ever assigns a grade or answers a question.

### Grading rules (`trustlabel/engine.py`)

| Rule | Effect |
|---|---|
| Base by kind | policy 80 · procedure 75 · FAQ 65 · Teams message 60 · Spott note 60 · meeting transcript 55 · verified answer 95 |
| No owner, or owner left | −20 |
| Review overdue / due within 30 days | −15 / −5 |
| Chat message, Spott note or meeting transcript older than 90 days | −10 |
| Client exception claimed only informally | −10 on the general sources |
| True conflict (same scope, different value) | −15 |
| Corroborated by a source from another author | +10 |
| Confirmed by an expert verification | +15 |
| Superseded by a newer source | grade capped at F |
| Contradicted by an expert verification | grade capped at G |
| Grade thresholds | A ≥ 95 · B ≥ 80 · C ≥ 70 · D ≥ 60 · E ≥ 50 · F ≥ 40 · G < 40 |

A client-specific formal source (policy, procedure or verified answer) overrides the general rule for that client only.

### Internal knowledge and personal data

TrustLabel also grades SD Worx's own informal knowledge, not just client procedures. The seed data has the
"four car policies" case for `mobility.car_lease_budget` (amounts in whole euros, shown as "€750 per month"):

- the 2023 Belgian car policy (€650): superseded, grade F;
- the 2025 Dutch policy (€700): applies to the Netherlands only;
- the 2025 Belgian policy (€750, owned by Sofie Verhaegen, Fleet & Mobility Manager BE, reviewed in August 2026),
  backed by the new-joiner FAQ;
- a Teams message claiming €800 "since the town hall";
- the town-hall transcript, which says €800 only *from 1 January 2027*, so it is not effective yet.

Asking "What is my company car lease budget?" for Belgium gives "Don't act yet": €750 (C) vs €800 (F). Sofie is the
top expert, as listed expert and owner of the current policy.

Questions about another person's pay, health, performance review or private address (EN/NL/FR, e.g. "How much
does my colleague earn?", "Wat verdient Jonas?", "Is Jonas sick?") are refused before any topic matching, on the web,
by voice and through the Teams MCP tools. The refusal shows no sources and names who decides instead (Anke Claes, HR
Policy Officer BE). Policy questions such as "When is the sick certificate due?" still get answered. The rules are
in `trustlabel/guard.py`.

### Meetings and phone calls (ElevenLabs Scribe)

Meeting recordings become sources without anyone typing them up (`trustlabel/meetings.py`). Upload one on the
Integrations page ("Recordings · ElevenLabs Scribe", or `POST /api/meetings`, multipart field `recording`; mp3, m4a,
wav, webm, ogg or mp4, max 25 MB; only this path accepts bodies above the 3 MB limit), or set
`TRUSTLABEL_MEETINGS_DIR` and `TRUSTLABEL_MEETINGS_OWNER` to watch a folder, e.g. Teams meeting recordings synced from
OneDrive/SharePoint. The watcher scans every 15 s and handles each file once (name + size + mtime), after its size
has held across two scans. Scribe transcribes with speaker diarization ("Speaker 1: …"). The existing extractor reads
the first 12,000 characters, and only claims quoted verbatim survive. They become one item of kind `meeting` per
recording, titled "Meeting · {name} · {date}", owned by the uploader (or the folder owner, in their country), and
graded against existing knowledge like any capture. Processing runs in the background, one recording at a time;
`GET /api/meetings` lists your recordings as queued, transcribing, done or failed, with the claim count, item id and
error class. A recording without a verbatim claim ends as done with 0 claims and adds no item.

Phone call recordings go through the same pipeline. Pick "Phone call" in the upload form's Type select (form field
`kind` = `meeting` | `phone_call`, default `meeting`; anything else is a 422), or drop the file in a `calls/`
subfolder of `TRUSTLABEL_MEETINGS_DIR`. A call becomes an item of kind `phone_call`, titled
"Call · {name} · {date}", with source "Phone call · recording (Scribe transcript)"; the job list shows the type.

Live check (port 8014): a TTS two-voice recording, "From January the company car lease budget for consultants goes
up to 800 euros per month", was transcribed as two speakers ("…eight hundred euros per month"), stored as a meeting
item claiming €800 (grade E), and made the car-budget answer a conflict, €750 (C) vs €800 (E). A recording dropped in the
watched folder ("Meal voucher orders close on the 8th…") became an item for the folder owner on the next scans.

Call live check (in-process, real Scribe and OpenAI): a TTS two-voice call, "employees must hand in the medical
certificate within three working days of falling ill", uploaded as a phone call, became a `phone_call` item claiming
3 working days (grade E), quoting "within three working days"; the sick-certificate answer listed it next to the
2-day Dutch procedure (C).

## Demo video

[Watch it on Vimeo](https://vimeo.com/1231811162/d3b1beb1b5). The Remotion project in [`demo/`](demo/) renders a narrated
walkthrough of the demo path from the engine's real output; [`demo/README.md`](demo/README.md) covers voices and photos.

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
"Answer by voice" appears when both `OPENAI_API_KEY` and `ELEVENLABS_API_KEY` are set; "Capture a source"
needs `OPENAI_API_KEY`. `OPENAI_MODEL` defaults to `gpt-6-luna`; any model with Structured Outputs support can be set.
`main.py` logs TrustLabel's own INFO events (Salesforce cases briefed, Spott notes captured, Teams alerts sent, Outlook
brief outcomes as sizes and detected client/topic only, never email content); third-party loggers stay at WARNING.

Demo path: log in as lotte → context "Van Dam Logistics NV (BE)" → ask *"What's the cut-off for submitting overtime
this month?"* → "Don't act yet: 20th (C) vs 25th (D)" → "Ask Ellen to verify". Log in as ellen in a private window →
Verification inbox → resolve (by voice or form). Lotte asks again → 25th, grade A, verified by Ellen.
"Belgium — all clients" still answers 20th (B).

**Integrations page.** The third tab in the web app holds everything a channel needs: your personal key (*Personal
key*, shown once, 8 h, used by Teams and Outlook), the Teams MCP URL, the Outlook manifest URL with install steps,
Salesforce status (domain, last checked, cases briefed, sources sync on/off and sources added, last error), the Spott
workspace and how Talkdesk is reached.
Users listed in `TRUSTLABEL_ADMINS` (comma-separated user ids, e.g. `lotte`) can connect, replace or disconnect a
Spott workspace there with an API key and an optional `whsec_…` signing secret; the key is checked against Spott and
clients are matched by name.

**Connect Microsoft Teams.** Serve TrustLabel over public HTTPS (below). Integrations shows the MCP URL and the
personal key. In Copilot Studio: agent → Tools → Add a tool → New
tool → Model Context Protocol → URL `https://<host>/mcp`, authentication *API key*, header `X-API-Key`; publish to Teams.

**Teams expert alerts** (`trustlabel/teams_alerts.py`). When a verification request is created from any channel (web
app, Teams over MCP, Outlook via `POST /api/v1/verifications`), TrustLabel posts an Adaptive Card to a Teams workflow
webhook in a background thread; one alert per new request, none when an open request is asked again. The card
@mentions the routed expert (the same expert and reasons the requester saw), e.g. "@Ellen Maes, Lotte Janssens asks
you to verify the payroll variables cut-off for Van Dam Logistics NV (BE).", lists Question, "Sources say" (each
competing value once, with its best grade) and "Why you", and has an "Answer in TrustLabel" button to
`<TRUSTLABEL_PUBLIC_URL>/?view=inbox`, which opens the Verification inbox. The payload is the Teams webhook message
shape (`type: message`, `attachments[0].contentType = application/vnd.microsoft.card.adaptive`) plus a top-level
`recipient` with the expert's Teams address. Setup (work/school account, non-premium): create a flow from the
"Send webhook alerts to a chat" template (Power Automate or the Teams Workflows app). In its "Post card in a chat or
channel" step (inside For each) set Post in = "Chat with Flow bot", Recipient = your address, and Adaptive Card =
expression `item()?['content']` (changing Post in clears that field). Save, then copy the HTTP URL from the trigger
"When a Teams webhook request is received". Then set:

- `TEAMS_WORKFLOW_URL`: the workflow's webhook URL (secret; only https on port 443 to a host ending in
  `.logic.azure.com` or `.api.powerplatform.com`, anything else stops startup).
- `TRUSTLABEL_TEAMS_USERS`: comma-separated `user_id=name@company.com` pairs mapping TrustLabel users to Teams sign-in
  addresses (unknown user ids stop startup). Experts without an address are named in plain text, without @mention.
- `TRUSTLABEL_PUBLIC_URL`: needed for the button; without it the card has no button.

Verified live on 20 October 2026 in a university Microsoft 365 tenant with that setup: the card arrived from the
Workflows bot with the @mention, the drafted question, "Sources say", "Why you", and a working "Answer in TrustLabel"
button. With the template's default Post in = "Group chat" and no real group chat selected, the flow run fails with
NotFound. To route each card to the expert TrustLabel picked, set Recipient to the expression
`triggerBody()?['recipient']`. The URL is never logged or shown; failures are logged as
`Teams alert for <request id> failed: <ExceptionClass>`. Integrations shows "Expert alerts: On … (N mapped)" or
"Off: set TEAMS_WORKFLOW_URL and TRUSTLABEL_TEAMS_USERS".

**Teams: verified-answer alerts.** When the expert resolves a request (inbox or Teams, below), the same workflow gets
a second card in the same background pool, one per resolve, for the requester and the followers of every request it
closes (the expert excluded), e.g. "@Lotte Janssens, Jonas Wouters, Ellen Maes verified the payroll variables cut-off
for Van Dam Logistics NV (BE): 25th of the month (grade A)", the expert's note if any, and an "Open in TrustLabel"
button to `<TRUSTLABEL_PUBLIC_URL>/?view=ask`. People with a `TRUSTLABEL_TEAMS_USERS` address are @mentioned and the
first of them is the payload's `recipient`; the rest are named in plain text. With Recipient fixed to one address in
the flow, every card goes to that chat. Failures are logged by exception class only.

**Teams: answer from a channel** (`POST /api/teams/outgoing`). Uses a Teams Outgoing Webhook: no Graph admin consent,
no premium connector. A team owner opens the team → Manage team → Apps → "Create an outgoing webhook", names it
`TrustLabel`, sets the callback URL to `<TRUSTLABEL_PUBLIC_URL>/api/teams/outgoing` (public https), and copies the
security token Teams shows once. Every request card then ends with "Or reply in Teams: @TrustLabel TL-7F2K <your
answer>" (a 4-character code derived from the request id). In a channel of that team the expert posts
`@TrustLabel TL-7F2K 25th per contract addendum`. TrustLabel checks `Authorization: HMAC …` (HMAC-SHA256 of the raw
body with the base64-decoded token, constant-time compare; body max 64 KB), strips the mention and HTML, and maps the
sender's `aadObjectId` to a user. The value is the longest leading 1–3 words the topic accepts (same `validate_value`
as the inbox; "25th" counts as 25), the rest is the note (max 500 characters), and it is valid for 180 days, the
inbox's default. Only the assigned expert can answer; the answer goes through the inbox's resolve path, so the
verified answer, the Spott note and the asker's card are the same. The reply in the thread says what was verified,
or why not (unknown code, not your request, already answered, invalid value). An unmapped sender gets their
aadObjectId and how to map it. Set:

- `TEAMS_OUTGOING_SECRET`: the outgoing webhook's security token (base64; anything else stops startup). Without it
  the endpoint returns 404 and the cards have no reply line.
- `TRUSTLABEL_TEAMS_IDS`: comma-separated `user_id=<aadObjectId>` pairs (Entra object ids; unknown user ids stop
  startup). Easiest: post `@TrustLabel hi` once; the reply contains your aadObjectId.

Outgoing webhooks only work in team channels (not chats), so the expert reads the alert in the Flow bot chat and
answers in the team's channel.

**Auto-ask and drafted questions** (`trustlabel/claude.py`). When an answer says "Don't act yet" (sources conflict or
nothing applies), TrustLabel asks the routed expert itself: the Ask view has a toggle "Ask the owner automatically"
(on by default, stored in `localStorage` as `tl.autoAsk`) that sends `auto_ask` with `POST /api/ask`. The result then
carries `auto_request` and the page shows "TrustLabel asked {expert} for you" with the question and its status. A safe
answer never asks. If any colleague already has an open request for the same topic and context, it is reused (you
follow it and it shows in your inbox) instead of asking the expert twice. With the toggle off, the "Ask {expert} to
verify" button stays and shows the question it sent. Every request, from any channel, gets a drafted question in
`Verification.question` (shown in the Teams alert and the expert's inbox); the requester's own words stay in
`asked` ("Asked: …" in the inbox when they differ). With `ANTHROPIC_API_KEY` set, Claude (`ANTHROPIC_MODEL`, default
`claude-haiku-5-5`, Messages API, 15 s timeout) drafts one neutral question naming the context, the
topic and each competing value with its source title and grade. The draft is kept only if it is one line, at most 300
characters, names every value and adds no number that is not in those facts. Otherwise, or without a key, a template
is used: *"Which is right for {context}: {topic} {value} ({source}, grade X) or {value} ({source}, grade Y)?"* or, for
a gap, *"What is the {topic} for {context}? No current source covers it."* Failures are logged by exception class only.

**Chat with voice** (`trustlabel/voice.py`, Chat tab, `/?view=chat`). The standalone surface: a conversation thread
over the same answer path as Ask (`ask_for`). Each TrustLabel bubble shows the verdict (Safe to use / Use with caution /
Don't act yet), headline, value, the top 3 sources (title · kind · grade), who can confirm, and the auto-ask request
when one was sent. Personal-data questions get a calm "Not shared" bubble with the person to ask instead; unmatched
questions get tappable topic chips. The context select and the "Ask the expert automatically" toggle (`tl.autoAsk`,
shared with Ask) sit above the text box. **Push-to-talk:** hold the mic (or tap to start, tap to send; max 15 s);
`POST /api/voice/ask` (multipart `audio`, `client_id`, `auto_ask`) transcribes with ElevenLabs Scribe, answers the
transcript exactly like a typed question and returns `{transcript, result, speech}`. `speech` is a template sentence
built only from the graded result, e.g. *"Don't act yet: sources disagree, 20th of the month or 25th of the month.
I've asked Ellen Maes to confirm."* or *"Safe to use: 10th of the month, from …, grade B."*. The browser then calls
`POST /api/voice/speak` `{text ≤ 600 chars}`, which returns `audio/mpeg` (`Cache-Control: no-store`) from ElevenLabs
text-to-speech (`eleven_flash_v2_5`, voice `ELEVENLABS_VOICE_ID`, default premade "Matilda" `XrExE9yKIg1WjnnlVkGX`),
played from a blob URL (CSP `media-src 'self' blob:`). **Hands-free "Hey TrustLabel"** (shown only where the browser
has `SpeechRecognition`): browser speech recognition listens for the wake phrase only; the question is then recorded
until about 1.5 s of silence (AnalyserNode level) or 10 s and goes through the same pipeline. A status line shows
"Listening for …", "Listening — ask your question" or "Answering…", with the disclosure "Wake word uses your browser's
speech recognition". Both endpoints need a session, have per-user hourly budgets (60 voice questions, 120 spoken
answers), accept only `audio/*` uploads up to 2 MB, return 503 without `ELEVENLABS_API_KEY` and 502 (no upstream
body) when ElevenLabs fails. Verified live on a local server: TTS of *"What is the payroll cut-off for Van Dam?"* →
`/api/voice/ask` transcribed it as "What is the payroll cutoff for VanDam?", answered "Don't act yet" (same result as
the typed ask), and `/api/voice/speak` returned MP3; in headless Chromium, push-to-talk with a simulated microphone
produced the same answer bubble.

**Teams channel sync** (`trustlabel/teams_graph.py`). TrustLabel reads Teams channels through Microsoft Graph with
app-only access and turns messages that state a verifiable fact into graded "Teams message" sources. Every 60 s, for
each channel in `TEAMS_SYNC_CHANNELS`, it calls `GET /v1.0/teams/{team}/channels/{channel}/messages/delta`, follows
`@odata.nextLink` pages, and keeps the `@odata.deltaLink` in memory for the next poll. The first round only fetches
messages modified in the last 30 days (`$filter=lastModifiedDateTime gt …`). System events, deleted messages and
messages it has already processed (by id) are skipped. HTML bodies become plain text (stdlib `html.parser`). The
author's UPN and mail come from `GET /v1.0/users/{id}?$select=userPrincipalName,mail` (cached) and are matched against
`TRUSTLABEL_TEAMS_USERS`. A matched author becomes the item's author and sets its country; unknown authors are kept by
display name, marked "(external)" and scoped to every country. The text then goes through the same capture pipeline as
"Capture a source": AI extraction, the server-side verbatim-quote check and grading against existing knowledge.
Only the sentences that hold a kept quote are stored. Messages without such a claim create no item. The source reads
"Teams · {team}/{channel}"; the Item model has no URL field, so the message's `webUrl` is not stored. Setup: register an
app in Entra ID, create a client secret and add the **application** permissions `ChannelMessage.Read.All` and
`User.Read.All` with admin consent. `Team.ReadBasic.All` and `Channel.ReadBasic.All` are also needed to show the team
and channel names; without them the source shows the ids. Then set `MS_TENANT_ID`, `MS_CLIENT_ID`, `MS_CLIENT_SECRET`
(all three or none, otherwise startup stops) and `TEAMS_SYNC_CHANNELS=teamId/channelId,…` (ids from the channel's
"Get link to channel"). Sync also needs `OPENAI_API_KEY` and shares a budget of 60 extractions per hour. The
app token (client credentials, scope `https://graph.microsoft.com/.default`) is cached until 5 minutes before it
expires. Errors are logged by exception class only; tokens and message text are never logged. Integrations → Microsoft
Teams shows "Channel sync" (channels, last check, messages read, sources created) and the required permissions.
Built against the Microsoft Graph documentation and tested with stubs (`tests/test_teams_graph.py`, httpx
MockTransport); it has **not** been verified against a live tenant, which needs an admin to grant consent.

**Connect Salesforce.** In the org: Setup → External Client App Manager → New External Client App. Enable OAuth,
callback URL `https://localhost/callback` (unused), OAuth scope *Manage user data via APIs (api)*, and under Flow
Enablement *Enable Client Credentials Flow*. Then Policies → Edit → OAuth Policies: enable the client credentials
flow and set *Run As* to an API-enabled user (type the full username). Settings → OAuth Settings → Consumer Key and
Secret. Set `SALESFORCE_DOMAIN` (the My Domain host, e.g. `orgfarm-xxxx-dev-ed.develop.my.salesforce.com`),
`SALESFORCE_CLIENT_ID` (consumer key) and `SALESFORCE_CLIENT_SECRET` (all three or none). TrustLabel then polls for
new cases every 15 s and adds an internal comment to those matching a topic; cases that already carry a comment by its
own Salesforce user are skipped, so a restart never comments twice. To turn client emails into cases, enable
Email-to-Case in the org. Verified in a Developer Edition org: a Brightwave overtime cut-off case got "Safe to use:
20th of the month" with sources, verifier and a suggested reply; a Van Dam case got "Don't act yet — sources disagree"
with a holding reply; both comments were internal, and no case was commented twice after a restart.

**Salesforce sources sync** (`SourcePoller` in `trustlabel/salesforce.py`). Runs next to the case poller every 15 s
when Salesforce and `OPENAI_API_KEY` are set. It reads closed cases (`IsClosed = true`) and call Tasks
(`TaskSubtype = 'Call'`) whose `LastModifiedDate` is past a watermark. The first poll looks back 24 h, because the
store is in memory. A case's text is subject, description and its comments, without the ones TrustLabel's own
Salesforce user posted. A call's text is subject and call notes. The client comes from the account name (for calls,
the account, else the related record), else from a client name or the sender domain in the text, the same matching
as the case brief. Records no client matches are skipped (an answer on a case or call is client-specific, so it is
never stored as general knowledge). Titles are `Case <number>: <subject>` and `Call: <subject>`. Ids are deduped in
memory, with a shared budget of 60 extractions per hour. Logs hold ids and counts only.
Verified live in the Developer Edition org on 2026-10-20: the queries ran (0 closed cases, 0 call Tasks before the
demo). Then one synthetic closed case (`500aj00003p7R4bAAE`, "TrustLabel demo: Brightwave meal voucher order
deadline") and one call Task (`00Taj00000NRGGMEA5`) were created on the topic `payroll.meal_vouchers_order`. A one-off
run of the poller with the real OpenAI extractor stored both as Brightwave (BE) sources with value 10. The running
server's own comment on that case was left out of the case text.

**Install the Outlook add-in.** Needs public HTTPS (e.g. the cloudflared tunnel below); without it
`/outlook/manifest.xml` returns 503. In Outlook on the web open https://aka.ms/olksideload → My add-ins → Custom
Addins → Add a custom add-in → Add from URL `https://<host>/outlook/manifest.xml` (or download it and use Add from
File). Open an email → TrustLabel → paste the personal key from Integrations → Personal key. Outside Outlook the pane
(`/static/outlook/taskpane.html`) runs in demo mode: paste a subject and body. Verified live in Outlook on the web
(Outlook.com), sideloaded from the manifest URL: after adding the add-in, reload Outlook (F5); only then does
"TrustLabel" appear under Apps. On the email "Van Dam: overtime this month" it detected the client and showed the
conflict brief with a holding reply. Outlook sends subjects with non-breaking spaces, so client and topic matching
normalise whitespace (`trustlabel/brief.py`). `npx office-addin-manifest validate` reports the manifest as valid.

**Connect Spott.** Set `SPOTT_API_KEY` (from Spott's API settings) to write verified answers back: when an expert
resolves a request for a client, a note titled "TrustLabel · Verified: …" lands on the Spott client with the same name.
To capture notes, serve TrustLabel over public HTTPS, add a Spott webhook for the event `note.created` with URL
`https://<host>/api/integrations/spott/webhook`, and set `SPOTT_WEBHOOK_SECRET` to its `whsec_…` signing secret
(capture also needs `OPENAI_API_KEY`). A quick tunnel works for a demo: `cloudflared tunnel --url
http://127.0.0.1:8000` with `TRUSTLABEL_BEHIND_PROXY=1`. Demo: in Spott, note on "Brightwave Retail BV" *"From now on
meal voucher orders must be in by the 5th of the month."* → lotte, context Brightwave → meal vouchers → the Spott note
(5th) conflicts with the Belgian policy (10th).

**Ask TrustLabel from Spott.** A note whose text starts with `@TrustLabel` or `TrustLabel:` (any case) is a question,
not knowledge: it is never captured. TrustLabel matches the topic by rules (no AI call) and answers for the note's
client with the same service-desk scope as a Salesforce case (general knowledge plus that client's own). The answer
arrives as one reply note "TrustLabel · Answer: …" on the same Spott client, with the verdict, value, top sources with
grades and who can verify. Notes on an unknown client or with no matching topic get a short "client not linked" or
"no matching topic" reply. TrustLabel's own notes are never processed again, and questions share the webhook's
signature check, deduplication and hourly budget. Verified live once: the real workspace key answered a question on
"Van Dam Logistics NV" with one reply note (the question note itself was served locally, not created in Spott).
Demo: in Spott, on "Van Dam Logistics NV", add the note *"@TrustLabel what is the payroll cut-off for overtime?"*.

**Google sign-in.** Create an OAuth web client with redirect URI `<base>/api/auth/google/callback`
(`http://127.0.0.1:8000/…` locally), then set `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`,
`TRUSTLABEL_GOOGLE_ACCOUNTS=you@example.com=lotte` and, behind a proxy, `TRUSTLABEL_PUBLIC_URL`.

**Free deployment (Render).** The live demo is a Render free web service built from this repo with the Render CLI:
`render services create --type web_service --plan free --runtime python --build-command "uv sync --frozen --no-dev"`
with a start command that runs `uvicorn.run(create_app(Settings.from_env()), host="0.0.0.0",
port=int(os.environ["PORT"]), proxy_headers=True, forwarded_allow_ips="*")` under `.venv/bin/python -c`. Secrets:
`.credentials.json` as a secret file (`TRUSTLABEL_CREDENTIALS_FILE=/etc/secrets/credentials.json`), a fresh
`TRUSTLABEL_SECRET_KEY`, the API keys and `TRUSTLABEL_COOKIE_SECURE=1`.

### Channel API

Used by the Outlook pane; any channel can call it with a personal key (`X-API-Key: <key>` or
`Authorization: Bearer <key>`; session cookies are never accepted). 60 calls per 10 minutes per user, shared with MCP.

| Endpoint | Does |
|---|---|
| `GET /api/v1/me` | The key's user and their client portfolio |
| `POST /api/v1/brief` | `{subject, body, sender?, client_id?}` → client (and how it was matched), topic, label, up to 3 current sources, verifier, open request, reply template. Nothing stored, no AI called |
| `POST /api/v1/verifications` | `{topic_id, client_id?, question}` → request id, assigned expert, status (201 new, 200 if one is already open) |
| `POST /api/v1/capture` | `{subject?, sender_name?, sender_email?, body?, client_id?}` → the email as a graded email source (`captured_item_id`, `result` as in the web capture, `claims` with topic, value, quote and grade). Stores the email text (first 4,000 characters); OpenAI extraction counts against the user's AI budget (20 calls per hour); 403 outside the portfolio, 422 no verifiable claim, 503 AI not configured |

## Security

- Per-user passwords, stored only as scrypt hashes in the gitignored `.credentials.json`; only the test logins above
  are published. Unknown users are checked against a dummy hash (no username timing oracle).
- Server-side sessions: a random session id in a signed, `HttpOnly`, `SameSite=Strict` cookie (8 h); logout revokes
  it on the server. A new session id on every login.
- CSRF: SameSite=Strict plus an `Origin` check on every state-changing request.
- Login rate limits: 5 failures per username and IP, and 30 failures per IP across usernames, per 5 minutes;
  concurrent scrypt checks are capped. `main.py` ignores `X-Forwarded-For` unless `TRUSTLABEL_BEHIND_PROXY=1` (then
  only from 127.0.0.1, a local tunnel); the Render deployment takes the client IP from Render's proxy. AI budget: 20
  voice/capture calls per user per hour.
- Teams/MCP keys are random, stored only as a SHA-256 hash, one per user, expire after 8 h and can be revoked; they
  never work as a session cookie, and every tool call runs with that user's permissions (60 calls per 10 minutes).
- Google sign-in uses a signed 10-minute flow cookie (state, nonce, PKCE verifier) and checks the ID token's issuer,
  audience, expiry, nonce and `email_verified`; errors never echo provider text.
- Spott webhooks must carry a valid Standard Webhooks (Svix) HMAC-SHA256 signature, within a 5-minute timestamp
  window; redelivered messages are processed once. The payload supplies only ids: the note is fetched from the Spott
  API. A note counts only if it is linked to exactly one client known by exact name, and that link sets its scope.
  Only the sentences stating a kept claim are stored, never the rest of the note. Note capture shares a budget of 60
  AI calls per hour, and a Spott outage never blocks a verification.
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
- Channels: channel API calls authenticate only with the personal key, and the Outlook pane keeps it in its own
  storage and never uses cookies. Only `/static/outlook/` may be framed, and only by Outlook origins
  (`frame-ancestors`); everything else stays `frame-ancestors 'none'`. Emails sent for a brief are not stored and never
  sent to an AI: rules pick the client (sender domain, or exactly one client name or alias in the text; never a guess)
  and the topic. Only "Add this email as a source" stores an email and sends it to OpenAI, on the user's click.
  Salesforce comments are internal (`IsPublished: false`), and nothing is sent automatically anywhere:
  replies open Outlook's reply form. The Salesforce secret lives only in the environment. The Spott workspace form is
  admin-only, the key is kept in memory only and never echoed back.
- Teams expert alerts: `TEAMS_WORKFLOW_URL` is a secret (the URL is signed), accepted only as https on port 443 to
  `*.logic.azure.com` or `*.api.powerplatform.com`, and never logged or shown in the UI. The card (question, client
  name, competing values, reasons) goes to the customer's own Microsoft 365 tenant.
- Strict CSP (`script-src 'self'`, no inline code), `nosniff`, `frame-ancestors 'none'`, no `innerHTML` in the UI,
  no API docs endpoints, `Cache-Control: no-store` on API responses. Fonts (Geist, Geist Mono, Instrument Serif;
  SIL OFL 1.1) are self-hosted in `static/fonts/`, so no third-party requests leave the browser.

## Tests

```bash
uv run pytest -q
```

Engine rules on the demo dataset (conflict triage, scoping of verified answers, caps, gaps), plus API tests for
authentication, authorization, request guards, rate limiting, session revocation, voice and capture (AI services
stubbed), the trust overview, the MCP server and Google sign-in (token exchange stubbed). The channel and integration
tests run against stubs of the outside services:

- the Outlook pane and Channel API (`test_channels.py`, `test_outlook.py`, `test_email_source.py`)
- Salesforce cases, and closed cases and call logs as sources (`test_salesforce.py`, `test_salesforce_sources.py`)
- Spott notes and questions asked from notes (`test_spott.py`, `test_spott_ask.py`)
- Teams expert alerts, verified-answer cards, answers from a channel, and channel sync (`test_teams_alerts.py`,
  `test_teams_loop.py`, `test_teams_graph.py`)
- auto-ask with Claude drafting (`test_auto_ask.py`)
- chat and voice (`test_voice_chat.py`)
- meetings (`test_meetings.py`)
- the internal-knowledge example and the personal-data guard (`test_internal.py`)
- capture types in the web form and MCP `capture_source` (`test_capture_kinds.py`)

207 tests in total.

## Unfinished

- State is in memory: a restart resets requests and verified answers. Data is synthetic and fictional.
- Teams reaches TrustLabel through MCP; Teams channel sync (Graph) exists but sources otherwise load from
  `data/*.json` (no SharePoint ingestion).
- Teams verified-answer card: verified live on 20 October 2026 (the asker's card arrived in Teams after the expert
  answered). Only users in `TRUSTLABEL_TEAMS_USERS` are @mentioned; with the workflow's fixed Recipient every card
  lands in that one chat.
- Teams answer from a channel (`/api/teams/outgoing`): verified live on 20 October 2026 in a university tenant. A
  student-created team with an outgoing webhook posted "@TrustLabel TL-E3WN 25th per the contract addendum"; the HMAC
  check passed, the request was resolved through the inbox path, TrustLabel replied in the thread and the asker's card
  was sent. Limits: the code lookup scans all requests (fine for the demo), the answer has no date (always 180 days),
  one Teams account maps to one TrustLabel user, and the alert arrives in a Flow bot chat while the answer must be
  posted in a team channel.
- Teams channel sync: not verified against a live Microsoft 365 tenant (needs admin consent). Only top-level channel
  messages are read (replies are not), edits of an already-processed message are ignored, and the delta link and the
  processed ids live in memory, so a restart re-reads the last 30 days (TrustLabel's own captures are lost on restart
  too). Polling, not Graph change notifications.
- Spott: only `note.created` is handled (edited or deleted notes are not), clients are matched by exact name, and the
  write-back uses one workspace API key. A restart forgets which webhook messages were already processed.
- Spott questions: no "Open in Spott" link, because neither the API docs nor the app page give a stable web URL for a
  client or note. A question linked to several clients gets a "client not linked" reply on the first one. A full
  round trip with a question note created in Spott and delivered by a real webhook has not been run. The webhook,
  questions included, stays off without `OPENAI_API_KEY`, although answering a question calls no AI.
- Topic matching is keyword-based over four demo topics, and client detection is rule-based (email domain, name,
  alias), so an unrelated email or case containing topic words can still match.
- The personal-data guard is keyword rules, not a classifier. It needs a sensitive word plus a pointer to a person
  (colleague word, pronoun, known name, possessive), so a rephrased question can slip through, and some legitimate
  questions get refused (e.g. "When must Jonas's bonus be submitted?"). The Outlook, Salesforce and Spott briefs do
  not run it; they only answer the seeded topics, none of which holds personal data.
- The car-policy topic is internal knowledge, but expert routing still applies client scoping: with a client selected
  (e.g. Van Dam), Sofie is not suggested because she is not on that client's team. Ask with "Belgium — all clients".
- No direct Talkdesk integration: calls reach TrustLabel only through Salesforce (cases and call Tasks), Teams, or a
  call recording uploaded or dropped in the watched `calls/` folder by hand.
- Not in Agentforce: it can register external MCP servers but requires OAuth 2.0; TrustLabel's MCP uses API keys.
- Salesforce is polled every 15 s (no Platform Events or Change Data Capture), and comments post as the Run As user.
- Salesforce sources sync: verified in the running server (2 synthetic dev-org records, a closed case and a call log,
  synced as graded sources); the Integrations card's "Sources sync" row was not looked at in a browser. A case or call
  edited after it was synced is not re-read (ids are deduped in memory), and records no client matches are skipped.
- Outlook add-in: XML manifest (VersionOverrides 1.0) and the pane can't be pinned.
- Outlook "Add this email as a source": the endpoint was run live once through the channel API with the real OpenAI
  extractor (a short email became a grade-D email source); the button itself has not been clicked in Outlook yet.
- Teams expert alerts: the expert answers in TrustLabel (one click from the card) or with a reply in a team channel,
  not inside the card itself. Verified live with a fixed Recipient only; routing per expert through
  `triggerBody()?['recipient']` and posting into a group chat or channel were not tried live.
- Chat "Hey TrustLabel": the wake-word path was not tested in a real browser with a real microphone (headless
  Chromium has no speech recognition service); push-to-talk was tested with a simulated microphone only. Browser
  speech recognition in Chrome sends audio to Google; Firefox has none, so the toggle is hidden there. A question
  spoken in the same breath as the wake phrase is lost; pause after "Hey TrustLabel". Text answers are not read aloud
  (only voice questions get `speech`; "Play answer" replays it).
- A Spott workspace connected on the Integrations page is lost on restart; the personal key lasts 8 hours.
- Auto-ask: Claude drafting was checked live once (`claude-haiku-5-5`, confirmed in `GET /v1/models`; the model rejects
  `temperature`, so none is sent). Drafts are still model output: a draft that fails the checks falls back to the
  template silently, apart from a log line. Followers of a shared request are not notified separately when it is
  resolved; they see the verified answer on their next ask.
- Meetings: the job list and the watcher's "already processed" keys are in memory, so a restart reprocesses the
  folder (the items are in memory too). No speaker names, only "Speaker N". Claims are kept from the first 12,000
  transcript characters only. Recordings are not tied to a client, and nothing is fetched from Teams or Graph
  directly: the folder must be synced by OneDrive/SharePoint. Tested with short TTS recordings, not a real
  multi-person meeting or a 25 MB file.
- Phone call recordings: only the upload path was run live (one short TTS call, in-process, not through the running
  server); the `calls/` folder path and the Type select in the browser are tested with Scribe and the extractor
  stubbed only. Calls are not linked to Talkdesk or a client.
- Capture types: a meeting summary was captured live through `POST /api/capture` with the real extractor; the Type
  select was not clicked through in a browser, and MCP `capture_source` `kind` was not called from a live Copilot
  Studio agent. A 4,000-character paste is one extraction call; there is no splitting of longer text.
