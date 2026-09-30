// TrustLabel frontend: vanilla ES module, DOM built via h(); text only through text nodes.

const GRADES = ["A", "B", "C", "D", "E", "F", "G"];
const LEGEND = "A expert-verified · B strong · C fair · D weak · E poor · F outdated · G contradicted";
const BANNERS = {
  use: { text: "Safe to use", cls: "banner-use" },
  verify: { text: "Use with caution — ask for verification", cls: "banner-verify" },
  ask_expert: { text: "Don't act yet", cls: "banner-ask" },
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

function gradeTile(grade, { muted = false, small = false } = {}) {
  const cls = ["grade-tile", grade ? `grade-${grade}` : "grade-none"];
  if (muted) cls.push("muted");
  if (small) cls.push("grade-tile-small");
  return h("span", { className: cls.join(" "), title: grade ? `Grade ${grade}` : "No grade" }, grade || "–");
}

// ---------- visual helpers (SVG via createElementNS, styles via CSSOM only: CSP-safe) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  search: ["M10.5 18a7.5 7.5 0 1 1 0-15 7.5 7.5 0 0 1 0 15Z", "m16 16 5 5"],
  arrowUp: ["M12 19V5", "m5 12 7-7 7 7"],
  pin: ["M12 21s-7-6.2-7-11.5a7 7 0 0 1 14 0C19 14.8 12 21 12 21Z", "M12 12a2.5 2.5 0 1 0 0-5 2.5 2.5 0 0 0 0 5Z"],
  chat: ["M21 12a8 8 0 0 1-11.6 7.1L4 20.5l1.4-4.9A8 8 0 1 1 21 12Z"],
  chevronDown: ["m6 9 6 6 6-6"],
  chevronRight: ["m9 6 6 6-6 6"],
  mic: ["M12 15a3 3 0 0 0 3-3V6a3 3 0 0 0-6 0v6a3 3 0 0 0 3 3Z", "M19 11a7 7 0 0 1-14 0", "M12 18v3"],
  shield: ["M12 3 4.5 6v5.5c0 4.6 3.2 8.3 7.5 9.5 4.3-1.2 7.5-4.9 7.5-9.5V6L12 3Z", "m9 12 2 2 4-4"],
  check: ["M20 6 9 17l-5-5"],
  logout: ["M15 4h3a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2h-3", "M10 17l-5-5 5-5", "M5 12h11"],
};
const prefersReducedMotion = () => window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

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
    ...ICONS[name].map((d) => svgEl("path", { d })),
  );
}

// The TrustLabel mark: the seven bars of an energy label.
function logoMark(size = 28) {
  const bars = GRADES.map((_, i) => svgEl("rect", { x: 2, y: 2.4 + i * 3.4, width: 11 + i * 2.1, height: 2.4, rx: 1.2 }));
  return svgEl("svg", { viewBox: "0 0 28 28", width: size, height: size, class: "logo", "aria-hidden": "true" }, ...bars);
}

function initials(name) {
  const parts = String(name || "?").trim().split(/\s+/);
  return ((parts[0] || "?")[0] + (parts.length > 1 ? parts[parts.length - 1][0] : "")).toUpperCase();
}

function avatar(name, large = false) {
  let hash = 0;
  for (const ch of String(name || "")) hash = (hash * 31 + ch.charCodeAt(0)) % 360;
  const el = h("span", { className: large ? "avatar avatar-lg" : "avatar", "aria-hidden": "true" }, initials(name));
  el.style.setProperty("--hue", String(hash));
  return el;
}

// Stagger index for entrance animations.
function stagger(el, i) {
  el.style.setProperty("--i", String(i));
  return el;
}

function countUp(el, to, duration = 1100) {
  if (prefersReducedMotion() || !Number.isFinite(to)) {
    el.textContent = String(to);
    return;
  }
  const start = performance.now();
  const step = (now) => {
    const t = Math.min(1, (now - start) / duration);
    el.textContent = String(Math.round(to * (1 - Math.pow(1 - t, 3))));
    if (t < 1) requestAnimationFrame(step);
  };
  el.textContent = "0";
  requestAnimationFrame(step);
}

