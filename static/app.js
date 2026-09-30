// TrustLabel frontend: vanilla ES module, DOM built via h(); text only through text nodes.

const GRADES = ["A", "B", "C", "D", "E", "F", "G"];
const LEGEND = "A expert-verified · B strong · C fair · D weak · E poor · F outdated · G contradicted";
const STATUSES = {
  use: { text: "Safe to use", cls: "status-use", symbol: "check" },
  verify: { text: "Use with caution — ask for verification", cls: "status-verify", symbol: "caution" },
  ask_expert: { text: "Don't act yet", cls: "status-ask", symbol: "stop" },
};
const MUTED_STATUSES = new Set(["not_applicable", "overridden"]);
const NOT_APPLICABLE_CODES = new Set(["country_mismatch", "client_mismatch", "not_yet_effective", "expired"]);
const VOICE_MAX_SECONDS = 30;

const state = {
  me: null,
  view: "ask",
  inboxCount: 0,
  contextKey: null,
};

const root = document.getElementById("app");
let toastTimer = null;

// ---------- infrastructure ----------

class ApiError extends Error {
  constructor(status, detail) {
    super(detail);
    this.status = status;
    this.detail = detail;
  }
}

function errorDetail(data, status) {
  if (data && typeof data.detail === "string") return data.detail;
  if (data && Array.isArray(data.detail) && data.detail.length && data.detail[0].msg) return data.detail[0].msg;
  return `Request failed (${status})`;
}

async function api(path, { method = "GET", body, formData, skipAuthRedirect = false } = {}) {
  const init = { method, credentials: "same-origin", headers: { Accept: "application/json" } };
  if (formData) {
    init.body = formData;
  } else if (body !== undefined) {
    init.headers["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }
  let res;
  try {
    res = await fetch(path, init);
  } catch {
    throw new ApiError(0, "Network error — is the server running?");
  }
  let data = null;
  if (res.status !== 204) {
    const text = await res.text();
    if (text) {
      try {
        data = JSON.parse(text);
      } catch {
        data = null;
      }
    }
  }
  if (!res.ok) {
    if (res.status === 401 && !skipAuthRedirect) {
      state.me = null;
      renderLogin();
    }
    throw new ApiError(res.status, errorDetail(data, res.status));
  }
  return data;
}

function h(tag, props, ...children) {
  const el = document.createElement(tag);
  if (props) {
    for (const [key, value] of Object.entries(props)) {
      if (value === undefined || value === null || value === false) continue;
      if (key === "className") {
        el.className = value;
      } else if (/^on[A-Z]/.test(key)) {
        el.addEventListener(key.slice(2).toLowerCase(), value);
      } else if (key === "htmlFor") {
        el.htmlFor = value;
      } else if (key.startsWith("data-") || key.startsWith("aria-") || !(key in el)) {
        el.setAttribute(key, value === true ? "" : String(value));
      } else {
        el[key] = value;
      }
    }
  }
  appendChildren(el, children);
  return el;
}

function appendChildren(el, children) {
  for (const child of children) {
    if (child === null || child === undefined || child === false) continue;
    if (Array.isArray(child)) appendChildren(el, child);
    else if (child instanceof Node) el.appendChild(child);
    else el.appendChild(document.createTextNode(String(child)));
  }
}

function clear(el) {
  while (el.firstChild) el.removeChild(el.firstChild);
}

function toast(message, isError = false) {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.appendChild(el);
  }
  el.textContent = message;
  el.className = isError ? "toast toast-show toast-error" : "toast toast-show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = "toast";
  }, isError ? 6000 : 4500);
}

function showError(err) {
  if (err instanceof ApiError && err.status === 401) return; // login view already shown
  toast(err instanceof ApiError ? err.detail : String(err && err.message ? err.message : err), true);
}

function localIsoDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(days) {
  const d = new Date();
  d.setDate(d.getDate() + days);
  return localIsoDate(d);
}

function formatDateTime(iso) {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? iso : d.toLocaleString();
}

function firstName(name) {
  return String(name || "").split(" ")[0];
}

function gradeTile(grade, { muted = false, small = false, large = false } = {}) {
  const cls = ["grade-tile", grade ? `grade-${grade}` : "grade-none"];
  if (muted) cls.push("muted");
  if (small) cls.push("grade-tile-small");
  if (large) cls.push("grade-tile-large");
  return h("span", { className: cls.join(" "), title: grade ? `Grade ${grade}` : "No grade" }, grade || "–");
}

