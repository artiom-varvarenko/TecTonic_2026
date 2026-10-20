// TrustLabel frontend: vanilla ES module, DOM built via h()/icon(); text only through text nodes.

const GRADES = ["A", "B", "C", "D", "E", "F", "G"];
const LEGEND = [
  ["A", "expert-verified"],
  ["B", "strong"],
  ["C", "fair"],
  ["D", "weak"],
  ["E", "poor"],
  ["F", "outdated"],
  ["G", "contradicted"],
];
const BANNERS = {
  use: { text: "Safe to use", tone: "tone-use", icon: "check" },
  verify: { text: "Use with caution — ask for verification", tone: "tone-verify", icon: "alert" },
  ask_expert: { text: "Don't act yet", tone: "tone-ask", icon: "alert" },
};
const MUTED_STATUSES = new Set(["not_applicable", "overridden"]);
const VOICE_MAX_SECONDS = 30;
const SKELETON_DELAY_MS = 150;

const state = {
  me: null,
  view: initialView(),
  inboxCount: 0,
  contextKey: null,
  knownResolved: null,
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

// ---------- icons (hand-drawn 24px strokes; presentation attributes only, CSP-safe) ----------

const SVG_NS = "http://www.w3.org/2000/svg";
const ICONS = {
  search: [["circle", { cx: 11, cy: 11, r: 7 }], ["path", { d: "m20 20-3.5-3.5" }]],
  arrowRight: [["path", { d: "M5 12h14" }], ["path", { d: "m13 6 6 6-6 6" }]],
  check: [["path", { d: "m5 12.5 4.5 4.5L19 7.5" }]],
  clock: [["circle", { cx: 12, cy: 12, r: 9 }], ["path", { d: "M12 7v5l3 2" }]],
  alert: [
    ["path", { d: "M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" }],
    ["path", { d: "M12 9v4" }],
    ["path", { d: "M12 17h.01" }],
  ],
  mic: [["rect", { x: 9, y: 3, width: 6, height: 11, rx: 3 }], ["path", { d: "M5 11a7 7 0 0 0 14 0" }], ["path", { d: "M12 18v3" }]],
  logout: [["path", { d: "M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" }], ["path", { d: "m16 17 5-5-5-5" }], ["path", { d: "M21 12H9" }]],
  chevronDown: [["path", { d: "m6 9 6 6 6-6" }]],
  arrowLeft: [["path", { d: "M19 12H5" }], ["path", { d: "m11 18-6-6 6-6" }]],
  shield: [["path", { d: "M12 3 5 6v5c0 4.4 3 8.3 7 10 4-1.7 7-5.6 7-10V6z" }], ["path", { d: "m9 12 2 2 4-4" }]],
  layers: [["path", { d: "m12 3 9 5-9 5-9-5z" }], ["path", { d: "m3 13 9 5 9-5" }]],
  flag: [["path", { d: "M5 21V4" }], ["path", { d: "M5 4h12l-2.5 4L17 12H5" }]],
  link: [
    ["path", { d: "M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1" }],
    ["path", { d: "M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1" }],
  ],
  copy: [["rect", { x: 9, y: 9, width: 11, height: 11, rx: 2 }], ["path", { d: "M5 15V6a2 2 0 0 1 2-2h9" }]],
  message: [["path", { d: "M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" }]],
  user: [["circle", { cx: 12, cy: 8, r: 4 }], ["path", { d: "M4 21a8 8 0 0 1 16 0" }]],
  calendar: [["rect", { x: 3, y: 4, width: 18, height: 17, rx: 2 }], ["path", { d: "M16 2v4M8 2v4M3 10h18" }]],
  briefcase: [["rect", { x: 3, y: 7, width: 18, height: 13, rx: 2 }], ["path", { d: "M9 7V5a2 2 0 0 1 2-2h2a2 2 0 0 1 2 2v2M3 13h18" }]],
  inbox: [
    ["path", { d: "M22 12h-6l-2 3h-4l-2-3H2" }],
    ["path", { d: "M5.5 5.1 2 12v6a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2v-6l-3.5-6.9A2 2 0 0 0 16.8 4H7.2a2 2 0 0 0-1.7 1.1Z" }],
  ],
  key: [["circle", { cx: 8, cy: 15, r: 4 }], ["path", { d: "m10.8 12.2 9.2-9.2" }], ["path", { d: "m16 7 3 3" }], ["path", { d: "m14 9 2 2" }]],
  mail: [["rect", { x: 3, y: 5, width: 18, height: 14, rx: 2 }], ["path", { d: "m3 7 9 6 9-6" }]],
  cloud: [["path", { d: "M7 18a4 4 0 0 1-.6-8A6 6 0 0 1 18 9a4.5 4.5 0 0 1-.5 9z" }]],
  phone: [["path", { d: "M22 16.9v3a2 2 0 0 1-2.2 2 19.8 19.8 0 0 1-8.6-3.1 19.5 19.5 0 0 1-6-6A19.8 19.8 0 0 1 2.1 4.2 2 2 0 0 1 4.1 2h3a2 2 0 0 1 2 1.7c.1.9.4 1.8.7 2.7a2 2 0 0 1-.5 2.1L8 9.8a16 16 0 0 0 6 6l1.3-1.3a2 2 0 0 1 2.1-.4c.9.3 1.8.6 2.7.7a2 2 0 0 1 1.7 2z" }]],
};

function svgEl(tag, attrs) {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [key, value] of Object.entries(attrs)) el.setAttribute(key, String(value));
  return el;
}

function icon(name, cls = "") {
  const el = svgEl("svg", { viewBox: "0 0 24 24", class: cls ? `icon ${cls}` : "icon", "aria-hidden": "true", focusable: "false" });
  for (const [tag, attrs] of ICONS[name]) el.appendChild(svgEl(tag, attrs));
  return el;
}

function brandMark() {
  // Four arrows of the EU energy label (A, C, E, G) on a rounded tile.
  const el = svgEl("svg", { viewBox: "0 0 28 28", class: "brand-mark", "aria-hidden": "true", focusable: "false" });
  el.appendChild(svgEl("rect", { width: 28, height: 28, rx: 8, fill: "currentColor" }));
  [["#00A651", 9], ["#BFD730", 12], ["#FDB913", 15], ["#ED1C24", 18]].forEach(([fill, w], i) => {
    const y = 6.5 + i * 4;
    const x = 5;
    el.appendChild(svgEl("polygon", { fill, points: `${x},${y} ${x + w - 2.5},${y} ${x + w},${y + 1.5} ${x + w - 2.5},${y + 3} ${x},${y + 3}` }));
  });
  return el;
}

function brand() {
  return h("div", { className: "brand" }, brandMark(), h("span", null, "TrustLabel"));
}

// ---------- small helpers ----------