// Circular trust-score gauge, coloured by grade, animated from empty.
function scoreRing(score, grade) {
  const r = 20;
  const circumference = 2 * Math.PI * r;
  const value = svgEl("circle", { class: "ring-value", cx: 24, cy: 24, r, "stroke-dasharray": circumference.toFixed(2) });
  value.style.strokeDashoffset = String(circumference);
  const num = h("span", { className: "ring-num" }, "0");
  const wrap = h(
    "span",
    { className: `ring ${grade ? `grade-${grade}` : "grade-none"}`, title: "Trust score", role: "img", "aria-label": `Trust score ${score}` },
    svgEl("svg", { viewBox: "0 0 48 48", "aria-hidden": "true" }, svgEl("circle", { class: "ring-track", cx: 24, cy: 24, r }), value),
    num,
  );
  const pct = Math.max(0, Math.min(100, Number(score) || 0)) / 100;
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      value.style.strokeDashoffset = String(circumference * (1 - pct));
      countUp(num, Number(score) || 0, 1400);
    }),
  );
  return wrap;
}

// Soft spotlight that follows the pointer across cards.
document.addEventListener(
  "pointermove",
  (e) => {
    const card = e.target instanceof Element ? e.target.closest(".card") : null;
    if (!card) return;
    const rect = card.getBoundingClientRect();
    card.style.setProperty("--mx", `${e.clientX - rect.left}px`);
    card.style.setProperty("--my", `${e.clientY - rect.top}px`);
  },
  { passive: true },
);

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
  const username = h("input", { id: "login-username", name: "username", autocomplete: "username", required: true, maxLength: 64 });
  const password = h("input", { id: "login-password", name: "password", type: "password", autocomplete: "current-password", required: true, maxLength: 256 });
  const errorLine = h("p", { className: "form-error", role: "alert" });
  const submit = h("button", { type: "submit", className: "btn btn-primary" }, "Log in");

  const form = h(
    "form",
    {
      className: "login-card",
      onSubmit: async (e) => {
        e.preventDefault();
        errorLine.textContent = "";
        submit.disabled = true;
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
          submit.disabled = false;
        }
      },
    },
    logoMark(56),
    h("h1", { className: "login-title" }, "TrustLabel"),
    h("p", { className: "tagline-dark" }, "Search finds it. TrustLabel shows whether you can rely on it."),
    h("label", { htmlFor: "login-username" }, "Username"),
    username,
    h("label", { htmlFor: "login-password" }, "Password"),
    password,
    errorLine,
    submit,
    h("p", { className: "hint" }, "lotte, jonas (consultants) · ellen, pieter, anke (experts)"),
  );
  const aurora = h("div", { className: "aurora", "aria-hidden": "true" }, h("span"), h("span"), h("span"));
  root.appendChild(h("div", { className: "login-wrap" }, aurora, form));
  username.focus();
}

// ---------- shell ----------

let askViewEl = null;
let inboxViewEl = null;
let inboxNavBtn = null;
let askNavBtn = null;
let inboxBadge = null;
let navThumb = null;