// ---------- symbols (SVG via createElementNS; no innerHTML) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const STROKES = {
  search: ["M10.5 17.5a7 7 0 1 1 0-14 7 7 0 0 1 0 14Z", "m15.5 15.5 5 5"],
  arrowRight: ["M5 12h14", "m13 6 6 6-6 6"],
  chevronRight: ["m9.5 6 6 6-6 6"],
  chevronDown: ["m6 9.5 6 6 6-6"],
  chevronUpDown: ["m8 9.5 4-4 4 4", "m8 14.5 4 4 4-4"],
  check: ["m5 12.5 4.5 4.5L19 7.5"],
  mic: ["M12 14.5a3 3 0 0 0 3-3v-5a3 3 0 0 0-6 0v5a3 3 0 0 0 3 3Z", "M18.5 11a6.5 6.5 0 0 1-13 0", "M12 17.5V21"],
};
// Filled status symbols in the style of SF Symbols: a solid shape with a knocked-out glyph.
const SYMBOLS = {
  check: { shape: ["circle", { cx: 12, cy: 12, r: 10 }], glyph: ["m7.5 12.3 3 3 6-6.3"] },
  caution: { shape: ["path", { d: "M10.3 3.9a2 2 0 0 1 3.4 0l8.1 14.1a2 2 0 0 1-1.7 3H3.9a2 2 0 0 1-1.7-3Z" }], glyph: ["M12 9v4.5", "M12 17.3v.01"] },
  stop: { shape: ["path", { d: "M8.1 2h7.8L22 8.1v7.8L15.9 22H8.1L2 15.9V8.1Z" }], glyph: ["M8.5 12h7"] },
};

function svgEl(tag, attrs, ...children) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs || {})) el.setAttribute(k, String(v));
  for (const c of children) el.appendChild(c);
  return el;
}

function icon(name, className = "") {
  return svgEl(
    "svg",
    { viewBox: "0 0 24 24", class: `icon ${className}`.trim(), "aria-hidden": "true", focusable: "false" },
    ...STROKES[name].map((d) => svgEl("path", { d })),
  );
}

function symbol(name) {
  const s = SYMBOLS[name];
  return svgEl(
    "svg",
    { viewBox: "0 0 24 24", class: "symbol", "aria-hidden": "true", focusable: "false" },
    svgEl(s.shape[0], { ...s.shape[1], class: "symbol-shape" }),
    ...s.glyph.map((d) => svgEl("path", { d, class: "symbol-glyph" })),
  );
}

// The TrustLabel mark: the stepped bars of an energy label.
function logoMark(size) {
  const bars = GRADES.map((_, i) => svgEl("rect", { x: 3, y: 3 + i * 3, width: 8 + i * 2, height: 2, rx: 0.5 }));
  return svgEl("svg", { viewBox: "0 0 26 26", width: size, height: size, class: "mark", "aria-hidden": "true" }, ...bars);
}

function monogram(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  const letters = (parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "");
  return h("span", { className: "monogram", "aria-hidden": "true" }, letters.toUpperCase());
}

function setBusy(button, busy) {
  button.disabled = busy;
  button.classList.toggle("is-busy", busy);
  button.setAttribute("aria-busy", busy ? "true" : "false");
}

// ---------- boot / login ----------

async function boot() {
  try {
    state.me = await api("/api/me", { skipAuthRedirect: true });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) {
      renderLogin();
      return;
    }
    clear(root);
    root.appendChild(h("div", { className: "boot-error" }, "Could not load TrustLabel: ", err.detail || String(err)));
    return;
  }
  state.view = "ask";
  state.contextKey = state.me.contexts.length ? state.me.contexts[0].key : null;
  renderShell();
}

function renderLogin() {
  clear(root);
  const username = h("input", { id: "login-username", name: "username", autocomplete: "username", required: true, maxLength: 64, placeholder: "Username" });
  const password = h("input", { id: "login-password", name: "password", type: "password", autocomplete: "current-password", required: true, maxLength: 256, placeholder: "Password" });
  const errorLine = h("p", { className: "form-error", role: "alert" });
  const submit = h("button", { type: "submit", className: "login-go", title: "Log in", "aria-label": "Log in" }, icon("arrowRight"));

  const form = h(
    "form",
    {
      className: "login",
      onSubmit: async (e) => {
        e.preventDefault();
        errorLine.textContent = "";
        setBusy(submit, true);
        try {
          await api("/api/login", {
            method: "POST",
            body: { username: username.value.trim(), password: password.value },
            skipAuthRedirect: true,
          });
          await boot();
        } catch (err) {
          errorLine.textContent = err instanceof ApiError ? err.detail : String(err);
          password.value = "";
          setBusy(submit, false);
          password.focus();
        }
      },
    },
    logoMark(40),
    h("h1", { className: "login-title" }, "Sign in to TrustLabel"),
    h("p", { className: "login-sub" }, "Search finds it. TrustLabel shows whether you can rely on it."),
    h(
      "div",
      { className: "field-group" },
      h("label", { htmlFor: "login-username", className: "sr-only" }, "Username"),
      username,
      h("div", { className: "field-group-row" }, h("label", { htmlFor: "login-password", className: "sr-only" }, "Password"), password, submit),
    ),
    errorLine,
    h("p", { className: "login-hint" }, "lotte, jonas (consultants) · ellen, pieter, anke (experts)"),
  );
  root.appendChild(h("main", { className: "login-page" }, form));
  username.focus();
}