function toast(message, isError = false) {
  let el = document.getElementById("toast");
  if (!el) {
    el = h("div", { id: "toast", role: "status", "aria-live": "polite" });
    document.body.appendChild(el);
  }
  clear(el);
  el.appendChild(icon(isError ? "alert" : "check", "icon-sm"));
  el.appendChild(h("span", null, message));
  el.className = isError ? "toast toast-show toast-error" : "toast toast-show";
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    el.className = isError ? "toast toast-error" : "toast";
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
  return Number.isNaN(d.getTime())
    ? iso
    : d.toLocaleString(undefined, { day: "numeric", month: "short", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function firstName(name) {
  return String(name || "").split(" ")[0];
}

function initials(name) {
  const parts = String(name || "").split(/\s+/).filter(Boolean);
  if (!parts.length) return "?";
  const last = parts.length > 1 ? parts[parts.length - 1][0] : "";
  return (parts[0][0] + last).toUpperCase();
}

function avatar(name) {
  return h("span", { className: "avatar", "aria-hidden": "true" }, initials(name));
}

function greeting(name) {
  const hour = new Date().getHours();
  const part = hour < 12 ? "Good morning" : hour < 18 ? "Good afternoon" : "Good evening";
  return `${part}, ${firstName(name)}`;
}

function gradeTile(grade, { muted = false, small = false, large = false } = {}) {
  const cls = ["grade-tile", grade ? `grade-${grade}` : "grade-none"];
  if (muted) cls.push("muted");
  if (small) cls.push("grade-tile-small");
  if (large) cls.push("grade-tile-lg");
  return h("span", { className: cls.join(" "), title: grade ? `Grade ${grade}` : "No grade" }, grade || "–");
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
  state.view = initialView();
  state.contextKey = state.me.contexts.length ? state.me.contexts[0].key : null;
  renderShell();
}

function renderLogin() {
  clear(root);
  const username = h("input", { id: "login-username", className: "field", name: "username", autocomplete: "username", required: true, maxLength: 64 });
  const password = h("input", { id: "login-password", className: "field", name: "password", type: "password", autocomplete: "current-password", required: true, maxLength: 256 });
  const errorLine = h("p", { className: "form-error", role: "alert" });
  const submit = h("button", { type: "submit", className: "btn btn-primary btn-block" }, "Log in");
  const sso = h(
    "div",
    { className: "sso", hidden: true },
    h("div", { className: "sso-divider" }, "or"),
    h("a", { className: "btn btn-secondary btn-block btn-google", href: "/api/auth/google/start" }, googleMark(), "Continue with Google"),
  );

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
    h("h2", { className: "login-title" }, "Sign in"),
    h("p", { className: "login-sub" }, "Use your TrustLabel demo account."),
    h("label", { htmlFor: "login-username" }, "Username", username),
    h("label", { htmlFor: "login-password" }, "Password", password),
    errorLine,
    submit,
    sso,
    h("p", { className: "hint" }, "lotte, jonas (consultants) · ellen, pieter, anke (experts)"),
  );

  const aside = h(
    "aside",
    { className: "login-aside" },
    brand(),
    h(
      "div",
      { className: "login-hero" },
      h("div", { className: "login-ladder", "aria-hidden": "true" }, GRADES.map((g) => h("span", null, g))),
      h("h1", null, "Search finds it. ", h("em", null, "TrustLabel shows whether you can rely on it.")),
      h("p", null, "Every source graded A to G, every grade explained, and every doubt routed to the expert who can settle it."),
    ),
    h("p", { className: "login-foot" }, "SD Worx challenge · Tectonic Hackathon 2026"),
  );
  root.appendChild(h("div", { className: "login-wrap" }, aside, h("main", { className: "login-main" }, form)));
  const loginError = new URLSearchParams(location.search).get("login_error");
  if (loginError) {
    errorLine.textContent = LOGIN_ERRORS[loginError] || "Sign-in failed. Try again.";
    history.replaceState(null, "", location.pathname);
  }
  api("/api/auth/providers", { skipAuthRedirect: true })
    .then((providers) => {
      if (providers && providers.google) sso.hidden = false;
    })
    .catch(() => {});
  username.focus();
}

// ---------- shell ----------

let askViewEl = null;
let inboxViewEl = null;
let inboxNavBtn = null;
let inboxCountEl = null;
let askNavBtn = null;
let integrationsViewEl = null;
let integrationsNavBtn = null;
let chatViewEl = null;
let chatNavBtn = null;

function renderShell() {
  clear(root);
  const me = state.me;
  askNavBtn = h(
    "button",
    { className: "nav-btn", type: "button", onClick: () => (state.view === "ask" ? resetAsk() : switchView("ask")) },
    icon("search", "icon-sm"),
    "Ask",
  );
  inboxCountEl = h("span", { className: "nav-count zero" }, "0");
  inboxNavBtn = h(
    "button",
    { className: "nav-btn", type: "button", onClick: () => switchView("inbox") },
    icon("inbox", "icon-sm"),
    "Verification inbox",
    inboxCountEl,
  );
  integrationsNavBtn = h("button", { className: "nav-btn", type: "button", onClick: () => switchView("integrations") }, icon("link", "icon-sm"), "Integrations");
  chatNavBtn = h("button", { className: "nav-btn", type: "button", onClick: () => switchView("chat") }, icon("message", "icon-sm"), "Chat");

  const header = h(
    "header",
    { className: "app-header" },
    brand(),
    h("nav", { className: "nav", "aria-label": "Main" }, askNavBtn, chatNavBtn, inboxNavBtn, integrationsNavBtn),
    h(
      "div",
      { className: "user-area" },
      avatar(me.user.name),
      h("div", { className: "user-meta" }, h("span", { className: "user-name" }, me.user.name), h("span", { className: "user-role" }, me.user.title)),
      h("button", { className: "btn btn-icon", type: "button", title: "Log out", "aria-label": "Log out", onClick: logout }, icon("logout")),
    ),
  );

  askViewEl = h("main", { className: "view view-ask" });
  inboxViewEl = h("main", { className: "view view-inbox" });
  integrationsViewEl = h("main", { className: "view view-integrations" });
  chatViewEl = h("main", { className: "view view-chat" });
  root.appendChild(header);
  root.appendChild(askViewEl);
  root.appendChild(inboxViewEl);
  root.appendChild(integrationsViewEl);
  root.appendChild(chatViewEl);
  issuedKey = null;
  renderAskView();
  renderChatView();
  switchView(state.view);
  refreshInboxCount();
  startPolling();
}

// `?view=inbox` is the target of the "Answer in TrustLabel" button on Teams alerts; `?view=chat` opens the chat.
function initialView() {
  const view = new URLSearchParams(location.search).get("view");
  return ["ask", "chat", "inbox", "integrations"].includes(view) ? view : "ask";
}

function switchView(view) {
  state.view = view;
  if (view !== "integrations") issuedKey = null;
  askViewEl.hidden = view !== "ask";
  inboxViewEl.hidden = view !== "inbox";
  integrationsViewEl.hidden = view !== "integrations";
  chatViewEl.hidden = view !== "chat";
  if (view !== "chat") stopHandsFree();
  for (const [btn, name] of [[askNavBtn, "ask"], [chatNavBtn, "chat"], [inboxNavBtn, "inbox"], [integrationsNavBtn, "integrations"]]) {
    btn.className = view === name ? "nav-btn active" : "nav-btn";
    btn.setAttribute("aria-current", view === name ? "page" : "false");
  }
  if (view === "inbox") loadInbox();
  else if (view === "integrations") loadIntegrations();
  else if (view === "chat") focusChat();
  else if (!askViewEl.classList.contains("has-result")) loadOverview();
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", skipAuthRedirect: true });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) showError(err);
  }
  stopPolling();
  stopHandsFree();
  state.me = null;
  renderLogin();
}

function setInboxCount(items) {
  state.inboxCount = items.filter((v) => v.status === "open" && v.is_assignee).length;
  if (inboxCountEl) {
    inboxCountEl.textContent = String(state.inboxCount);
    inboxCountEl.className = state.inboxCount ? "nav-count" : "nav-count zero";
  }
}

async function refreshInboxCount() {
  try {
    const data = await api("/api/verifications");
    setInboxCount(data.items);
    noteResolutions(data.items);
  } catch (err) {
    showError(err);
  }
}

// "/" focuses the question field, like a search box.
document.addEventListener("keydown", (e) => {
  if (e.key !== "/" || e.metaKey || e.ctrlKey || e.altKey) return;
  const t = e.target;
  if (t instanceof HTMLElement && (t.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(t.tagName))) return;
  if (!questionInput || !askViewEl || askViewEl.hidden || !questionInput.isConnected) return;
  e.preventDefault();
  questionInput.focus();
});

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
    {
      id: "context-select",
      "aria-label": "Context",
      onChange: () => {
        state.contextKey = contextSelect.value;
        if (!askViewEl.classList.contains("has-result")) loadOverview();
      },
    },
    me.contexts.map((c) => h("option", { value: c.key, selected: c.key === state.contextKey }, c.label)),
  );
  questionInput = h("input", {
    id: "question-input",
    className: "question-input",
    type: "text",
    maxLength: 300,
    autocomplete: "off",
    "aria-label": "Question",
    placeholder: "e.g. What's the cut-off for submitting overtime for this month's payroll?",
  });
  const askBtn = h("button", { type: "submit", className: "btn btn-primary ask-btn" }, "Ask");

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
    h("div", { className: "select-wrap" }, icon("briefcase", "icon-sm"), contextSelect, icon("chevronDown", "icon-sm chev")),
    h("div", { className: "search" }, icon("search"), questionInput, h("kbd", { className: "kbd", "aria-hidden": "true" }, "/")),
    askBtn,
  );

  const chips = h("div", { className: "chips" }, h("span", { className: "chips-label" }, "Topics"), me.topics.map((t) => topicChip(t)));
  const panel = h("section", { className: "ask-card" }, form, chips, renderAutoAskToggle());
  if (me.features && me.features.capture) panel.appendChild(renderCapture());

  const intro = h(
    "header",
    { className: "intro" },
    h("p", { className: "eyebrow" }, greeting(me.user.name)),
    h("h1", null, "Ask before you act."),
    h("p", null, "Pick a client or country and ask. You'll see which sources apply, how far each can be trusted, and why."),
  );

  resultEl = h("div", { className: "result-area", "aria-live": "polite" });
  dashboardEl = h("section", { className: "dashboard", "aria-label": "Trust overview" });
  lastOverview = "";
  askViewEl.classList.remove("has-result");
  askViewEl.appendChild(intro);
  askViewEl.appendChild(panel);
  askViewEl.appendChild(resultEl);
  askViewEl.appendChild(dashboardEl);
}

function topicChip(topic) {
  return h(
    "button",
    { type: "button", className: "chip", onClick: () => runAsk({ question: questionInput.value.trim(), topic_id: topic.id }) },
    topic.label,
  );
}

// The user's auto-ask preference ("1"/"0", default on); the Chat view reads and writes the same key.
const AUTO_ASK_KEY = "tl.autoAsk";

function autoAskEnabled() {
  try {
    return localStorage.getItem(AUTO_ASK_KEY) !== "0";
  } catch {
    return true;
  }
}

function setAutoAsk(on) {
  try {
    localStorage.setItem(AUTO_ASK_KEY, on ? "1" : "0");
  } catch {
    // storage unavailable (private mode): the toggle still applies to this page
  }
}

function renderAutoAskToggle() {
  const box = h("input", { type: "checkbox", id: "auto-ask-toggle", checked: autoAskEnabled(), onChange: () => setAutoAsk(box.checked) });
  return h(
    "label",
    { className: "auto-ask-toggle", htmlFor: "auto-ask-toggle", title: "When sources conflict or nothing applies, TrustLabel asks the routed expert for you" },
    box,
    h("span", null, "Ask the owner automatically"),
  );
}

// A verification TrustLabel sent on the user's behalf (or one a colleague already sent for this context).
function renderAutoRequest(v) {
  return h(
    "div",
    { className: "auto-request" },
    h("p", { className: "auto-request-head" }, icon("message", "icon-sm"), `TrustLabel asked ${v.assignee_name} for you`),
    h("p", { className: "drafted-question" }, `“${v.question}”`),
    h("p", { className: "pending" }, icon("clock", "icon-sm"), v.status === "open" ? "Pending — you'll see the answer here once they confirm" : "Answered"),
  );
}

function renderSkeleton() {
  clear(resultEl);
  askViewEl.classList.add("has-result");
  hideDashboard();
  resultEl.appendChild(
    h(
      "div",
      { className: "skeleton", "aria-hidden": "true" },
      h("div", { className: "sk sk-hero" }),
      h("div", { className: "sk-row" }, h("div", { className: "sk sk-side" }), h("div", { className: "sk-col" }, h("div", { className: "sk sk-card" }), h("div", { className: "sk sk-card" }))),
    ),
  );
}