function renderShell() {
  clear(root);
  const me = state.me;
  askNavBtn = h("button", { className: "nav-btn", type: "button", onClick: () => switchView("ask") }, "Ask");
  inboxBadge = h("span", { className: "nav-badge zero", "aria-label": "open requests" }, "0");
  inboxNavBtn = h("button", { className: "nav-btn", type: "button", onClick: () => switchView("inbox") }, "Verification inbox", inboxBadge);
  navThumb = h("span", { className: "nav-thumb", "aria-hidden": "true" });

  const header = h(
    "header",
    { className: "app-header" },
    h("div", { className: "brand" }, logoMark(26), h("span", { className: "brand-name" }, "TrustLabel")),
    h("nav", { className: "nav" }, navThumb, askNavBtn, inboxNavBtn),
    h(
      "div",
      { className: "user-area" },
      h(
        "span",
        { className: "user-chip", title: me.user.title },
        avatar(me.user.name),
        h("span", { className: "user-text" }, h("span", { className: "user-name" }, me.user.name), h("span", { className: "user-role" }, me.user.title)),
      ),
      h("button", { className: "btn btn-text", type: "button", onClick: logout, title: "Log out", "aria-label": "Log out" }, icon("logout")),
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
  askNavBtn.className = view === "ask" ? "nav-btn active" : "nav-btn";
  inboxNavBtn.className = view === "inbox" ? "nav-btn active" : "nav-btn";
  requestAnimationFrame(positionNavThumb);
  if (view === "inbox") loadInbox();
}

function positionNavThumb() {
  if (!navThumb || !navThumb.isConnected) return;
  const active = state.view === "inbox" ? inboxNavBtn : askNavBtn;
  navThumb.style.setProperty("--x", `${active.offsetLeft}px`);
  navThumb.style.setProperty("--w", `${active.offsetWidth}px`);
}
window.addEventListener("resize", () => requestAnimationFrame(positionNavThumb));

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
    inboxBadge.className = state.inboxCount ? "nav-badge" : "nav-badge zero";
    requestAnimationFrame(positionNavThumb);
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
    className: "question-input",
    type: "text",
    maxLength: 300,
    placeholder: "e.g. What's the cut-off for submitting overtime for this month's payroll?",
  });
  const askBtn = h("button", { type: "submit", className: "btn btn-primary ask-submit", title: "Ask", "aria-label": "Ask" }, icon("arrowUp"));

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
    h(
      "div",
      { className: "context-row" },
      h(
        "span",
        { className: "context-pill" },
        icon("pin"),
        h("label", { htmlFor: "context-select", className: "ask-label" }, "Context"),
        h("span", { className: "select-wrap" }, contextSelect),
      ),
    ),
    h("div", { className: "search" }, icon("search"), questionInput, askBtn),
  );

  const chips = h(
    "div",
    { className: "chips" },
    h("span", { className: "chips-label" }, "Try"),
    me.topics.map((t) => topicChip(t)),
  );

  const hero = h(
    "div",
    { className: "hero" },
    h("span", { className: "hero-eyebrow" }, icon("shield"), "The trust layer for your knowledge"),
    h("h1", { className: "hero-title" }, "Found it. ", h("span", { className: "gradient-text" }, "Can you rely on it?")),
    h("p", { className: "hero-sub" }, "Every source graded A to G, conflicts triaged, and the right expert one tap away."),
  );

  const panel = h("section", { className: "card ask-card" }, form, chips);
  if (me.features && me.features.capture) panel.appendChild(renderCapture());

  resultEl = h("div", { className: "result-area" });
  askViewEl.appendChild(hero);
  askViewEl.appendChild(panel);
  askViewEl.appendChild(resultEl);
}

function renderSkeleton() {
  clear(resultEl);
  resultEl.appendChild(
    h(
      "div",
      { className: "skeleton", "aria-busy": "true", "aria-label": "Loading" },
      h("div", { className: "skeleton-col" }, h("div", { className: "sk sk-1" }), h("div", { className: "sk sk-2" })),
      h("div", { className: "skeleton-col" }, h("div", { className: "sk sk-3" }), h("div", { className: "sk sk-3" }), h("div", { className: "sk sk-3" })),
    ),
  );
}

function setButtonBusy(button, busy) {
  button.disabled = busy;
  clear(button);
  button.appendChild(busy ? h("span", { className: "spinner", "aria-hidden": "true" }) : icon("arrowUp"));
}

function topicChip(topic) {
  return h(
    "button",
    { type: "button", className: "chip", onClick: () => runAsk({ question: questionInput.value.trim(), topic_id: topic.id }) },
    topic.label,
  );
}