// ---------- shell ----------

let askViewEl = null;
let inboxViewEl = null;
let inboxNavBtn = null;
let askNavBtn = null;
let inboxBadge = null;
let segmentThumb = null;

function renderShell() {
  clear(root);
  const me = state.me;
  askNavBtn = h("button", { className: "segment", type: "button", onClick: () => switchView("ask") }, "Ask");
  inboxBadge = h("span", { className: "badge", hidden: true }, "0");
  inboxNavBtn = h("button", { className: "segment", type: "button", onClick: () => switchView("inbox") }, "Inbox", inboxBadge);
  segmentThumb = h("span", { className: "segment-thumb", "aria-hidden": "true" });

  const header = h(
    "header",
    { className: "toolbar" },
    h("div", { className: "brand" }, logoMark(22), h("span", { className: "brand-name" }, "TrustLabel")),
    h("nav", { className: "segmented", "aria-label": "Views" }, segmentThumb, askNavBtn, inboxNavBtn),
    h(
      "div",
      { className: "account" },
      monogram(me.user.name),
      h("span", { className: "account-text" }, h("span", { className: "account-name" }, me.user.name), h("span", { className: "account-role" }, me.user.title)),
      h("button", { className: "link-btn", type: "button", onClick: logout }, "Sign out"),
    ),
  );

  askViewEl = h("main", { className: "view" });
  inboxViewEl = h("main", { className: "view" });
  root.appendChild(header);
  root.appendChild(askViewEl);
  root.appendChild(inboxViewEl);
  renderAskView();
  switchView(state.view);
  refreshInboxCount();
}

function switchView(view) {
  state.view = view;
  askViewEl.hidden = view !== "ask";
  inboxViewEl.hidden = view !== "inbox";
  askNavBtn.className = view === "ask" ? "segment active" : "segment";
  inboxNavBtn.className = view === "inbox" ? "segment active" : "segment";
  askNavBtn.setAttribute("aria-current", view === "ask" ? "page" : "false");
  inboxNavBtn.setAttribute("aria-current", view === "inbox" ? "page" : "false");
  placeSegmentThumb();
  if (view === "inbox") loadInbox();
}

function placeSegmentThumb() {
  if (!segmentThumb || !segmentThumb.isConnected) return;
  const active = state.view === "inbox" ? inboxNavBtn : askNavBtn;
  segmentThumb.style.width = `${active.offsetWidth}px`;
  segmentThumb.style.transform = `translateX(${active.offsetLeft}px)`;
}
window.addEventListener("resize", placeSegmentThumb);

async function logout() {
  try {
    await api("/api/logout", { method: "POST", skipAuthRedirect: true });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) showError(err);
  }
  state.me = null;
  renderLogin();
}

function setInboxCount(items) {
  state.inboxCount = items.filter((v) => v.status === "open" && v.is_assignee).length;
  if (inboxBadge) {
    inboxBadge.textContent = String(state.inboxCount);
    inboxBadge.hidden = state.inboxCount === 0;
    placeSegmentThumb();
  }
}

async function refreshInboxCount() {
  try {
    const data = await api("/api/verifications");
    setInboxCount(data.items);
  } catch (err) {
    showError(err);
  }
}

// ---------- ask view ----------

let resultEl = null;
let questionInput = null;
let contextSelect = null;

function currentContext() {
  return state.me.contexts.find((c) => c.key === state.contextKey) || state.me.contexts[0] || null;
}