async function withSkeleton(work) {
  const previous = Array.from(resultEl.childNodes);
  const hadResult = askViewEl.classList.contains("has-result");
  const timer = setTimeout(renderSkeleton, SKELETON_DELAY_MS);
  try {
    return await work();
  } catch (err) {
    clear(resultEl);
    previous.forEach((n) => resultEl.appendChild(n));
    askViewEl.classList.toggle("has-result", hadResult);
    if (!hadResult) loadOverview();
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

async function runAsk({ question, topic_id }, button) {
  const ctx = currentContext();
  if (button) {
    button.disabled = true;
    button.textContent = "Asking…";
  }
  try {
    const data = await withSkeleton(() =>
      api("/api/ask", {
        method: "POST",
        body: { question: question || "", client_id: ctx ? ctx.client_id : null, topic_id: topic_id || null, auto_ask: autoAskEnabled() },
      }),
    );
    renderAskResponse(data, { question: question || "" });
  } catch (err) {
    showError(err);
  } finally {
    if (button) {
      button.disabled = false;
      button.textContent = "Ask";
    }
  }
}

function renderAskResponse(data, { question, newItemId = null }) {
  clear(resultEl);
  askViewEl.classList.add("has-result");
  hideDashboard();
  resultEl.appendChild(h("button", { type: "button", className: "back-link", onClick: resetAsk }, icon("arrowLeft", "icon-sm"), "Back to overview"));
  if (data.restricted) {
    resultEl.appendChild(renderRestricted(data.restricted));
    return;
  }
  if (!data.topic) {
    resultEl.appendChild(
      h(
        "section",
        { className: "card no-match" },
        h("h2", { className: "card-title" }, "No matching topic"),
        h("p", { className: "muted-text" }, "TrustLabel covers a few payroll topics in this demo. Try one of these:"),
        h("div", { className: "chips" }, (data.suggestions || []).map((t) => topicChip(t))),
      ),
    );
    return;
  }
  resultEl.appendChild(renderResult(data, { question, newItemId }));
}

function renderRestricted(r) {
  return h(
    "section",
    { className: "card restricted" },
    h("h2", { className: "card-title" }, icon("shield", "icon-sm"), "Not shared: personal data"),
    h("p", null, r.message),
    r.contact
      ? h("p", { className: "restricted-contact" }, icon("user", "icon-xs"), h("strong", null, r.contact.name), h("span", { className: "muted-text" }, r.contact.title))
      : null,
  );
}

// Capture kinds: same values as CaptureKind on the server.
const CAPTURE_KINDS = [
  { value: "teams_message", option: "Teams message", label: "Teams message", empty: "Paste a message to capture", placeholder: "Paste a Teams message, e.g. \"From November meal voucher orders close on the 8th.\"" },
  { value: "email", option: "Email", label: "Email text", empty: "Paste the email to capture", placeholder: "Paste the email body, e.g. \"Hi Lotte, from November meal voucher orders close on the 8th.\"" },
  { value: "meeting_summary", option: "Meeting summary", label: "Meeting summary", empty: "Paste the meeting summary to capture", placeholder: "Paste a Teams meeting recap or your meeting notes, e.g. \"Agreed: meal voucher orders close on the 8th.\"" },
  { value: "phone_call", option: "Phone call notes", label: "Call notes", empty: "Paste your call notes to capture", placeholder: "Paste your notes from the call, e.g. \"Client confirmed meal voucher orders close on the 8th.\"" },
  { value: "note", option: "Other note", label: "Note", empty: "Paste a note to capture", placeholder: "Paste any note, e.g. \"Meal voucher orders close on the 8th.\"" },
];

function renderCapture() {
  const kindOf = () => CAPTURE_KINDS.find((k) => k.value === kindSelect.value) || CAPTURE_KINDS[0];
  const textLabel = h("span", null, CAPTURE_KINDS[0].label);
  const textarea = h("textarea", {
    className: "field capture-text",
    maxLength: 4000,
    rows: 3,
    placeholder: CAPTURE_KINDS[0].placeholder,
  });
  const kindSelect = h(
    "select",
    {
      className: "field",
      onChange: () => {
        const kind = kindOf();
        textLabel.textContent = kind.label;
        textarea.placeholder = kind.placeholder;
        textarea.rows = kind.value === "teams_message" ? 3 : 6;
      },
    },
    CAPTURE_KINDS.map((k) => h("option", { value: k.value }, k.option)),
  );
  const btn = h("button", { type: "button", className: "btn btn-primary" }, "Capture");
  btn.addEventListener("click", async () => {
    const text = textarea.value.trim();
    const kind = kindOf();
    if (!text) {
      toast(kind.empty, true);
      return;
    }
    const ctx = currentContext();
    btn.disabled = true;
    btn.textContent = "Capturing…";
    try {
      const data = await withSkeleton(() =>
        api("/api/capture", {
          method: "POST",
          body: { text, client_id: ctx ? ctx.client_id : null, kind: kind.value },
        }),
      );
      renderAskResponse(data.result, { question: "", newItemId: data.captured_item_id });
      toast(`${kind.option} captured, graded and checked against existing knowledge.`);
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
    h(
      "summary",
      null,
      icon("message", "icon-sm"),
      h("span", null, "Capture a source"),
      h("span", { className: "sub" }, "AI reads it, the rules grade it"),
      icon("chevronDown", "icon-sm chev"),
    ),
    h(
      "div",
      { className: "capture-body" },
      h("label", { className: "field-label" }, "Type", kindSelect),
      h("label", { className: "field-label" }, textLabel, textarea),
      h(
        "div",
        { className: "capture-actions" },
        h("span", { className: "muted-text" }, "Only claims quoted word for word are kept. The claim applies to the selected context."),
        btn,
      ),
    ),
  );
}

// ---------- result rendering ----------

function renderResult(data, { question, newItemId }) {
  return h(
    "div",
    { className: "result" },
    renderAnswer(data),
    h(
      "div",
      { className: "result-grid" },
      h("div", { className: "result-side" }, renderLadder(data.answer), renderExperts(data, question)),
      h(
        "div",
        { className: "result-main" },
        h("div", { className: "section-head" }, h("h2", null, "Sources"), h("span", { className: "count-pill" }, String(data.sources.length))),
        data.sources.map((s) => renderSource(s, s.id === newItemId)),
      ),
    ),
  );
}

function renderAnswer(data) {
  const a = data.answer;
  const banner = BANNERS[a.action] || BANNERS.ask_expert;
  const competing =
    a.competing && a.competing.length
      ? h(
          "div",
          { className: "competing" },
          h("p", { className: "competing-label" }, "Competing answers"),
          h(
            "ul",
            null,
            a.competing.map((c) =>
              h(
                "li",
                null,
                gradeTile(c.best_grade, { small: true }),
                h("span", { className: "competing-value" }, c.value_display),
                h("span", { className: "competing-ids" }, c.item_ids.join(", ")),
              ),
            ),
          ),
        )
      : null;
  return h(
    "section",
    { className: `card answer-card ${banner.tone}` },
    h(
      "div",
      { className: "answer-top" },
      h(
        "div",
        { className: "answer-main" },
        a.grade ? gradeTile(a.grade, { large: true }) : null,
        h(
          "div",
          { className: "answer-text" },
          h("span", { className: "status" }, icon(banner.icon), banner.text),
          h("h2", { className: "answer-headline" }, a.headline),
          h("p", { className: "answer-detail" }, a.detail),
        ),
      ),
      competing,
    ),
    h(
      "div",
      { className: "answer-meta" },
      h("span", null, "Topic ", h("b", null, data.topic.label)),
      h("span", null, "Context ", h("b", null, data.context.label)),
      data.matched_keywords && data.matched_keywords.length ? h("span", null, "Matched ", h("b", null, data.matched_keywords.join(", "))) : null,
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
  const pointed = Object.keys(pointers).length > 0;
  const rows = GRADES.map((g) =>
    h(
      "div",
      { className: pointers[g] ? "ladder-row is-pointed" : "ladder-row" },
      h("div", { className: `ladder-bar ladder-${g} grade-${g}` }, h("span", { className: "ladder-letter" }, g)),
      h(
        "div",
        { className: "ladder-pointers" },
        (pointers[g] || []).map((label) => h("span", { className: "pointer" }, h("span", { className: "pointer-grade" }, g), label)),
      ),
    ),
  );
  const ladderCls = ["ladder"];
  if (pointed) ladderCls.push("has-pointer");
  if (answer.status === "gap") ladderCls.push("is-gap");
  return h(
    "section",
    { className: "card ladder-card" },
    h("h2", { className: "card-title" }, "Trust label", h("small", null, "EU energy-label scale")),
    h("div", { className: ladderCls.join(" ") }, rows),
    answer.status === "gap" ? h("p", { className: "ladder-note" }, "No applicable source") : null,
    h("ul", { className: "legend" }, LEGEND.map(([g, text]) => h("li", null, h("i", { className: `grade-${g}` }), `${g} ${text}`))),
  );
}

function renderExperts(data, question) {
  const experts = data.experts || [];
  const card = h("section", { className: "card experts-card" }, h("h2", { className: "card-title" }, "Who can confirm this"));
  if (!experts.length) {
    card.appendChild(h("p", { className: "muted-text" }, "No expert available for this topic and context."));
    return card;
  }
  card.appendChild(
    h(
      "ol",
      { className: "experts" },
      experts.map((ex) =>
        h(
          "li",
          { className: "expert" },
          h(
            "div",
            { className: "expert-head" },
            avatar(ex.name),
            h("div", { className: "expert-id" }, h("div", { className: "expert-name" }, ex.name), h("div", { className: "expert-title" }, ex.title)),
            h("span", { className: "expert-score", title: "Routing score" }, String(ex.score)),
          ),
          h("ul", { className: "expert-reasons" }, ex.reasons.map((r) => h("li", null, icon("check", "icon-xs"), h("span", null, r)))),
        ),
      ),
    ),
  );

  const actionArea = h("div", { className: "expert-action" });
  const pendingText = (name) => h("p", { className: "pending" }, icon("clock", "icon-sm"), `Verification requested from ${name} — pending`);
  if (data.auto_request) {
    actionArea.appendChild(renderAutoRequest(data.auto_request));
    refreshInboxCount();
  } else if (data.open_request) {
    actionArea.appendChild(pendingText(data.open_request.assignee_name));
  } else if (data.answer.action !== "use") {
    const btn = h(
      "button",
      { type: "button", className: "btn btn-primary btn-block" },
      `Ask ${firstName(experts[0].name)} to verify`,
      icon("arrowRight", "icon-sm"),
    );
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
        actionArea.appendChild(h("p", { className: "drafted-question" }, `Question sent: “${v.question}”`));
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
  const by = s.author_name ? ` by ${s.author_name}` : "";
  if (s.kind === "teams_message") owner = h("span", null, icon("message", "icon-xs"), `Posted by ${s.author_name || "unknown author"}`);
  else if (s.kind === "spott_note") owner = h("span", null, icon("message", "icon-xs"), "Captured from Spott");
  else if (s.kind === "meeting") owner = h("span", null, icon("message", "icon-xs"), s.author_name ? `Said by ${s.author_name} in a meeting` : "Said in a meeting");
  else if (s.kind === "email") owner = h("span", null, icon("message", "icon-xs"), `Email, added${by}`);
  else if (s.kind === "meeting_summary") owner = h("span", null, icon("message", "icon-xs"), `Meeting summary, added${by}`);
  else if (s.kind === "phone_call") owner = h("span", null, icon("message", "icon-xs"), `Said on a phone call${s.author_name ? `, added by ${s.author_name}` : ""}`);
  else if (s.kind === "salesforce_case") owner = h("span", null, icon("message", "icon-xs"), "From a resolved Salesforce case");
  else if (s.kind === "note") owner = h("span", null, icon("message", "icon-xs"), `Note, added${by}`);
  else if (s.owner_active) owner = h("span", null, icon("user", "icon-xs"), `Owner: ${s.owner_name}`);
  else owner = h("span", { className: "no-owner" }, icon("alert", "icon-xs"), "No active owner");
  let dated;
  if (s.kind === "teams_message") dated = `Posted ${s.created_on}`;
  else if (s.kind === "spott_note") dated = `Noted ${s.created_on}`;
  else if (s.kind === "meeting" || s.kind === "phone_call") dated = `Recorded ${s.created_on}`;
  else if (s.kind === "salesforce_case") dated = `Closed ${s.created_on}`;
  else if (s.kind === "email" || s.kind === "meeting_summary" || s.kind === "note") dated = `Added ${s.created_on}`;
  else if (s.last_reviewed_on) dated = `Last reviewed ${s.last_reviewed_on}`;
  else dated = `Created ${s.created_on}`;

  const reasons = h(
    "ul",
    { className: "reasons" },
    s.reasons.map((r) => {
      const badge = reasonBadge(r);
      return h("li", { className: badge ? "reason" : "reason reason-info" }, h("span", { className: "reason-text" }, r.text), badge);
    }),
    h("li", { className: "reason reason-total" }, h("span", null, "Trust score"), h("span", { className: "badge badge-total" }, `${s.score} → ${s.grade}`)),
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
      h("div", { className: "source-score", title: "Trust score" }, String(s.score), h("small", null, "score")),
    ),
    h(
      "div",
      { className: "source-meta" },
      owner,
      h("span", null, icon("calendar", "icon-xs"), dated),
      h("span", { className: pillClass(s.applicability.code) }, s.applicability.text),
    ),
    h("p", { className: "statement" }, s.statement),
    h("blockquote", { className: "quote" }, s.kind === "verified_answer" ? s.body : s.quote),
    h("details", { className: "why" }, h("summary", null, `Why ${s.grade}?`, icon("chevronDown", "icon-xs")), reasons),
  );
}

// ---------- inbox ----------

async function loadInbox() {
  clear(inboxViewEl);
  inboxViewEl.appendChild(h("div", { className: "inbox" }, h("div", { className: "sk sk-card" }), h("div", { className: "sk sk-card" })));
  try {
    const data = await api("/api/verifications");
    setInboxCount(data.items);
    noteResolutions(data.items);
    renderInbox(data.items);
  } catch (err) {
    clear(inboxViewEl);
    showError(err);
  }
}

function renderInbox(items) {
  clear(inboxViewEl);
  const open = items.filter((v) => v.status === "open").length;
  inboxViewEl.appendChild(
    h(
      "header",
      { className: "inbox-head" },
      h("p", { className: "eyebrow" }, `${open} open · ${items.length - open} resolved`),
      h("h1", null, "Verification inbox"),
      h("p", null, "Requests assigned to you, and the ones you sent. One confirmation updates the answer for everyone in that context."),
    ),
  );
  if (!items.length) {
    inboxViewEl.appendChild(h("section", { className: "card inbox-empty" }, icon("inbox"), h("p", null, "No verification requests yet.")));
    return;
  }
  inboxViewEl.appendChild(h("div", { className: "inbox" }, items.map(renderRequestCard)));
}

function renderRequestCard(v) {
  const head = h(
    "div",
    { className: "request-head" },
    h("span", { className: v.status === "open" ? "req-status status-open" : "req-status status-resolved" }, v.status === "open" ? "Open" : "Resolved"),
    h("h3", { className: "request-title" }, `${v.topic.label} — ${v.context_label}`),
  );
  const meta = h(
    "p",
    { className: "request-meta" },
    `Requested by ${v.requester_name} for ${v.assignee_name}${v.is_assignee ? " (you)" : ""} · ${formatDateTime(v.created_at)}`,
  );
  const card = h("article", { className: "card request-card" }, head, meta, h("p", { className: "request-question" }, `“${v.question}”`));
  if (v.asked && v.asked !== v.question) card.appendChild(h("p", { className: "request-asked" }, `Asked: “${v.asked}”`));

  if (v.status === "resolved" && v.resolution) {
    card.appendChild(renderResolution(v.resolution));
  } else if (v.status === "open" && v.is_assignee) {
    card.appendChild(renderResolveForm(v));
  } else if (v.status === "open") {
    card.appendChild(
      h(
        "div",
        { className: "waiting" },
        h("p", { className: "pending" }, icon("clock", "icon-sm"), `Waiting for ${v.assignee_name}`),
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
  const otherInput = h("input", { type: "number", min: 1, max: 31, step: 1, className: "field other-input", placeholder: "e.g. 25", "aria-label": "Other value" });
  const note = h("textarea", { className: "field note-input", maxLength: 500, rows: 2, placeholder: "Note (e.g. contract addendum reference)" });
  const validUntil = h("input", { type: "date", className: "field date-input", value: addDays(180), min: addDays(1), max: addDays(730), required: true });
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

  const resolveBtn = h("button", { type: "submit", className: "btn btn-primary" }, icon("check", "icon-sm"), "Resolve");
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
    h(
      "fieldset",
      { className: "candidates" },
      h("legend", null, "Which value is correct?"),
      candidateRows,
      h("label", { className: "candidate candidate-other" }, h("span", null, "Other value"), otherInput),
    ),
    transcriptArea,
    h("div", { className: "field-grid" }, h("label", { className: "field-label" }, "Note", note), h("label", { className: "field-label" }, "Valid until", validUntil)),
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
  const btn = h(
    "button",
    { type: "button", className: "btn btn-secondary btn-voice" },
    icon("mic", "icon-sm"),
    h("span", { className: "rec-dot", "aria-hidden": "true" }),
    label,
  );
  const ui = { btn, setLabel: (text) => (label.textContent = text) };
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
      btn.className = "btn btn-secondary btn-voice";
      const blobType = (recorder.mimeType || type.mimeType || "audio/webm").split(";")[0];
      const blob = new Blob(chunks, { type: blobType });
      recorder = null;
      await sendVoice(v, blob, type.filename, ui, form);
    });
    seconds = 0;
    recorder.start();
    btn.className = "btn btn-secondary btn-voice recording";
    ui.setLabel("Stop (0s)");
    ticker = setInterval(() => {
      seconds += 1;
      ui.setLabel(`Stop (${seconds}s)`);
    }, 1000);
    timeout = setTimeout(stopRecording, VOICE_MAX_SECONDS * 1000);
  });
  return btn;
}

async function sendVoice(v, blob, filename, ui, { radios, otherInput, validUntil, transcriptArea }) {
  ui.btn.disabled = true;
  ui.setLabel("Transcribing…");
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
      transcriptArea.appendChild(h("p", { className: "voice-note none" }, "No value recognised — pick one manually"));
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
        h(
          "p",
          { className: "voice-note" },
          icon("check", "icon-sm"),
          `Suggested: ${s.value_display}${s.valid_until ? `, valid until ${s.valid_until}` : ""}. Check and click Resolve.`,
        ),
      );
    }
  } catch (err) {
    clear(transcriptArea);
    showError(err);
  } finally {
    ui.btn.disabled = false;
    ui.setLabel("Answer by voice");
  }
}

// ---------- Google sign-in ----------

const LOGIN_ERRORS = {
  google_cancelled: "Google sign-in was cancelled.",
  google_failed: "Google sign-in failed. Try again.",
  google_unlinked: "This Google account is not linked to a TrustLabel user.",
};

function googleMark() {
  const el = svgEl("svg", { viewBox: "0 0 48 48", class: "google-mark", "aria-hidden": "true", focusable: "false" });
  [
    ["#EA4335", "M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"],
    ["#4285F4", "M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"],
    ["#FBBC05", "M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"],
    ["#34A853", "M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.15 1.45-4.92 2.3-8.16 2.3-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"],
  ].forEach(([fill, d]) => el.appendChild(svgEl("path", { fill, d })));
  return el;
}

// ---------- trust overview (dashboard) ----------

const POLL_MS = 15000;
const TOPIC_BADGE = { use: "Safe to use", verify: "Use with caution", ask_expert: "Don't act yet" };
const ACTIVITY_ICONS = { verified: "check", assigned: "inbox", requested: "clock", captured: "message" };
let dashboardEl = null;
let overviewSeq = 0;
let lastOverview = "";
let pollTimer = null;
let integrationsSeq = 0;
let issuedKey = null; // plaintext personal key: kept only in this tab, only right after creation

function plural(n, word) {
  return `${n} ${word}${n === 1 ? "" : "s"}`;
}

function relativeTime(iso) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const seconds = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (seconds < 60) return "just now";
  if (seconds < 3600) return `${Math.floor(seconds / 60)} min ago`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)} h ago`;
  return formatDateTime(iso);
}

function hideDashboard() {
  overviewSeq += 1;
  lastOverview = "";
  if (dashboardEl) clear(dashboardEl);
}

function resetAsk() {
  if (!resultEl) return;
  clear(resultEl);
  askViewEl.classList.remove("has-result");
  loadOverview();
  window.scrollTo({ top: 0, behavior: "smooth" });
}

async function loadOverview() {
  if (!dashboardEl) return;
  const seq = ++overviewSeq;
  if (!dashboardEl.firstChild) dashboardEl.appendChild(dashboardSkeleton());
  const ctx = currentContext();
  const url = ctx && ctx.client_id ? `/api/overview?client_id=${encodeURIComponent(ctx.client_id)}` : "/api/overview";
  try {
    const data = await api(url);
    if (seq !== overviewSeq) return;
    const snapshot = JSON.stringify(data);
    if (snapshot === lastOverview) return;
    lastOverview = snapshot;
    renderDashboard(data);
  } catch {
    // The overview is supplementary: on failure drop it quietly instead of interrupting the ask flow.
    if (seq === overviewSeq) clear(dashboardEl);
  }
}

function dashboardSkeleton() {
  return h(
    "div",
    { className: "dash-skeleton", "aria-hidden": "true" },
    h("div", { className: "kpis" }, [0, 1, 2, 3].map(() => h("div", { className: "sk sk-kpi" }))),
    h("div", { className: "topic-board" }, [0, 1, 2].map(() => h("div", { className: "sk sk-topic" }))),
  );
}

function renderDashboard(data) {
  clear(dashboardEl);
  dashboardEl.appendChild(
    h(
      "div",
      { className: "dash-head" },
      h("div", null, h("h2", null, "Trust overview"), h("p", { className: "muted-text" }, `What you can rely on today in ${data.context.label}.`)),
      h("span", { className: "live-pill", title: "Refreshes every 15 seconds" }, h("span", { className: "live-dot" }), "Live"),
    ),
  );
  dashboardEl.appendChild(renderKpis(data.health, data.requests));
  dashboardEl.appendChild(h("div", { className: "topic-board" }, data.topics.map(renderTopicCard)));
  dashboardEl.appendChild(
    h("div", { className: "dash-grid" }, renderAttention(data.attention), h("div", { className: "dash-col" }, renderActivity(data.activity))),
  );
}

function kpi({ iconName, label, value, sub, extra = null, tone = "", onClick = null }) {
  const cls = ["kpi"];
  if (tone) cls.push(`kpi-${tone}`);
  if (onClick) cls.push("kpi-link");
  return h(
    onClick ? "button" : "div",
    { className: cls.join(" "), type: onClick ? "button" : null, onClick },
    h("span", { className: "kpi-label" }, icon(iconName, "icon-sm"), label),
    h("span", { className: "kpi-value" }, value),
    h("span", { className: "kpi-sub" }, sub),
    extra,
  );
}

function renderKpis(health, requests) {
  const undecided = health.topics - health.safe_topics;
  return h(
    "div",
    { className: "kpis" },
    kpi({
      iconName: "shield",
      label: "Safe to use",
      value: `${health.safe_topics}/${health.topics}`,
      sub: undecided ? `${plural(undecided, "topic")} need${undecided === 1 ? "s" : ""} a decision` : "Every topic has a trusted answer",
      tone: undecided ? "" : "good",
    }),
    kpi({
      iconName: "layers",
      label: "Current sources",
      value: String(health.current),
      sub: `${health.in_scope} in scope · ${health.verified} expert-verified`,
      extra: gradeBar(health.grades),
    }),
    kpi({
      iconName: "flag",
      label: "Knowledge debt",
      value: String(health.attention),
      sub: health.attention ? "sources need their owner" : "Nothing overdue or superseded",
      tone: health.attention ? "warn" : "good",
    }),
    kpi({
      iconName: "inbox",
      label: "Verifications",
      value: String(requests.awaiting_you + requests.sent_open),
      sub: `${requests.awaiting_you} awaiting you · ${requests.sent_open} sent · ${requests.resolved} resolved`,
      onClick: () => switchView("inbox"),
    }),
  );
}

function gradeBar(grades) {
  const present = GRADES.filter((g) => grades[g]);
  const bar = h("span", {
    className: present.length ? "grade-bar" : "grade-bar is-empty",
    role: "img",
    "aria-label": present.length ? `Current sources by grade: ${present.map((g) => `${grades[g]} ${g}`).join(", ")}` : "No current sources",
  });
  for (const g of present) {
    for (let i = 0; i < grades[g]; i += 1) {
      bar.appendChild(h("span", { className: `grade-seg grade-${g}`, title: `${plural(grades[g], "source")} graded ${g}` }, i === 0 ? g : ""));
    }
  }
  return bar;
}

function renderTopicCard(t) {
  const a = t.answer;
  const banner = BANNERS[a.action] || BANNERS.ask_expert;
  let visual;
  let value;
  let detail;
  if (a.status === "conflict") {
    visual = h("span", { className: "topic-tiles" }, a.competing.map((c) => gradeTile(c.best_grade, { small: true })));
    value = "Sources disagree";
    detail = a.competing.map((c) => `${c.value_display} (${c.best_grade})`).join(" vs ");
  } else if (a.status === "gap") {
    visual = gradeTile(null, { small: true });
    value = "No applicable source";
    detail = a.detail;
  } else {
    visual = gradeTile(a.grade, { small: true });
    value = a.value_display;
    detail =
      a.status === "verified" && a.verified_by
        ? `Verified by ${a.verified_by.name}`
        : `${plural(t.current_count, "current source")} agree${t.current_count === 1 ? "s" : ""}`;
  }
  const note = t.open_request
    ? h("span", { className: "topic-pending" }, icon("clock", "icon-xs"), `Pending with ${t.open_request.assignee_name}`)
    : h("span", { className: "topic-meta" }, t.top_expert ? `Expert: ${t.top_expert.name}` : "No other expert on file");
  return h(
    "button",
    { type: "button", className: `topic-card ${banner.tone}`, onClick: () => runAsk({ question: "", topic_id: t.topic.id }) },
    h("span", { className: "topic-top" }, h("span", { className: "topic-label" }, t.topic.label), h("span", { className: "status" }, icon(banner.icon), TOPIC_BADGE[a.action] || banner.text)),
    h("span", { className: "topic-main" }, visual, h("span", { className: "topic-value" }, value)),
    h("span", { className: "topic-detail" }, detail),
    h("span", { className: "topic-foot" }, note, h("span", { className: "topic-go" }, plural(t.source_count, "source"), icon("arrowRight", "icon-xs"))),
  );
}

function renderAttention(items) {
  const card = h("section", { className: "card attention-card" }, h("h2", { className: "card-title" }, "Knowledge debt", h("small", null, "Sources that need their owner")));
  if (!items.length) {
    card.appendChild(h("p", { className: "empty-note" }, icon("check", "icon-sm"), "Nothing overdue, orphaned or superseded here."));
    return card;
  }
  card.appendChild(
    h(
      "ul",
      { className: "attention-list" },
      items.map((a) => {
        const owner = a.owner_name ? `Owner: ${a.owner_name}` : ["Teams message", "Spott note"].includes(a.kind_label) ? `${a.kind_label}, no owner` : "No active owner";
        return h(
          "li",
          { className: "attention-item" },
          gradeTile(a.grade, { small: true }),
          h(
            "div",
            { className: "attention-body" },
            h("div", { className: "attention-title" }, h("span", null, a.title), h("span", { className: "source-id" }, a.id)),
            h("div", { className: "attention-owner" }, `${a.kind_label} · ${owner}`),
            h("ul", { className: "issue-list" }, a.issues.map((text) => h("li", null, text))),
          ),
        );
      }),
    ),
  );
  return card;
}

function renderActivity(items) {
  const card = h("section", { className: "card activity-card" }, h("h2", { className: "card-title" }, "Recent activity", h("small", null, "Verifications and Spott notes you can see")));
  if (!items.length) {
    card.appendChild(h("p", { className: "empty-note" }, icon("clock", "icon-sm"), "No verifications yet. Confirmed answers appear here for the whole client team."));
    return card;
  }
  card.appendChild(
    h(
      "ol",
      { className: "activity-list" },
      items.map((e) =>
        h(
          "li",
          { className: `activity-item act-${e.kind}` },
          h("span", { className: "act-icon", "aria-hidden": "true" }, icon(ACTIVITY_ICONS[e.kind] || "clock", "icon-xs")),
          h("span", { className: "act-text" }, e.text),
          h("time", { className: "act-time", dateTime: e.at, title: formatDateTime(e.at) }, relativeTime(e.at)),
        ),
      ),
    ),
  );
  return card;
}

// ---------- integrations ----------

const SALESFORCE_ENV = ["SALESFORCE_DOMAIN", "SALESFORCE_CLIENT_ID", "SALESFORCE_CLIENT_SECRET"];

function absoluteUrl(url) {
  return /^https?:\/\//.test(url) ? url : `${location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

async function loadIntegrations() {
  const seq = ++integrationsSeq;
  if (!integrationsViewEl.firstChild) {
    integrationsViewEl.appendChild(h("div", { className: "integrations", "aria-hidden": "true" }, [0, 1, 2, 3].map(() => h("div", { className: "sk sk-card" }))));
  }
  try {
    const data = await api("/api/integrations");
    if (seq === integrationsSeq && state.view === "integrations") renderIntegrations(data);
  } catch (err) {
    if (seq !== integrationsSeq) return;
    clear(integrationsViewEl);
    integrationsViewEl.appendChild(h("section", { className: "card inbox-empty" }, icon("alert"), h("p", null, "Integrations could not be loaded.")));
    showError(err);
  }
}

function renderIntegrations(data) {
  clear(integrationsViewEl);
  integrationsViewEl.appendChild(
    h(
      "header",
      { className: "integrations-head" },
      h("p", { className: "eyebrow" }, "Channels"),
      h("h1", null, "Integrations"),
      h("p", null, "TrustLabel works inside the tools your teams already use."),
    ),
  );
  const keyActive = Boolean(data.key && data.key.active);
  integrationsViewEl.appendChild(
    h(
      "div",
      { className: "integrations" },
      renderKeyCard(data.key),
      renderTeamsCard(data.teams, keyActive),
      renderOutlookCard(data.outlook, keyActive),
      renderSalesforceCard(data.salesforce),
      renderSpottCard(data.spott, data.is_admin),
      renderTalkdeskCard(data.talkdesk),
      data.meetings ? renderMeetingsCard(data.meetings) : null,
      data.auto_ask ? renderAutoAskCard(data.auto_ask) : null,
    ),
  );
}

function renderAutoAskCard(autoAsk) {
  const claude = autoAsk.drafting === "claude";
  return integrationCard(
    { iconName: "message", logo: "claude", title: "Auto-ask", subtitle: "Questions to experts, drafted for you", status: claude ? "Claude" : "Template", tone: claude ? "resolved" : "idle" },
    [
      h("p", { className: "connect-copy" }, "When sources conflict or nothing applies, TrustLabel asks the routed expert with one neutral question naming every competing value, its source and grade. Turn it off with “Ask the owner automatically” on the Ask page."),
      facts([
        ["Drafting", claude ? `Claude (${autoAsk.model})` : "Fixed template"],
        ["Checks", "One line · ≤ 300 chars · every value named"],
      ]),
      claude ? null : h("p", { className: "muted-text" }, "Set ANTHROPIC_API_KEY to let Claude draft the question."),
    ],
  );
}

function integrationCard({ iconName, logo, title, subtitle, status = null, tone = "idle", wide = false }, body) {
  return h(
    "section",
    { className: wide ? "card connect-card integration-card integration-wide" : "card connect-card integration-card" },
    h(
      "div",
      { className: "connect-head" },
      h("span", { className: `connect-logo logo-${logo}`, "aria-hidden": "true" }, icon(iconName)),
      h("div", { className: "connect-id" }, h("h2", { className: "card-title" }, title), h("p", { className: "muted-text" }, subtitle)),
      status ? h("span", { className: `req-status status-${tone}` }, status) : null,
    ),
    body,
  );
}

function facts(rows) {
  return h(
    "dl",
    { className: "integration-facts" },
    rows.map(([label, value]) => h("div", { className: "integration-fact" }, h("dt", null, label), h("dd", null, value))),
  );
}

function steps(items) {
  return h("ol", { className: "integration-steps" }, items.map((item) => h("li", null, item)));
}

function renderKeyCard(key) {
  const active = Boolean(key && key.active);
  const body = [];
  if (issuedKey && active) {
    body.push(
      h(
        "div",
        { className: "token-box" },
        h("p", { className: "integration-warning" }, icon("alert", "icon-xs"), "Shown once: copy it now. It replaces your previous key."),
        copyRow("Personal key", issuedKey.token),
        h("p", { className: "muted-text" }, `Send it as header X-API-Key or Authorization: Bearer. Expires ${formatDateTime(issuedKey.expires_at)}.`),
      ),
    );
  } else if (active) {
    body.push(h("p", { className: "connect-copy" }, key.expires_at ? `Active · expires ${formatDateTime(key.expires_at)}` : "Active"));
  } else {
    body.push(h("p", { className: "connect-copy" }, "Create a key and paste it into Teams or the Outlook add-in. Answers are scoped to your client portfolio."));
  }
  const create = h("button", { type: "button", className: active ? "btn btn-secondary" : "btn btn-primary" }, icon("key", "icon-sm"), "Create key");
  create.addEventListener("click", async () => {
    if (active && !window.confirm("A new key replaces your current key. Teams and Outlook stop working until you paste the new one. Continue?")) return;
    create.disabled = true;
    try {
      issuedKey = await api("/api/connections/teams", { method: "POST" });
      toast("Key created. Copy it now: it is shown only once.");
      await loadIntegrations();
    } catch (err) {
      create.disabled = false;
      showError(err);
    }
  });
  const actions = h("div", { className: "connect-actions" }, create);
  if (active) {
    const revoke = h("button", { type: "button", className: "btn btn-ghost" }, "Revoke");
    revoke.addEventListener("click", async () => {
      if (!window.confirm("Revoke your personal key? Teams and Outlook lose access right away.")) return;
      revoke.disabled = true;
      try {
        await api("/api/connections/teams", { method: "DELETE" });
        issuedKey = null;
        toast("Personal key revoked.");
        await loadIntegrations();
      } catch (err) {
        revoke.disabled = false;
        showError(err);
      }
    });
    actions.appendChild(revoke);
  }
  body.push(actions);
  return integrationCard(
    { iconName: "key", logo: "key", title: "Personal key", subtitle: "Used by Teams and the Outlook add-in", status: active ? "Active" : "No key", tone: active ? "resolved" : "idle", wide: true },
    body,
  );
}

function teamsSyncFacts(sync) {
  const permissions = `Application, admin consent: ${sync.permissions.join(", ")} (names: ${sync.name_permissions.join(", ")})`;
  if (!sync.configured) {
    const how = sync.graph_configured
      ? "Off: set TEAMS_SYNC_CHANNELS (teamId/channelId,…) and OPENAI_API_KEY"
      : "Off: set MS_TENANT_ID, MS_CLIENT_ID, MS_CLIENT_SECRET and TEAMS_SYNC_CHANNELS";
    return [["Channel sync", how], ["Graph permissions", permissions]];
  }
  return [
    ["Channel sync", `On: ${sync.channels} channel(s), checked every minute${sync.last_error ? "; last check failed" : ""}`],
    ["Last checked", sync.last_poll_at ? relativeTime(sync.last_poll_at) : "Not yet"],
    ["Messages read", `${sync.messages_seen} · ${sync.items_created} became sources`],
    ["Graph permissions", permissions],
  ];
}

function renderTeamsCard(teams, keyActive) {
  return integrationCard(
    { iconName: "message", logo: "teams", title: "Microsoft Teams", subtitle: "Ask TrustLabel from Teams over MCP", status: keyActive ? "Ready" : "Needs key", tone: keyActive ? "resolved" : "idle" },
    [
      h("p", { className: "connect-copy" }, "A Teams agent asks TrustLabel directly and gets the same grades, reasons and expert routing, scoped to your client portfolio."),
      facts([
        [
          "Expert alerts",
          teams.alerts.configured
            ? `On: new requests go to the routed expert in Teams (${teams.alerts.mapped_experts} mapped)`
            : "Off: set TEAMS_WORKFLOW_URL and TRUSTLABEL_TEAMS_USERS",
        ],
        ...teamsSyncFacts(teams.sync),
      ]),
      copyRow("MCP server URL", absoluteUrl(teams.mcp_url)),
      steps([
        "Serve TrustLabel over public HTTPS; Teams can't reach 127.0.0.1.",
        "Copilot Studio: your agent → Tools → Add a tool → New tool → Model Context Protocol.",
        ["Server URL: the MCP server URL above, authentication API key, header ", h("code", null, "X-API-Key"), ", value: your personal key."],
        "Publish the agent to Microsoft Teams and ask it about a client.",
      ]),
    ],
  );
}

function renderOutlookCard(outlook, keyActive) {
  return integrationCard(
    { iconName: "mail", logo: "outlook", title: "Outlook", subtitle: "Add-in for Outlook: a TrustLabel pane next to every client email.", status: keyActive ? "Ready" : "Needs key", tone: keyActive ? "resolved" : "idle" },
    [
      copyRow("Manifest URL", absoluteUrl(outlook.manifest_url)),
      steps([
        ["In Outlook on the web open ", h("code", null, "https://aka.ms/olksideload"), " (opens Add-ins → My add-ins)."],
        "Custom add-ins → Add a custom add-in → Add from URL → paste the manifest URL.",
        "Open a client email → TrustLabel → paste your personal key.",
      ]),
    ],
  );
}

function renderSalesforceCard(sf) {
  const meta = { iconName: "cloud", logo: "salesforce", title: "Salesforce Service Cloud", subtitle: "MyServicePoint cases" };
  if (!sf.configured) {
    return integrationCard({ ...meta, status: "Not connected" }, [
      h("p", { className: "connect-copy" }, "Every new case gets an internal TrustLabel comment: verdict, sources and who can verify."),
      h("p", { className: "muted-text" }, "Set these environment variables on the server to connect:"),
      h("ul", { className: "integration-env" }, SALESFORCE_ENV.map((name) => h("li", null, h("code", null, name)))),
    ]);
  }
  return integrationCard({ ...meta, status: sf.last_error ? "Check failed" : "Connected", tone: sf.last_error ? "open" : "resolved" }, [
    h("p", { className: "connect-copy" }, "Every new case gets an internal TrustLabel comment: verdict, sources and who can verify."),
    facts([
      ["Domain", sf.domain || "–"],
      ["Last checked", sf.last_poll_at ? relativeTime(sf.last_poll_at) : "Not yet"],
      ["Cases briefed", String(sf.cases_briefed)],
      ["Sources sync", sf.sources_sync ? "On · closed cases and logged calls" : "Off (needs OpenAI extraction)"],
      ...(sf.sources_sync ? [["Sources added", String(sf.sources_synced)]] : []),
    ]),
    sf.last_error ? h("p", { className: "integration-warning" }, icon("alert", "icon-xs"), "Last check failed") : null,
    sf.sources_last_error ? h("p", { className: "integration-warning" }, icon("alert", "icon-xs"), "Last sources sync failed") : null,
  ]);
}

function renderSpottCard(spott, isAdmin) {
  const body = [];
  if (spott.connected) {
    body.push(
      facts([
        ["Source", spott.source === "environment" ? "Environment" : "Connected in app"],
        ["Webhook ready", spott.webhook_ready ? "Yes" : "No"],
        ["Users", spott.users === null || spott.users === undefined ? "–" : String(spott.users)],
        ["Notes captured", String(spott.notes_captured)],
        ["Last delivery", spott.last_delivery_at ? relativeTime(spott.last_delivery_at) : "None yet"],
      ]),
      copyRow("Webhook URL", absoluteUrl(spott.webhook_url)),
    );
    if (spott.clients.length) {
      body.push(
        h(
          "ul",
          { className: "integration-clients", "aria-label": "Client mapping" },
          spott.clients.map((c) =>
            h(
              "li",
              { className: c.found ? "is-found" : "is-missing" },
              c.found ? icon("check", "icon-xs") : icon("alert", "icon-xs"),
              h("span", null, c.name),
              c.found ? null : h("span", { className: "muted-text" }, "not in Spott"),
            ),
          ),
        ),
      );
    }
  } else {
    body.push(h("p", { className: "connect-copy" }, "Recruiter notes on your clients become graded sources, with the recruiter as owner."));
  }
  if (isAdmin) body.push(spottForm(spott));
  else body.push(h("p", { className: "muted-text" }, "Only an admin can connect or replace the Spott workspace."));
  return integrationCard(
    { iconName: "briefcase", logo: "spott", title: "Spott", subtitle: "Optional · recruitment CRM", status: spott.connected ? "Connected" : "Not connected", tone: spott.connected ? "resolved" : "idle" },
    body,
  );
}

function spottForm(spott) {
  const apiKey = h("input", { type: "password", className: "field", autocomplete: "off", maxLength: 500, required: true });
  const secret = h("input", { type: "password", className: "field", autocomplete: "off", maxLength: 500 });
  const errorEl = h("p", { className: "form-error", role: "alert" });
  const submit = h("button", { type: "submit", className: "btn btn-primary" }, icon("link", "icon-sm"), "Connect");
  const actions = h("div", { className: "connect-actions" }, submit);
  if (spott.connected && spott.source === "app") {
    const disconnect = h("button", { type: "button", className: "btn btn-ghost" }, "Disconnect");
    disconnect.addEventListener("click", async () => {
      if (!window.confirm("Disconnect the Spott workspace? New Spott notes stop arriving.")) return;
      disconnect.disabled = true;
      try {
        await api("/api/integrations/spott", { method: "DELETE" });
        toast("Spott disconnected.");
        await loadIntegrations();
      } catch (err) {
        disconnect.disabled = false;
        showError(err);
      }
    });
    actions.appendChild(disconnect);
  }
  return h(
    "form",
    {
      className: "integration-form",
      autocomplete: "off",
      onSubmit: async (e) => {
        e.preventDefault();
        errorEl.textContent = "";
        const key = apiKey.value.trim();
        if (!key) {
          errorEl.textContent = "Enter the Spott API key.";
          return;
        }
        submit.disabled = true;
        try {
          await api("/api/integrations/spott", { method: "POST", body: { api_key: key, webhook_secret: secret.value.trim() || null } });
          apiKey.value = "";
          secret.value = "";
          toast("Spott workspace connected.");
          await loadIntegrations();
        } catch (err) {
          submit.disabled = false;
          if (err instanceof ApiError && (err.status === 400 || err.status === 403)) errorEl.textContent = err.detail;
          else showError(err);
        }
      },
    },
    h("h3", { className: "integration-form-title" }, spott.connected ? "Replace workspace" : "Connect workspace"),
    h("label", { className: "field-label" }, "API key", apiKey),
    h("label", { className: "field-label" }, "Webhook signing secret (optional)", secret),
    errorEl,
    actions,
  );
}

function renderTalkdeskCard(talkdesk) {
  return integrationCard({ iconName: "phone", logo: "talkdesk", title: "Talkdesk", subtitle: "Calls" }, h("p", { className: "connect-copy" }, talkdesk.text));
}

const MEETING_ACCEPT = ".mp3,.m4a,.wav,.webm,.ogg,.mp4";
const MEETING_STATUS = { queued: ["Queued", "idle"], transcribing: ["Transcribing", "idle"], done: ["Done", "resolved"], failed: ["Failed", "open"] };
const RECORDING_KINDS = { meeting: "Meeting", phone_call: "Phone call" };
let meetingsTimer = null;

function renderMeetingsCard(meetings) {
  const meta = { iconName: "mic", logo: "elevenlabs", title: "Recordings · ElevenLabs Scribe", subtitle: "Recorded meetings and phone calls become graded sources" };
  const copy = h("p", { className: "connect-copy" }, "Scribe transcribes the recording per speaker; only claims quoted verbatim become a source, graded against existing knowledge. You own what you upload.");
  const folder = meetings.folder;
  const folderInfo = folder.configured
    ? facts([
        ["Watched folder", "Configured"],
        ["Owner", folder.owner_name || "–"],
        ["Last scan", folder.last_scan_at ? relativeTime(folder.last_scan_at) : "Not yet"],
        ["Files processed", String(folder.files_processed)],
      ])
    : h("p", { className: "muted-text" }, "No watched folder. Set TRUSTLABEL_MEETINGS_DIR and TRUSTLABEL_MEETINGS_OWNER to turn synced Teams recordings into sources automatically; files in its calls/ subfolder are phone calls.");
  if (!meetings.configured) {
    return integrationCard({ ...meta, status: "Not configured" }, [
      copy,
      h("p", { className: "muted-text" }, "Set these environment variables on the server to enable:"),
      h("ul", { className: "integration-env" }, ["ELEVENLABS_API_KEY", "OPENAI_API_KEY"].map((name) => h("li", null, h("code", null, name)))),
    ]);
  }
  const listEl = h("ul", { className: "meeting-list", "aria-label": "Your recordings", "aria-live": "polite" });
  const fileInput = h("input", { type: "file", className: "meeting-file", accept: MEETING_ACCEPT, required: true });
  const kindSelect = h("select", { className: "field" }, Object.entries(RECORDING_KINDS).map(([value, label]) => h("option", { value }, label)));
  const errorEl = h("p", { className: "form-error", role: "alert" });
  const submit = h("button", { type: "submit", className: "btn btn-primary" }, icon("mic", "icon-sm"), "Upload recording");
  const form = h(
    "form",
    {
      className: "integration-form",
      onSubmit: async (e) => {
        e.preventDefault();
        errorEl.textContent = "";
        const file = fileInput.files && fileInput.files[0];
        if (!file) {
          errorEl.textContent = "Choose a recording first.";
          return;
        }
        if (file.size > meetings.max_mb * 1000000) {
          errorEl.textContent = `Recording too large (max ${meetings.max_mb} MB).`;
          return;
        }
        const fd = new FormData();
        fd.append("recording", file, file.name);
        fd.append("kind", kindSelect.value);
        submit.disabled = true;
        try {
          await api("/api/meetings", { method: "POST", formData: fd });
          fileInput.value = "";
          toast("Recording queued for transcription.");
          refreshMeetings(listEl);
        } catch (err) {
          if (err instanceof ApiError && [413, 415, 422, 429, 503].includes(err.status)) errorEl.textContent = err.detail;
          else showError(err);
        } finally {
          submit.disabled = false;
        }
      },
    },
    h("h3", { className: "integration-form-title" }, "Upload a meeting or call recording"),
    h("label", { className: "field-label" }, "Type", kindSelect),
    h("label", { className: "field-label" }, `mp3, m4a, wav, webm, ogg or mp4 · max ${meetings.max_mb} MB`, fileInput),
    errorEl,
    h("div", { className: "connect-actions" }, submit),
  );
  refreshMeetings(listEl);
  return integrationCard(
    { ...meta, status: folder.configured ? "Watching folder" : "Upload only", tone: folder.configured ? "resolved" : "idle" },
    [copy, form, listEl, folderInfo, folder.last_error ? h("p", { className: "integration-warning" }, icon("alert", "icon-xs"), "Last folder scan failed") : null],
  );
}

function renderMeetingList(listEl, items) {
  clear(listEl);
  if (!items.length) {
    listEl.appendChild(h("li", { className: "muted-text" }, "No recordings yet."));
    return;
  }
  for (const m of items.slice(0, 8)) {
    const [label, tone] = MEETING_STATUS[m.status] || [m.status, "idle"];
    let detail = m.origin === "folder" ? "From folder" : "Uploaded";
    if (m.status === "done") detail = m.claims ? plural(m.claims, "claim") : "No verbatim claim";
    if (m.status === "failed") detail = m.error || "Error";
    detail = `${RECORDING_KINDS[m.kind] || "Meeting"} · ${detail}`;
    listEl.appendChild(
      h("li", null, h("span", { className: "meeting-name", title: m.name }, m.name), h("span", { className: "muted-text" }, detail), h("span", { className: `req-status status-${tone}` }, label)),
    );
  }
}

// Polls only while a recording is queued or transcribing, and only while this card is on screen.
async function refreshMeetings(listEl, previousInFlight = 0) {
  clearTimeout(meetingsTimer);
  let data;
  try {
    data = await api("/api/meetings");
  } catch {
    return;
  }
  renderMeetingList(listEl, data.items);
  if (previousInFlight > data.in_flight) toast("Recording processed.");
  if (data.in_flight > 0) {
    meetingsTimer = setTimeout(() => {
      if (listEl.isConnected && state.view === "integrations") refreshMeetings(listEl, data.in_flight);
    }, 3000);
  }
}

function copyRow(label, value) {
  const button = h("button", { type: "button", className: "btn btn-icon copy-btn", title: `Copy ${label}`, "aria-label": `Copy ${label}` }, icon("copy", "icon-sm"));
  let resetTimer = null;
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      clear(button);
      button.appendChild(icon("check", "icon-sm"));
      button.classList.add("is-copied");
      toast("Copied");
      clearTimeout(resetTimer);
      resetTimer = setTimeout(() => {
        clear(button);
        button.appendChild(icon("copy", "icon-sm"));
        button.classList.remove("is-copied");
      }, 1500);
    } catch {
      toast("Copy failed; select the text instead", true);
    }
  });
  return h("div", { className: "copy-row" }, h("span", { className: "copy-label" }, label), h("code", { className: "copy-value" }, value), button);
}