async function runAsk({ question, topic_id }, button) {
  const ctx = currentContext();
  if (button) setButtonBusy(button, true);
  const hadResult = resultEl.firstChild !== null;
  renderSkeleton();
  if (!hadResult) resultEl.scrollIntoView({ behavior: prefersReducedMotion() ? "auto" : "smooth", block: "start" });
  try {
    const data = await api("/api/ask", {
      method: "POST",
      body: { question: question || "", client_id: ctx ? ctx.client_id : null, topic_id: topic_id || null },
    });
    renderAskResponse(data, { question: question || "" });
  } catch (err) {
    clear(resultEl);
    showError(err);
  } finally {
    if (button) setButtonBusy(button, false);
  }
}

function renderAskResponse(data, { question, newItemId = null }) {
  clear(resultEl);
  if (!data.topic) {
    resultEl.appendChild(
      h(
        "section",
        { className: "card no-match reveal" },
        h("p", null, "No matching topic. Try one of:"),
        h("div", { className: "chips" }, (data.suggestions || []).map((t) => topicChip(t))),
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
  });
  const btn = h("button", { type: "button", className: "btn btn-primary" }, "Capture");
  btn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    if (!text) {
      toast("Paste a message to capture", true);
      return;
    }
    const ctx = currentContext();
    btn.disabled = true;
    btn.textContent = "Capturing…";
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
      btn.disabled = false;
      btn.textContent = "Capture";
    }
  });
  return h(
    "details",
    { className: "capture" },
    h("summary", null, icon("chat"), "Capture a Teams message", icon("chevronDown", "chev")),
    h("div", { className: "capture-body" }, textarea, h("div", { className: "capture-actions" }, btn)),
  );
}

// ---------- result rendering ----------

function renderResult(data, { question, newItemId }) {
  const leftCards = [renderAnswer(data), renderLadder(data.answer), renderExperts(data, question)];
  leftCards.forEach((c, i) => stagger(c, i).classList.add("reveal"));
  const left = h("div", { className: "result-left" }, leftCards);
  const right = h(
    "div",
    { className: "result-right" },
    stagger(
      h("h2", { className: "section-title sources-title reveal" }, "Sources", h("span", { className: "sources-count" }, String(data.sources.length))),
      1,
    ),
    data.sources.map((s, i) => {
      const card = renderSource(s, s.id === newItemId);
      card.classList.add("reveal");
      return stagger(card, i + 2);
    }),
  );
  return h("div", { className: "result" }, left, right);
}

const ANSWER_TONES = { use: "tone-use", verify: "tone-verify", ask_expert: "tone-ask" };

function renderAnswer(data) {
  const a = data.answer;
  const banner = BANNERS[a.action] || BANNERS.ask_expert;
  const competing =
    a.competing && a.competing.length
      ? h(
          "ul",
          { className: "competing" },
          a.competing.map((c, i) =>
            stagger(
              h(
                "li",
                null,
                gradeTile(c.best_grade, { small: true }),
                h("span", { className: "competing-value" }, c.value_display),
                h("span", { className: "muted-text" }, c.item_ids.join(", ")),
              ),
              i,
            ),
          ),
        )
      : null;
  return h(
    "section",
    { className: `card answer-card ${ANSWER_TONES[a.action] || "tone-ask"}` },
    h("div", { className: `banner ${banner.cls}` }, h("span", { className: "banner-dot", "aria-hidden": "true" }), banner.text),
    h(
      "div",
      { className: "answer-body" },
      h(
        "div",
        { className: "answer-head" },
        a.grade ? gradeTile(a.grade) : null,
        h("h2", { className: "answer-headline" }, a.headline),
      ),
      h("p", { className: "answer-detail" }, a.detail),
      competing,
      h(
        "p",
        { className: "answer-meta" },
        `Topic: ${data.topic.label} · Context: ${data.context.label}`,
        data.matched_keywords && data.matched_keywords.length ? ` · Matched: ${data.matched_keywords.join(", ")}` : "",
      ),
    ),
  );
}