function renderAskView() {
  clear(askViewEl);
  const me = state.me;

  contextSelect = h(
    "select",
    { id: "context-select", onChange: () => (state.contextKey = contextSelect.value) },
    me.contexts.map((c) => h("option", { value: c.key, selected: c.key === state.contextKey }, c.label)),
  );
  questionInput = h("input", {
    id: "question-input",
    className: "search-input",
    type: "search",
    maxLength: 300,
    autocomplete: "off",
    placeholder: "e.g. What's the cut-off for submitting overtime for this month's payroll?",
    "aria-label": "Question",
  });
  const askBtn = h("button", { type: "submit", className: "btn btn-primary" }, "Ask");

  const form = h(
    "form",
    {
      className: "ask-form",
      onSubmit: (e) => {
        e.preventDefault();
        const q = questionInput.value.trim();
        if (!q) {
          toast("Type a question or pick a topic", true);
          return;
        }
        runAsk({ question: q, topic_id: null }, askBtn);
      },
    },
    h("div", { className: "search-field" }, icon("search"), questionInput),
    askBtn,
  );

  const head = h(
    "div",
    { className: "page-head" },
    h("h1", { className: "large-title" }, "Ask"),
    h(
      "div",
      { className: "picker" },
      h("label", { htmlFor: "context-select", className: "picker-label" }, "Context"),
      h("span", { className: "picker-control" }, contextSelect, icon("chevronUpDown")),
    ),
  );

  const suggestions = h(
    "div",
    { className: "suggestions" },
    h("span", { className: "suggestions-label" }, "Topics"),
    me.topics.map((t) => topicChip(t)),
  );

  resultEl = h("div", { className: "result-area", "aria-live": "polite" });
  askViewEl.appendChild(head);
  askViewEl.appendChild(form);
  askViewEl.appendChild(suggestions);
  if (me.features && me.features.capture) askViewEl.appendChild(renderCapture());
  askViewEl.appendChild(resultEl);
}

function topicChip(topic) {
  return h(
    "button",
    { type: "button", className: "capsule", onClick: () => runAsk({ question: questionInput.value.trim(), topic_id: topic.id }) },
    topic.label,
  );
}

async function runAsk({ question, topic_id }, button) {
  const ctx = currentContext();
  if (button) setBusy(button, true);
  resultEl.classList.add("is-loading");
  try {
    const data = await api("/api/ask", {
      method: "POST",
      body: { question: question || "", client_id: ctx ? ctx.client_id : null, topic_id: topic_id || null },
    });
    renderAskResponse(data, { question: question || "" });
  } catch (err) {
    showError(err);
  } finally {
    resultEl.classList.remove("is-loading");
    if (button) setBusy(button, false);
  }
}

function renderAskResponse(data, { question, newItemId = null }) {
  clear(resultEl);
  if (!data.topic) {
    resultEl.appendChild(
      h(
        "section",
        { className: "card no-match appear" },
        h("p", null, "No matching topic. Try one of these:"),
        h("div", { className: "suggestions" }, (data.suggestions || []).map((t) => topicChip(t))),
      ),
    );
    return;
  }
  resultEl.appendChild(renderResult(data, { question, newItemId }));
}

function renderCapture() {
  const textarea = h("textarea", {
    className: "capture-text",
    maxLength: 1000,
    rows: 4,
    placeholder: "Paste a Teams message, e.g. \"From November meal voucher orders close on the 8th.\"",
    "aria-label": "Teams message",
  });
  const btn = h("button", { type: "button", className: "btn btn-primary" }, "Capture");
  btn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      toast("Paste a message to capture", true);
      return;
    }
    const ctx = currentContext();
    setBusy(btn, true);
    resultEl.classList.add("is-loading");
    try {
      const data = await api("/api/capture", {
        method: "POST",
        body: { text, client_id: ctx ? ctx.client_id : null },
      });
      renderAskResponse(data.result, { question: "", newItemId: data.captured_item_id });
      toast("Captured, graded and checked against existing knowledge.");
    } catch (err) {
      showError(err);
    } finally {
      resultEl.classList.remove("is-loading");
      setBusy(btn, false);
    }
  });
  return h(
    "details",
    { className: "card capture" },
    h("summary", null, h("span", null, "Capture a Teams message"), icon("chevronRight", "disclosure")),
    h("div", { className: "capture-body" }, textarea, h("div", { className: "actions" }, btn)),
  );
}

// ---------- result rendering ----------

function section(title, trailing, ...content) {
  return h("section", { className: "section" }, h("h2", { className: "section-title" }, title, trailing ? h("span", { className: "section-count" }, trailing) : null), content);
}

function renderResult(data, { question, newItemId }) {
  const left = h(
    "div",
    { className: "result-col" },
    section("Answer", null, renderAnswer(data)),
    section("Trust label", null, renderLadder(data.answer)),
    section("Who can confirm", null, renderExperts(data, question)),
  );
  const right = h(
    "div",
    { className: "result-col" },
    section("Sources", String(data.sources.length), data.sources.map((s) => renderSource(s, s.id === newItemId))),
  );
  return h("div", { className: "result appear" }, left, right);
}