// ---------- live updates ----------

function startPolling() {
  stopPolling();
  pollTimer = setInterval(poll, POLL_MS);
}

function stopPolling() {
  clearInterval(pollTimer);
  pollTimer = null;
  state.knownResolved = null;
}

// Requests this user sent that an expert has since resolved; the first call only records the baseline.
function noteResolutions(items) {
  const resolved = items.filter((v) => v.status === "resolved" && !v.is_assignee && v.resolution);
  if (!state.knownResolved) {
    state.knownResolved = new Set(resolved.map((v) => v.id));
    return [];
  }
  const fresh = resolved.filter((v) => !state.knownResolved.has(v.id));
  fresh.forEach((v) => state.knownResolved.add(v.id));
  return fresh;
}

async function poll() {
  if (!state.me || document.visibilityState !== "visible") return;
  let data;
  try {
    data = await api("/api/verifications");
  } catch {
    return; // offline, or a 401 that already switched to the login view
  }
  if (!state.me) return;
  setInboxCount(data.items);
  const fresh = noteResolutions(data.items);
  if (fresh.length) {
    const v = fresh[0];
    toast(`${v.assignee_name} verified ${v.topic.label} for ${v.context_label}: ${v.resolution.value_display}.`);
  }
  if (state.view === "ask" && !askViewEl.classList.contains("has-result")) loadOverview();
}