function renderLadder(answer) {
  const pointers = {};
  if ((answer.status === "verified" || answer.status === "consistent") && answer.grade) {
    pointers[answer.grade] = [answer.value_display];
  } else if (answer.status === "conflict") {
    for (const c of answer.competing || []) {
      (pointers[c.best_grade] = pointers[c.best_grade] || []).push(c.value_display);
    }
  }
  const rows = GRADES.map((g, i) =>
    stagger(h(
      "div",
      { className: pointers[g] ? "ladder-row lit" : "ladder-row" },
      h("div", { className: `ladder-bar ladder-${g} grade-${g}` }, h("span", { className: "ladder-letter" }, g)),
      h(
        "div",
        { className: "ladder-pointers" },
        (pointers[g] || []).map((label) => h("span", { className: "pointer" }, h("span", { className: "pointer-grade" }, g), label)),
      ),
    ), i),
  );
  return h(
    "section",
    { className: "card ladder-card" },
    h("h2", { className: "section-title" }, "Trust label"),
    h("div", { className: Object.keys(pointers).length ? "ladder has-pointers" : "ladder" }, rows),
    answer.status === "gap" ? h("p", { className: "ladder-note" }, "No applicable source") : null,
    h("p", { className: "legend" }, LEGEND),
  );
}

function renderExperts(data, question) {
  const experts = data.experts || [];
  const card = h("section", { className: "card experts-card" }, h("h2", { className: "section-title" }, "Who can confirm this"));
  if (!experts.length) {
    card.appendChild(h("p", { className: "muted-text" }, "No expert available for this topic and context."));
    return card;
  }
  card.appendChild(
    h(
      "ol",
      { className: "experts" },
      experts.map((ex, i) =>
        h(
          "li",
          { className: "expert" },
          avatar(ex.name, true),
          h(
            "div",
            { className: "expert-head" },
            h("span", null, h("span", { className: "expert-name" }, ex.name), i === 0 ? h("span", { className: "expert-tag" }, "Best match") : null),
            h("span", { className: "expert-score", title: "Routing score" }, String(ex.score)),
          ),
          h("div", { className: "expert-title" }, ex.title),
          h("ul", { className: "expert-reasons" }, ex.reasons.map((r) => h("li", null, r))),
        ),
      ),
    ),
  );

  const actionArea = h("div", { className: "expert-action" });
  const pendingText = (name) => h("p", { className: "pending" }, `Verification requested from ${name} — pending`);
  if (data.open_request) {
    actionArea.appendChild(pendingText(data.open_request.assignee_name));
  } else if (data.answer.action !== "use") {
    const btn = h("button", { type: "button", className: "btn btn-primary" }, `Ask ${firstName(experts[0].name)} to verify`);
    btn.addEventListener("click", async () => {
      btn.disabled = true;
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
        btn.disabled = false;
        showError(err);
      }
    });
    actionArea.appendChild(btn);
  }
  card.appendChild(actionArea);
  return card;
}

function pillClass(code) {
  if (code === "applies") return "pill pill-applies";
  if (code === "superseded" || code === "overridden") return "pill pill-warn";
  if (NOT_APPLICABLE_CODES.has(code)) return "pill pill-na";
  return "pill pill-na";
}

function reasonBadge(r) {
  if (r.code === "base" && r.delta !== null && r.delta !== undefined) {
    return h("span", { className: "badge badge-base" }, String(r.delta));
  }
  if (r.delta !== null && r.delta !== undefined) {
    const positive = r.delta > 0;
    const text = positive ? `+${r.delta}` : r.delta < 0 ? `\u2212${Math.abs(r.delta)}` : "0";
    return h("span", { className: positive ? "badge badge-plus" : "badge badge-minus" }, text);
  }
  if (r.cap) return h("span", { className: "badge badge-cap" }, `max ${r.cap}`);
  return null;
}