function renderAnswer(data) {
  const a = data.answer;
  const status = STATUSES[a.action] || STATUSES.ask_expert;
  // The headline often repeats the status ("Don't act yet — sources disagree"); show the status once.
  let headline = a.headline;
  const prefix = `${status.text} — `;
  if (headline.startsWith(prefix)) headline = headline.charAt(prefix.length).toUpperCase() + headline.slice(prefix.length + 1);

  const competing =
    a.competing && a.competing.length
      ? h(
          "ul",
          { className: "rows" },
          a.competing.map((c) =>
            h(
              "li",
              { className: "row" },
              gradeTile(c.best_grade, { small: true }),
              h("span", { className: "row-title" }, c.value_display),
              h("span", { className: "row-detail mono" }, c.item_ids.join(", ")),
            ),
          ),
        )
      : null;
  return h(
    "div",
    { className: "card answer" },
    h("p", { className: `status ${status.cls}` }, symbol(status.symbol), status.text),
    h("div", { className: "answer-head" }, a.grade ? gradeTile(a.grade, { large: true }) : null, h("h3", { className: "answer-headline" }, headline)),
    h("p", { className: "answer-detail" }, a.detail),
    competing,
    h(
      "p",
      { className: "footnote" },
      `Topic: ${data.topic.label} · Context: ${data.context.label}`,
      data.matched_keywords && data.matched_keywords.length ? ` · Matched: ${data.matched_keywords.join(", ")}` : "",
    ),
  );
}

function renderLadder(answer) {
  const markers = {};
  if ((answer.status === "verified" || answer.status === "consistent") && answer.grade) {
    markers[answer.grade] = [answer.value_display];
  } else if (answer.status === "conflict") {
    for (const c of answer.competing || []) {
      (markers[c.best_grade] = markers[c.best_grade] || []).push(c.value_display);
    }
  }
  const rows = GRADES.map((g) =>
    h(
      "div",
      { className: "label-row" },
      h("div", { className: "label-track" }, h("div", { className: `label-bar label-${g} grade-${g}` }, g)),
      h(
        "div",
        { className: "label-markers" },
        (markers[g] || []).map((value) =>
          h("span", { className: "marker" }, h("span", { className: "marker-arrow" }, g), h("span", { className: "marker-value" }, value)),
        ),
      ),
    ),
  );
  return h(
    "div",
    { className: "card" },
    h("div", { className: "energy-label" }, rows),
    answer.status === "gap" ? h("p", { className: "label-note" }, "No applicable source") : null,
    h("p", { className: "footnote" }, LEGEND),
  );
}

function renderExperts(data, question) {
  const experts = data.experts || [];
  const card = h("div", { className: "card" });
  if (!experts.length) {
    card.appendChild(h("p", { className: "secondary" }, "No expert available for this topic and context."));
    return card;
  }
  card.appendChild(
    h(
      "ol",
      { className: "rows" },
      experts.map((ex, i) =>
        h(
          "li",
          { className: "row expert" },
          monogram(ex.name),
          h(
            "div",
            { className: "expert-body" },
            h("div", null, h("span", { className: "row-title" }, ex.name), i === 0 ? h("span", { className: "tag" }, "Recommended") : null),
            h("div", { className: "secondary" }, ex.title),
            h("div", { className: "tertiary" }, ex.reasons.join(" · ")),
          ),
          h("span", { className: "expert-score", title: "Routing score" }, String(ex.score)),
        ),
      ),
    ),
  );

  const actionArea = h("div", { className: "card-action" });
  const pendingText = (name) => h("p", { className: "pending" }, `Verification requested from ${name}. Waiting for an answer.`);
  if (data.open_request) {
    actionArea.appendChild(pendingText(data.open_request.assignee_name));
  } else if (data.answer.action !== "use") {
    const btn = h("button", { type: "button", className: "btn btn-primary btn-block" }, `Ask ${firstName(experts[0].name)} to verify`);
    btn.addEventListener("click", async () => {
      setBusy(btn, true);
      try {
        const v = await api("/api/verifications", {
          method: "POST",
          body: {
            topic_id: data.topic.id,
            client_id: data.context.client_id,
            question: (question || "").trim() || data.topic.label,
          },
        });
        clear(actionArea);
        actionArea.appendChild(pendingText(v.assignee_name));
        toast(`Verification request sent to ${v.assignee_name}.`);
        refreshInboxCount();
      } catch (err) {
        setBusy(btn, false);
        showError(err);
      }
    });
    actionArea.appendChild(btn);
  }
  if (actionArea.firstChild) card.appendChild(actionArea);
  return card;
}