// ---------- chat: the standalone surface, by text or voice ----------

const CHAT_PTT_MAX_SECONDS = 15;
const CHAT_TAP_MS = 350; // shorter press = tap to start, tap again to send; longer = hold to talk
const WAKE_MAX_SECONDS = 10;
const WAKE_SILENCE_MS = 1500;
const WAKE_NO_SPEECH_MS = 4000;
const WAKE_LEVEL_RMS = 0.015;
const WAKE_PHRASE = /\b(?:hey|hi|ok|okay)[\s,.!]*trust[\s-]*label\b/i;
const SPEAK_MAX_CHARS = 600;
ICONS.volume = [["path", { d: "M11 5 6 9H3v6h3l5 4z" }], ["path", { d: "M15.5 8.5a5 5 0 0 1 0 7" }], ["path", { d: "M18.5 5.5a9 9 0 0 1 0 13" }]];

let chatThreadEl = null;
let chatInput = null;
let chatContextSelect = null;
let chatSendBtn = null;
let chatMicBtn = null;
let chatMicLabel = null;
let chatAutoAskToggle = null;
let chatBusy = false;
let chatAudio = null; // { audio, url } while an answer is being read aloud
let ptt = null; // push-to-talk session: { pressedAt, released, stop }
const handsFree = { on: false, recognition: null, recording: false, stopRecording: null, toggle: null, indicator: null };