function renderSource(s, isNew) {
  const muted = MUTED_STATUSES.has(s.status);
  let owner;
  if (s.kind === "teams_message") owner = h("span", null, `Posted by ${s.author_name || "unknown author"}`);
  else if (s.owner_active) owner = h("span", null, `Owner: ${s.owner_name}`);
  else owner = h("span", { className: "no-owner" }, "No active owner");
  let dated;
  if (s.kind === "teams_message") dated = `on ${s.created_on}`;
  else if (s.last_reviewed_on) dated = `Last reviewed ${s.last_reviewed_on}`;
  else dated = `Created ${s.created_on}`;

  const reasons = h(
    "ul",
    { className: "reasons" },
    s.reasons.map((r, i) => {
      const badge = reasonBadge(r);
      return stagger(h("li", { className: badge ? "reason" : "reason reason-info" }, badge, h("span", { className: "reason-text" }, r.text)), i);
    }),
  );

  const cls = ["card", "source-card"];
  if (muted) cls.push("source-muted");
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
        h(
          "div",
          { className: "source-kind" },
          s.kind_label,
          h("span", { className: "source-id" }, s.id),
          isNew ? h("span", { className: "badge-new" }, "New") : null,
        ),
        h("h3", { className: "source-title" }, s.title),
        h("div", { className: "source-origin" }, s.source),
      ),
      scoreRing(s.score, muted ? null : s.grade),
    ),
    h("div", { className: "source-meta" }, owner, h("span", null, dated)),
    h("p", { className: "statement" }, s.statement),
    h("blockquote", { className: "quote" }, s.kind === "verified_answer" ? s.body : s.quote),
    h("span", { className: pillClass(s.applicability.code) }, s.applicability.text),
    h("details", { className: "why" }, h("summary", null, `Why ${s.grade}?`, icon("chevronRight", "chev")), reasons),
  );
}

// ---------- inbox ----------

async function loadInbox() {
  if (!inboxViewEl.firstChild) {
    inboxViewEl.appendChild(h("div", { className: "skeleton", "aria-busy": "true", "aria-label": "Loading" }, h("div", { className: "sk sk-2" }), h("div", { className: "sk sk-2" })));
  }
  try {
    const data = await api("/api/verifications");
    setInboxCount(data.items);
    renderInbox(data.items);
  } catch (err) {
    clear(inboxViewEl);
    showError(err);
  }
}

function renderInbox(items) {
  clear(inboxViewEl);
  const open = items.filter((v) => v.status === "open" && v.is_assignee).length;
  inboxViewEl.appendChild(
    h(
      "div",
      { className: "inbox-hero reveal" },
      h("h2", { className: "inbox-title" }, "Verification requests"),
      h("p", { className: "inbox-sub" }, open ? `${open} waiting for your answer. Your confirmation becomes a grade-A answer.` : "You're all caught up."),
    ),
  );
  if (!items.length) {
    inboxViewEl.appendChild(
      stagger(h("section", { className: "card empty reveal" }, icon("check"), h("p", { className: "muted-text" }, "No verification requests yet.")), 1),
    );
    return;
  }
  inboxViewEl.appendChild(
    h(
      "div",
      { className: "inbox" },
      items.map((v, i) => {
        const card = renderRequestCard(v);
        card.classList.add("reveal");
        return stagger(card, i + 1);
      }),
    ),
  );
}