function applicabilityClass(code) {
  if (code === "applies") return "tone-good";
  if (code === "superseded" || code === "overridden") return "tone-warn";
  if (NOT_APPLICABLE_CODES.has(code)) return "tone-muted";
  return "tone-muted";
}

// A grading reason as one line of a ledger: what happened, and what it did to the score.
function ledgerValue(r) {
  if (r.code === "base" && r.delta !== null && r.delta !== undefined) return h("span", { className: "ledger-value" }, String(r.delta));
  if (r.delta !== null && r.delta !== undefined) {
    if (r.delta > 0) return h("span", { className: "ledger-value tone-good" }, `+${r.delta}`);
    if (r.delta < 0) return h("span", { className: "ledger-value tone-bad" }, `−${Math.abs(r.delta)}`);
    return h("span", { className: "ledger-value" }, "0");
  }
  if (r.cap) return h("span", { className: "ledger-value ledger-cap" }, `max ${r.cap}`);
  return null;
}

function fact(label, value) {
  return h("div", { className: "fact" }, h("dt", null, label), h("dd", null, value));
}

function renderSource(s, isNew) {
  const muted = MUTED_STATUSES.has(s.status);
  const facts = [];
  if (s.kind === "teams_message") {
    facts.push(fact("Posted by", s.author_name || "Unknown author"));
    facts.push(fact("Posted", s.created_on));
  } else {
    facts.push(fact("Owner", s.owner_active ? s.owner_name : h("span", { className: "tone-bad" }, "No active owner")));
    facts.push(s.last_reviewed_on ? fact("Last reviewed", s.last_reviewed_on) : fact("Created", s.created_on));
  }
  facts.push(fact("Scope", h("span", { className: applicabilityClass(s.applicability.code) }, s.applicability.text)));

  const ledger = h(
    "ul",
    { className: "ledger" },
    s.reasons.map((r) => {
      const value = ledgerValue(r);
      return h("li", { className: value ? "ledger-row" : "ledger-row ledger-info" }, h("span", null, r.text), value);
    }),
    h("li", { className: "ledger-row ledger-total" }, h("span", null, "Trust score"), h("span", { className: "ledger-value" }, `${s.score} · ${s.grade}`)),
  );

  const cls = ["card", "source"];
  if (muted) cls.push("is-muted");
  if (isNew) cls.push("is-new");
  return h(
    "article",
    { className: cls.join(" ") },
    h(
      "div",
      { className: "source-head" },
      gradeTile(s.grade, { muted }),
      h(
        "div",
        { className: "source-titles" },
        h("p", { className: "overline" }, s.kind_label, " · ", h("span", { className: "mono" }, s.id), isNew ? h("span", { className: "tag" }, "New") : null),
        h("h3", { className: "source-title" }, s.title),
        h("p", { className: "secondary" }, s.source),
      ),
      h("div", { className: "score", title: "Trust score" }, h("span", { className: "score-value" }, String(s.score)), h("span", { className: "score-label" }, "Score")),
    ),
    h("p", { className: "statement" }, s.statement),
    h("blockquote", { className: "quote" }, s.kind === "verified_answer" ? s.body : s.quote),
    h("dl", { className: "facts" }, facts),
    h("details", { className: "why" }, h("summary", null, h("span", null, `Why ${s.grade}?`), icon("chevronRight", "disclosure")), ledger),
  );
}

// ---------- inbox ----------

async function loadInbox() {
  try {
    const data = await api("/api/verifications");
    setInboxCount(data.items);
    renderInbox(data.items);
  } catch (err) {
    showError(err);
  }
}

function renderInbox(items) {
  clear(inboxViewEl);
  const open = items.filter((v) => v.status === "open" && v.is_assignee).length;
  inboxViewEl.appendChild(
    h(
      "div",
      { className: "page-head" },
      h("div", null, h("h1", { className: "large-title" }, "Inbox"), h("p", { className: "page-sub" }, open ? `${open} ${open === 1 ? "request needs" : "requests need"} your answer` : "Nothing needs your answer")),
    ),
  );
  if (!items.length) {
    inboxViewEl.appendChild(h("section", { className: "card empty appear" }, h("p", { className: "secondary" }, "No verification requests yet.")));
    return;
  }
  inboxViewEl.appendChild(h("div", { className: "inbox appear" }, items.map(renderRequestCard)));
}