function speechRecognitionCtor() {
  return window.SpeechRecognition || window.webkitSpeechRecognition || null;
}

function chatVoiceEnabled() {
  return Boolean(state.me && state.me.features && state.me.features.voice_ask && pickRecorderType() && navigator.mediaDevices);
}

function renderChatView() {
  clear(chatViewEl);
  stopHandsFree();
  const me = state.me;
  const ctx = currentContext();

  chatContextSelect = h(
    "select",
    {
      "aria-label": "Context",
      onChange: () => {
        state.contextKey = chatContextSelect.value;
        if (contextSelect) contextSelect.value = chatContextSelect.value;
      },
    },
    me.contexts.map((c) => h("option", { value: c.key, selected: ctx && c.key === ctx.key }, c.label)),
  );
  chatAutoAskToggle = h("input", { type: "checkbox", checked: autoAskEnabled(), onChange: () => setAutoAsk(chatAutoAskToggle.checked) });
  chatInput = h("input", {
    className: "field chat-input",
    type: "text",
    maxLength: 300,
    autocomplete: "off",
    "aria-label": "Message",
    placeholder: "Ask anything, e.g. What's the payroll cut-off for Van Dam?",
  });
  chatSendBtn = h("button", { type: "submit", className: "btn btn-primary" }, "Send");

  const controls = h(
    "div",
    { className: "chat-controls" },
    h("div", { className: "select-wrap" }, icon("briefcase", "icon-sm"), chatContextSelect, icon("chevronDown", "icon-sm chev")),
    h("label", { className: "chat-switch", title: "When sources disagree or nothing applies, TrustLabel asks the right expert for you" }, chatAutoAskToggle, h("span", null, "Ask the expert automatically")),
  );
  const composerRow = h("div", { className: "chat-compose-row" }, chatInput);
  const extras = [];
  if (chatVoiceEnabled()) {
    chatMicLabel = h("span", null, "Hold to talk");
    chatMicBtn = h(
      "button",
      {
        type: "button",
        className: "btn btn-secondary btn-voice chat-mic",
        title: `Hold to talk, or tap to start and tap again to send (max ${CHAT_PTT_MAX_SECONDS} s)`,
        onPointerdown: (e) => {
          e.preventDefault();
          pttPress();
        },
        onPointerup: pttRelease,
        onPointerleave: pttRelease,
        onContextmenu: (e) => e.preventDefault(),
        onKeydown: (e) => {
          if ((e.key === " " || e.key === "Enter") && !e.repeat) {
            e.preventDefault();
            if (ptt) pttFinish();
            else pttPress();
          }
        },
      },
      icon("mic", "icon-sm"),
      h("span", { className: "rec-dot", "aria-hidden": "true" }),
      chatMicLabel,
    );
    composerRow.appendChild(chatMicBtn);
    if (speechRecognitionCtor()) {
      handsFree.toggle = h("input", { type: "checkbox", onChange: () => (handsFree.toggle.checked ? startHandsFree() : stopHandsFree()) });
      handsFree.indicator = h("span", { className: "wake-indicator", role: "status", "aria-live": "polite", hidden: true });
      controls.appendChild(h("label", { className: "chat-switch" }, handsFree.toggle, h("span", null, "Hey TrustLabel")));
      extras.push(h("div", { className: "chat-wake" }, handsFree.indicator, h("span", { className: "chat-disclosure" }, "Wake word uses your browser's speech recognition")));
    }
  } else {
    chatMicBtn = null;
    chatMicLabel = null;
    handsFree.toggle = null;
    handsFree.indicator = null;
  }
  composerRow.appendChild(chatSendBtn);

  const composer = h(
    "form",
    {
      className: "chat-composer card",
      onSubmit: (e) => {
        e.preventDefault();
        const question = chatInput.value.trim();
        if (!question) {
          toast("Type a question", true);
          return;
        }
        chatInput.value = "";
        chatSend({ question });
      },
    },
    controls,
    composerRow,
    extras,
  );

  chatThreadEl = h(
    "div",
    { className: "chat-thread", "aria-live": "polite" },
    chatRow(
      "bot",
      h(
        "div",
        { className: "chat-bubble chat-bot" },
        h("p", null, `Hi ${firstName(me.user.name)}. Ask about pay, policies or deadlines for any of your contexts.`),
        h("p", { className: "chat-note" }, "Every answer shows how far its sources can be trusted, and who can confirm it."),
      ),
    ),
  );
  chatViewEl.appendChild(
    h(
      "div",
      { className: "chat" },
      h("header", { className: "intro" }, h("p", { className: "eyebrow" }, "TrustLabel chat"), h("h1", null, "Ask, by text or voice.")),
      chatThreadEl,
      composer,
    ),
  );
}