function renderRequestCard(v) {
  const head = h(
    "div",
    { className: "request-head" },
    h("span", { className: v.status === "open" ? "status status-open" : "status status-resolved" }, v.status === "open" ? "Open" : "Resolved"),
    h("h3", { className: "request-title" }, `${v.topic.label} — ${v.context_label}`),
  );
  const meta = h(
    "p",
    { className: "request-meta" },
    `Requested by ${v.requester_name} for ${v.assignee_name}${v.is_assignee ? " (you)" : ""} · ${formatDateTime(v.created_at)}`,
  );
  const card = h("article", { className: "card request-card" }, head, meta, h("p", { className: "request-question" }, `“${v.question}”`));
  if (v.status === "resolved" && v.resolution) {
    card.appendChild(renderResolution(v.resolution));
  } else if (v.status === "open" && v.is_assignee) {
    card.appendChild(renderResolveForm(v));
  } else if (v.status === "open") {
    card.appendChild(
      h(
        "div",
        null,
        h("p", { className: "pending" }, `Waiting for ${v.assignee_name}`),
        v.candidates.length ? h("p", { className: "muted-text" }, `Candidates: ${v.candidates.map((c) => `${c.value_display} (${c.grade})`).join(" vs ")}`) : null,
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
    h("p", { className: "muted-text" }, `Valid until ${r.valid_until} · resolved ${formatDateTime(r.resolved_at)} · ${r.item_id}`),
  );
}

function renderResolveForm(v) {
  const radioName = `cand-${v.id}`;
  const radios = [];
  const otherInput = h("input", { type: "number", min: 1, max: 31, step: 1, className: "other-input", placeholder: "e.g. 25", "aria-label": "Other value" });
  const note = h("textarea", { className: "note-input", maxLength: 500, rows: 2, placeholder: "Note (e.g. contract addendum reference)" });
  const validUntil = h("input", { type: "date", className: "date-input", value: addDays(180), min: addDays(1), max: addDays(730), required: true });
  const transcriptArea = h("div", { className: "transcript-area" });

  const candidateRows = v.candidates.map((c, i) => {
    const radio = h("input", {
      type: "radio",
      name: radioName,
      value: c.value,
      id: `${radioName}-${i}`,
      onChange: () => {
        otherInput.value = "";
      },
    });
    radios.push(radio);
    return h(
      "label",
      { className: "candidate", htmlFor: `${radioName}-${i}` },
      radio,
      h("span", { className: "candidate-value" }, c.value_display),
      gradeTile(c.grade, { small: true }),
      h("span", { className: "candidate-title" }, c.title),
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
        resolveBtn.disabled = true;
        try {
          await api(`/api/verifications/${encodeURIComponent(v.id)}/resolve`, {
            method: "POST",
            body: { value, note: note.value.trim(), valid_until: validUntil.value },
          });
          toast(`Verified. Everyone asking this in ${v.context_label} now sees it.`);
          await loadInbox();
        } catch (err) {
          resolveBtn.disabled = false;
          showError(err);
        }
      },
    },
    h("fieldset", { className: "candidates" }, h("legend", null, "Which value is correct?"), candidateRows,
      h("label", { className: "candidate candidate-other" }, h("span", null, "Other value"), otherInput)),
    transcriptArea,
    h("label", { className: "field-label" }, "Note", note),
    h("label", { className: "field-label" }, "Valid until", validUntil),
  );

  const actions = h("div", { className: "resolve-actions" });
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
  const wave = h("span", { className: "wave", "aria-hidden": "true" }, h("span"), h("span"), h("span"), h("span"));
  const btn = h("button", { type: "button", className: "btn btn-voice" }, icon("mic"), wave, label);
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
      btn.className = "btn btn-voice";
      const blobType = (recorder.mimeType || type.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: blobType });
      recorder = null;
      await sendVoice(v, blob, type.filename, btn, form);
    });
    seconds = 0;
    recorder.start();
    btn.className = "btn btn-voice recording";
    label.textContent = "Stop (0s)";
    ticker = setInterval(() => {
      seconds += 1;
      label.textContent = `Stop (${seconds}s)`;
    }, 1000);
    timeout = setTimeout(stopRecording, VOICE_MAX_SECONDS * 1000);
  });
  return btn;
}

async function sendVoice(v, blob, filename, btn, { radios, otherInput, validUntil, transcriptArea }) {
  btn.disabled = true;
  btn.lastElementChild.textContent = "Transcribing…";
  clear(transcriptArea);
  transcriptArea.appendChild(h("p", { className: "muted-text" }, "Transcribing…"));
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
    btn.lastElementChild.textContent = "Answer by voice";
  }
}

boot();