function renderRequestCard(v) {
  const isOpen = v.status === "open";
  const card = h(
    "article",
    { className: "card request" },
    h(
      "div",
      { className: "request-top" },
      h("span", { className: isOpen ? "request-status tone-warn" : "request-status tone-good" }, isOpen ? "Open" : "Resolved"),
      h("span", { className: "footnote" }, formatDateTime(v.created_at)),
    ),
    h("h3", { className: "request-title" }, `${v.topic.label} — ${v.context_label}`),
    h("p", { className: "secondary" }, `Requested by ${v.requester_name} for ${v.assignee_name}${v.is_assignee ? " (you)" : ""}`),
    h("blockquote", { className: "quote" }, v.question),
  );

  if (v.status === "resolved" && v.resolution) {
    card.appendChild(renderResolution(v.resolution));
  } else if (isOpen && v.is_assignee) {
    card.appendChild(renderResolveForm(v));
  } else if (isOpen) {
    card.appendChild(
      h(
        "div",
        null,
        h("p", { className: "pending" }, `Waiting for ${v.assignee_name}`),
        v.candidates.length ? h("p", { className: "secondary" }, `Candidates: ${v.candidates.map((c) => `${c.value_display} (${c.grade})`).join(" vs ")}`) : null,
      ),
    );
  }
  if (v.voice_transcript && v.status === "resolved") {
    card.appendChild(h("p", { className: "transcript" }, h("strong", null, "Voice statement: "), v.voice_transcript));
  }
  return card;
}

function renderResolution(r) {
  return h(
    "div",
    { className: "resolution" },
    h("div", { className: "resolution-value" }, gradeTile("A", { small: true }), h("strong", null, r.value_display)),
    r.note ? h("p", null, r.note) : null,
    h("p", { className: "footnote" }, `Valid until ${r.valid_until} · resolved ${formatDateTime(r.resolved_at)} · ${r.item_id}`),
  );
}

function renderResolveForm(v) {
  const radioName = `cand-${v.id}`;
  const radios = [];
  const otherInput = h("input", { type: "number", min: 1, max: 31, step: 1, className: "other-input", placeholder: "e.g. 25", "aria-label": "Other value" });
  const note = h("textarea", { className: "note-input", maxLength: 500, rows: 2, placeholder: "e.g. contract addendum reference" });
  const validUntil = h("input", { type: "date", className: "date-input", value: addDays(180), min: addDays(1), max: addDays(730), required: true });
  const transcriptArea = h("div", { className: "transcript-area" });

  const candidateRows = v.candidates.map((c, i) => {
    const radio = h("input", {
      type: "radio",
      name: radioName,
      value: c.value,
      id: `${radioName}-${i}`,
      className: "choice-input",
      onChange: () => {
        otherInput.value = "";
      },
    });
    radios.push(radio);
    return h(
      "label",
      { className: "row choice", htmlFor: `${radioName}-${i}` },
      radio,
      gradeTile(c.grade, { small: true }),
      h("span", { className: "choice-text" }, h("span", { className: "row-title" }, c.value_display), h("span", { className: "secondary" }, c.title)),
      icon("check", "choice-check"),
    );
  });
  otherInput.addEventListener("input", () => {
    if (otherInput.value !== "") radios.forEach((r) => (r.checked = false));
  });

  if (v.voice_transcript) {
    transcriptArea.appendChild(h("p", { className: "transcript" }, h("strong", null, "Voice statement: "), v.voice_transcript));
  }

  const resolveBtn = h("button", { type: "submit", className: "btn btn-primary" }, "Resolve");
  const form = h(
    "form",
    {
      className: "resolve-form",
      onSubmit: async (e) => {
        e.preventDefault();
        const checked = radios.find((r) => r.checked);
        const value = otherInput.value.trim() || (checked ? checked.value : "");
        if (!value) {
          toast("Pick a candidate or enter another value", true);
          return;
        }
        if (!validUntil.value) {
          toast("Set a valid-until date", true);
          return;
        }
        setBusy(resolveBtn, true);
        try {
          await api(`/api/verifications/${encodeURIComponent(v.id)}/resolve`, {
            method: "POST",
            body: { value, note: note.value.trim(), valid_until: validUntil.value },
          });
          toast(`Verified. Everyone asking this in ${v.context_label} now sees it.`);
          await loadInbox();
        } catch (err) {
          setBusy(resolveBtn, false);
          showError(err);
        }
      },
    },
    h(
      "fieldset",
      { className: "choices" },
      h("legend", null, "Which value is correct?"),
      h("div", { className: "rows" }, candidateRows, h("label", { className: "row choice-other" }, h("span", { className: "row-title" }, "Other value"), otherInput)),
    ),
    transcriptArea,
    h("label", { className: "field" }, "Note", note),
    h("label", { className: "field" }, "Valid until", validUntil),
  );

  const actions = h("div", { className: "actions" });
  if (state.me.features && state.me.features.voice) {
    actions.appendChild(voiceButton(v, { radios, otherInput, validUntil, transcriptArea }));
  }
  actions.appendChild(resolveBtn);
  form.appendChild(actions);
  return form;
}