function focusChat() {
  const ctx = currentContext();
  if (ctx && chatContextSelect) chatContextSelect.value = ctx.key;
  if (chatAutoAskToggle) chatAutoAskToggle.checked = autoAskEnabled();
  if (chatInput) chatInput.focus();
  scrollChat();
}

function scrollChat() {
  if (chatThreadEl) chatThreadEl.scrollTop = chatThreadEl.scrollHeight;
}

function chatRow(who, bubble) {
  return h("div", { className: `chat-row chat-row-${who}` }, who === "bot" ? h("span", { className: "chat-avatar", "aria-hidden": "true" }, brandMark()) : null, bubble);
}

function appendChat(row) {
  chatThreadEl.appendChild(row);
  scrollChat();
  return row;
}

function chatUserRow(text, { voice = false } = {}) {
  const textEl = h("span", null, text);
  const row = chatRow("user", h("div", { className: "chat-bubble chat-user" }, voice ? icon("mic", "icon-xs") : null, textEl));
  row.textEl = textEl;
  return row;
}

function chatPendingRow(text = "Checking sources…") {
  return chatRow("bot", h("div", { className: "chat-bubble chat-bot chat-pending" }, h("span", { className: "chat-dots", "aria-hidden": "true" }, h("i"), h("i"), h("i")), text));
}

function chatErrorRow(err) {
  const detail = err instanceof ApiError ? err.detail : String(err && err.message ? err.message : err);
  return chatRow("bot", h("div", { className: "chat-bubble chat-bot chat-error" }, icon("alert", "icon-xs"), detail));
}

function setChatBusy(busy) {
  chatBusy = busy;
  if (chatSendBtn) chatSendBtn.disabled = busy;
  if (chatMicBtn && !ptt) chatMicBtn.disabled = busy;
}

async function chatSend({ question, topic_id = null, shown = null }) {
  if (chatBusy) return;
  const ctx = currentContext();
  appendChat(chatUserRow(shown || question));
  const pending = appendChat(chatPendingRow());
  setChatBusy(true);
  try {
    const data = await api("/api/ask", {
      method: "POST",
      body: { question: question || "", client_id: ctx ? ctx.client_id : null, topic_id, auto_ask: chatAutoAskToggle.checked },
    });
    pending.replaceWith(chatAnswerRow(data, { question }));
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    pending.replaceWith(chatErrorRow(err));
  } finally {
    setChatBusy(false);
    scrollChat();
  }
}