// ---------- voice ----------

function pickRecorderType() {
  if (typeof MediaRecorder === "undefined") return null;
  if (MediaRecorder.isTypeSupported("audio/webm")) return { mimeType: "audio/webm", filename: "answer.webm" };
  if (MediaRecorder.isTypeSupported("audio/ogg")) return { mimeType: "audio/ogg", filename: "answer.ogg" };
  return { mimeType: "", filename: "answer.webm" };
}

function voiceButton(v, form) {
  const label = h("span", null, "Answer by voice");
  const btn = h("button", { type: "button", className: "btn btn-secondary btn-voice" }, icon("mic"), label);
  let recorder = null;
  let stream = null;
  let ticker = null;
  let timeout = null;
  let seconds = 0;

  const stopTracks = () => {
    if (stream) stream.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  const stopRecording = () => {
    clearInterval(ticker);
    clearTimeout(timeout);
    if (recorder && recorder.state !== "inactive") recorder.stop();
  };

  btn.addEventListener("click", async () => {
    if (recorder && recorder.state === "recording") {
      stopRecording();
      return;
    }
    const type = pickRecorderType();
    if (!type || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      toast("Voice recording is not supported in this browser", true);
      return;
    }
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      toast(`Microphone unavailable: ${err && err.message ? err.message : err}`, true);
      return;
    }
    const chunks = [];
    try {
      recorder = type.mimeType ? new MediaRecorder(stream, { mimeType: type.mimeType }) : new MediaRecorder(stream);
    } catch (err) {
      stopTracks();
      toast(`Recording failed: ${err && err.message ? err.message : err}`, true);
      return;
    }
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    });
    recorder.addEventListener("stop", async () => {
      stopTracks();
      btn.classList.remove("recording");
      const blobType = (recorder.mimeType || type.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: blobType });
      recorder = null;
      await sendVoice(v, blob, type.filename, { btn, label }, form);
    });
    seconds = 0;
    recorder.start();
    btn.classList.add("recording");
    label.textContent = "Stop · 0:00";
    ticker = setInterval(() => {
      seconds += 1;
      label.textContent = `Stop · 0:${String(seconds).padStart(2, "0")}`;
    }, 1000);
    timeout = setTimeout(stopRecording, VOICE_MAX_SECONDS * 1000);
  });
  return btn;
}

async function sendVoice(v, blob, filename, { btn, label }, { radios, otherInput, validUntil, transcriptArea }) {
  btn.disabled = true;
  label.textContent = "Transcribing…";
  clear(transcriptArea);
  transcriptArea.appendChild(h("p", { className: "secondary" }, "Transcribing…"));
  const fd = new FormData();
  fd.append("audio", blob, filename);
  try {
    const data = await api(`/api/verifications/${encodeURIComponent(v.id)}/voice`, { method: "POST", formData: fd });
    clear(transcriptArea);
    const s = data.suggestion;
    const idx = s ? data.transcript.indexOf(s.quote) : -1;
    const p = h("p", { className: "transcript" }, h("strong", null, "Transcript: "));
    if (s && s.quote && idx >= 0) {
      p.appendChild(document.createTextNode(data.transcript.slice(0, idx)));
      p.appendChild(h("mark", null, s.quote));
      p.appendChild(document.createTextNode(data.transcript.slice(idx + s.quote.length)));
    } else {
      p.appendChild(document.createTextNode(data.transcript));
    }
    transcriptArea.appendChild(p);
    if (!s) {
      transcriptArea.appendChild(h("p", { className: "voice-note" }, "No value recognised — pick one manually"));
    } else {
      const match = radios.find((r) => r.value === s.value);
      if (match) {
        match.checked = true;
        otherInput.value = "";
      } else {
        radios.forEach((r) => (r.checked = false));
        otherInput.value = s.value;
      }
      if (s.valid_until) validUntil.value = s.valid_until;
      transcriptArea.appendChild(
        h("p", { className: "voice-note" }, `Suggested: ${s.value_display}${s.valid_until ? `, valid until ${s.valid_until}` : ""}. Check and click Resolve.`),
      );
    }
  } catch (err) {
    clear(transcriptArea);
    showError(err);
  } finally {
    btn.disabled = false;
    label.textContent = "Answer by voice";
  }
}

boot();