function chatAnswerRow(data, { question = "", speech = null } = {}) {
  if (data.restricted) {
    const contact = data.restricted.contact;
    return chatRow(
      "bot",
      h(
        "div",
        { className: "chat-bubble chat-bot chat-restricted" },
        h("p", { className: "chat-verdict" }, icon("shield", "icon-xs"), "Not shared"),
        h("p", null, data.restricted.message),
        contact ? h("p", { className: "chat-note" }, icon("user", "icon-xs"), `Ask ${contact.name}, ${contact.title}`) : null,
        speechButton(speech),
      ),
    );
  }
  if (!data.topic) {
    return chatRow(
      "bot",
      h(
        "div",
        { className: "chat-bubble chat-bot" },
        h("p", null, "I couldn't match that to a topic I know. Pick one:"),
        h(
          "div",
          { className: "chips chat-chips" },
          (data.suggestions || []).map((t) =>
            h("button", { type: "button", className: "chip", onClick: () => chatSend({ question, topic_id: t.id, shown: t.label }) }, t.label),
          ),
        ),
        speechButton(speech),
      ),
    );
  }
  const a = data.answer;
  const banner = BANNERS[a.action] || BANNERS.ask_expert;
  const expert = (data.experts || [])[0];
  const competing = a.status === "conflict" ? a.competing || [] : [];
  let followUp = null;
  if (data.auto_request) {
    followUp = renderAutoRequest(data.auto_request);
  } else if (data.open_request) {
    followUp = h("p", { className: "chat-follow" }, icon("clock", "icon-xs"), `${data.open_request.assignee_name} is already checking this`);
  }
  return chatRow(
    "bot",
    h(
      "div",
      { className: `chat-bubble chat-bot chat-answer ${banner.tone}` },
      h("p", { className: "chat-verdict" }, icon(banner.icon, "icon-xs"), banner.text, h("span", { className: "chat-context" }, data.context.label)),
      h("p", { className: "chat-headline" }, a.headline),
      a.value_display && a.status !== "conflict" ? h("p", { className: "chat-value" }, a.grade ? gradeTile(a.grade, { small: true }) : null, a.value_display) : null,
      competing.length
        ? h("ul", { className: "chat-competing" }, competing.map((c) => h("li", null, gradeTile(c.best_grade, { small: true }), c.value_display)))
        : null,
      (data.sources || []).length
        ? h(
            "ul",
            { className: "chat-sources" },
            data.sources.slice(0, 3).map((s) =>
              h("li", { className: MUTED_STATUSES.has(s.status) ? "muted" : null }, gradeTile(s.grade, { small: true, muted: MUTED_STATUSES.has(s.status) }), h("span", null, `${s.title} · ${s.kind_label} · grade ${s.grade}`)),
            ),
          )
        : null,
      expert ? h("p", { className: "chat-note" }, icon("user", "icon-xs"), `Who can confirm: ${expert.name}, ${expert.title}`) : null,
      followUp,
      speechButton(speech),
    ),
  );
}

function speechButton(speech) {
  if (!speech || !state.me.features.speak) return null;
  return h("button", { type: "button", className: "btn btn-ghost chat-replay", title: speech, onClick: () => speak(speech) }, icon("volume", "icon-xs"), "Play answer");
}

function stopSpeaking() {
  if (!chatAudio) return;
  const { audio } = chatAudio;
  audio.pause(); // the pause listener revokes the blob URL
}

// Reads `text` aloud with ElevenLabs; resolves once playback ends (or fails), so hands-free can listen again.
async function speak(text) {
  stopSpeaking();
  let res;
  try {
    res = await fetch("/api/voice/speak", {
      method: "POST",
      credentials: "same-origin",
      headers: { "Content-Type": "application/json", Accept: "audio/mpeg" },
      body: JSON.stringify({ text: text.slice(0, SPEAK_MAX_CHARS) }),
    });
  } catch {
    toast("Network error — answer not read aloud", true);
    return;
  }
  if (!res.ok) {
    let data = null;
    try {
      data = await res.json();
    } catch {
      data = null;
    }
    toast(errorDetail(data, res.status), true);
    return;
  }
  const url = URL.createObjectURL(await res.blob());
  const audio = new Audio(url);
  chatAudio = { audio, url };
  await new Promise((resolve) => {
    const done = () => {
      if (chatAudio && chatAudio.audio === audio) chatAudio = null;
      URL.revokeObjectURL(url);
      resolve();
    };
    audio.addEventListener("ended", done, { once: true });
    audio.addEventListener("pause", done, { once: true });
    audio.addEventListener("error", done, { once: true });
    audio.play().catch(() => {
      toast("Your browser blocked audio playback; use Play answer", true);
      done();
    });
  });
}

// One recording with MediaRecorder; with `stopOnSilence`, an AnalyserNode ends it after a pause in speech.
async function openRecorder({ maxSeconds, stopOnSilence = false }) {
  const type = pickRecorderType();
  if (!type || !navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) throw new Error("Voice recording is not supported in this browser");
  const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
  let recorder;
  try {
    recorder = type.mimeType ? new MediaRecorder(stream, { mimeType: type.mimeType }) : new MediaRecorder(stream);
  } catch (err) {
    stream.getTracks().forEach((t) => t.stop());
    throw err;
  }
  const chunks = [];
  let audioCtx = null;
  let levelTimer = null;
  let heard = !stopOnSilence;
  const stop = () => {
    if (recorder.state !== "inactive") recorder.stop();
  };
  const maxTimer = setTimeout(stop, maxSeconds * 1000);
  const done = new Promise((resolve) => {
    recorder.addEventListener("dataavailable", (e) => {
      if (e.data && e.data.size) chunks.push(e.data);
    });
    recorder.addEventListener("stop", () => {
      clearTimeout(maxTimer);
      clearInterval(levelTimer);
      stream.getTracks().forEach((t) => t.stop());
      if (audioCtx) audioCtx.close().catch(() => {});
      const blob = new Blob(chunks, { type: (recorder.mimeType || type.mimeType || "audio/webm").split(";")[0] });
      resolve(heard && blob.size ? { blob, filename: type.filename.replace(/^answer/, "question") } : null);
    });
  });
  recorder.start();
  const AudioCtx = window.AudioContext || window.webkitAudioContext;
  if (stopOnSilence && AudioCtx) {
    audioCtx = new AudioCtx();
    audioCtx.resume().catch(() => {});
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 2048;
    audioCtx.createMediaStreamSource(stream).connect(analyser);
    const samples = new Float32Array(analyser.fftSize);
    const started = Date.now();
    let lastLoud = started;
    levelTimer = setInterval(() => {
      analyser.getFloatTimeDomainData(samples);
      let sum = 0;
      for (const v of samples) sum += v * v;
      const now = Date.now();
      if (Math.sqrt(sum / samples.length) > WAKE_LEVEL_RMS) {
        lastLoud = now;
        heard = true;
      }
      if (heard ? now - lastLoud > WAKE_SILENCE_MS : now - started > WAKE_NO_SPEECH_MS) stop();
    }, 100);
  } else {
    heard = true;
  }
  return { done, stop };
}

function setMicRecording(seconds) {
  if (!chatMicBtn) return;
  const recording = seconds !== null;
  chatMicBtn.className = recording ? "btn btn-secondary btn-voice chat-mic recording" : "btn btn-secondary btn-voice chat-mic";
  chatMicLabel.textContent = recording ? `Listening… ${seconds}s` : "Hold to talk";
  chatMicBtn.disabled = !recording && chatBusy;
}

async function pttPress() {
  if (ptt) {
    pttFinish();
    return;
  }
  if (chatBusy || handsFree.recording) return;
  stopSpeaking();
  const session = { pressedAt: Date.now(), released: false, stop: null };
  ptt = session;
  setMicRecording(0);
  let rec;
  try {
    rec = await openRecorder({ maxSeconds: CHAT_PTT_MAX_SECONDS });
  } catch (err) {
    ptt = null;
    setMicRecording(null);
    toast(`Microphone unavailable: ${err && err.message ? err.message : err}`, true);
    return;
  }
  session.stop = rec.stop;
  if (session.released) rec.stop();
  let seconds = 0;
  const ticker = setInterval(() => setMicRecording(++seconds), 1000);
  const result = await rec.done;
  clearInterval(ticker);
  ptt = null;
  setMicRecording(null);
  if (result) await chatVoiceAsk(result.blob, result.filename);
}

// Releasing a held button sends; releasing after a short tap keeps recording until the next tap.
function pttRelease() {
  if (ptt && !ptt.released && Date.now() - ptt.pressedAt >= CHAT_TAP_MS) pttFinish();
}

function pttFinish() {
  if (!ptt) return;
  ptt.released = true;
  if (ptt.stop) ptt.stop();
}

async function chatVoiceAsk(blob, filename) {
  if (!state.me) return;
  const ctx = currentContext();
  const userRow = appendChat(chatUserRow("Transcribing…", { voice: true }));
  const pending = appendChat(chatPendingRow());
  setChatBusy(true);
  const form = new FormData();
  form.append("audio", blob, filename);
  if (ctx && ctx.client_id) form.append("client_id", ctx.client_id);
  form.append("auto_ask", chatAutoAskToggle.checked ? "true" : "false");
  let data;
  try {
    data = await api("/api/voice/ask", { method: "POST", formData: form });
  } catch (err) {
    if (err instanceof ApiError && err.status === 401) return;
    userRow.textEl.textContent = "(not understood)";
    pending.replaceWith(chatErrorRow(err));
    setChatBusy(false);
    return;
  }
  userRow.textEl.textContent = data.transcript;
  pending.replaceWith(chatAnswerRow(data.result, { question: data.transcript, speech: data.speech }));
  setChatBusy(false);
  scrollChat();
  if (state.me.features.speak) {
    setWakeIndicator("speaking");
    await speak(data.speech);
  }
}

function setWakeIndicator(mode) {
  const el = handsFree.indicator;
  if (!el) return;
  const text = {
    waiting: "Listening for “Hey TrustLabel”",
    recording: "Listening — ask your question",
    speaking: "Answering…",
  }[mode];
  el.hidden = !handsFree.on || !text;
  el.className = `wake-indicator wake-${mode}`;
  el.textContent = text || "";
}

function startHandsFree() {
  if (!speechRecognitionCtor()) return;
  handsFree.on = true;
  listenForWake();
}

function stopHandsFree() {
  handsFree.on = false;
  const recognition = handsFree.recognition;
  handsFree.recognition = null;
  if (recognition) recognition.abort();
  if (handsFree.stopRecording) handsFree.stopRecording();
  if (handsFree.toggle) handsFree.toggle.checked = false;
  setWakeIndicator("off");
}

// Browser speech recognition only listens for the wake phrase; the question itself goes to ElevenLabs.
function listenForWake() {
  if (!handsFree.on || !state.me || state.view !== "chat") return;
  const Recognition = speechRecognitionCtor();
  const recognition = new Recognition();
  recognition.continuous = true;
  recognition.interimResults = true;
  recognition.lang = "en-US";
  let woke = false;
  recognition.addEventListener("result", (e) => {
    for (let i = e.resultIndex; i < e.results.length; i++) {
      if (WAKE_PHRASE.test(e.results[i][0].transcript)) {
        woke = true;
        recognition.abort();
        return;
      }
    }
  });
  recognition.addEventListener("error", (e) => {
    if (e.error === "not-allowed" || e.error === "service-not-allowed" || e.error === "audio-capture") {
      toast("Microphone or speech recognition unavailable; hands-free is off", true);
      stopHandsFree();
    }
  });
  recognition.addEventListener("end", () => {
    if (handsFree.recognition === recognition) handsFree.recognition = null;
    if (!handsFree.on) return;
    if (woke) captureAfterWake();
    else setTimeout(listenForWake, 250);
  });
  handsFree.recognition = recognition;
  try {
    recognition.start();
    setWakeIndicator("waiting");
  } catch {
    handsFree.recognition = null;
    setTimeout(listenForWake, 1000);
  }
}

async function captureAfterWake() {
  if (!chatBusy && !ptt) {
    stopSpeaking();
    handsFree.recording = true;
    setWakeIndicator("recording");
    try {
      const rec = await openRecorder({ maxSeconds: WAKE_MAX_SECONDS, stopOnSilence: true });
      handsFree.stopRecording = rec.stop;
      const result = await rec.done;
      handsFree.stopRecording = null;
      handsFree.recording = false;
      if (handsFree.on) {
        if (result) await chatVoiceAsk(result.blob, result.filename);
        else toast("I didn't hear a question");
      }
    } catch (err) {
      toast(`Microphone unavailable: ${err && err.message ? err.message : err}`, true);
      stopHandsFree();
    } finally {
      handsFree.recording = false;
      handsFree.stopRecording = null;
    }
  }
  listenForWake();
}

boot();
