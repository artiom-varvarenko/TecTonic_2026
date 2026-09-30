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
  view: "ask",
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
  state.view = "ask";
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

  const header = h(
    "header",
    { className: "app-header" },
    brand(),
    h("nav", { className: "nav", "aria-label": "Main" }, askNavBtn, inboxNavBtn),
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
  root.appendChild(header);
  root.appendChild(askViewEl);
  root.appendChild(inboxViewEl);
  connectionsEl = null;
  connectionToken = null;
  renderAskView();
  switchView(state.view);
  refreshInboxCount();
  startPolling();
}

function switchView(view) {
  state.view = view;
  askViewEl.hidden = view !== "ask";
  inboxViewEl.hidden = view !== "inbox";
  askNavBtn.className = view === "ask" ? "nav-btn active" : "nav-btn";
  inboxNavBtn.className = view === "inbox" ? "nav-btn active" : "nav-btn";
  askNavBtn.setAttribute("aria-current", view === "ask" ? "page" : "false");
  inboxNavBtn.setAttribute("aria-current", view === "inbox" ? "page" : "false");
  if (view === "inbox") loadInbox();
  else if (!askViewEl.classList.contains("has-result")) loadOverview();
}

async function logout() {
  try {
    await api("/api/logout", { method: "POST", skipAuthRedirect: true });
  } catch (err) {
    if (!(err instanceof ApiError && err.status === 401)) showError(err);
  }
  stopPolling();
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
  const panel = h("section", { className: "ask-card" }, form, chips);
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
        body: { question: question || "", client_id: ctx ? ctx.client_id : null, topic_id: topic_id || null },
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

function renderCapture() {
  const textarea = h("textarea", {
    className: "field capture-text",
    maxLength: 1000,
    rows: 3,
    "aria-label": "Teams message",
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
      const data = await withSkeleton(() =>
        api("/api/capture", {
          method: "POST",
          body: { text, client_id: ctx ? ctx.client_id : null },
        }),
      );
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
    h(
      "summary",
      null,
      icon("message", "icon-sm"),
      h("span", null, "Capture a Teams message"),
      h("span", { className: "sub" }, "AI reads it, the rules grade it"),
      icon("chevronDown", "icon-sm chev"),
    ),
    h(
      "div",
      { className: "capture-body" },
      textarea,
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
  if (data.open_request) {
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
  if (s.kind === "teams_message") owner = h("span", null, icon("message", "icon-xs"), `Posted by ${s.author_name || "unknown author"}`);
  else if (s.owner_active) owner = h("span", null, icon("user", "icon-xs"), `Owner: ${s.owner_name}`);
  else owner = h("span", { className: "no-owner" }, icon("alert", "icon-xs"), "No active owner");
  let dated;
  if (s.kind === "teams_message") dated = `Posted ${s.created_on}`;
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
const ACTIVITY_ICONS = { verified: "check", assigned: "inbox", requested: "clock" };
let dashboardEl = null;
let overviewSeq = 0;
let lastOverview = "";
let pollTimer = null;
let connectionsEl = null;
let lastConnection = "";
let connectionToken = null; // plaintext key: kept only in this tab, only right after creation

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
    h("div", { className: "dash-grid" }, renderAttention(data.attention), h("div", { className: "dash-col" }, renderActivity(data.activity), renderConnections())),
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
        const owner = a.owner_name ? `Owner: ${a.owner_name}` : a.kind_label === "Teams message" ? "Chat message, no owner" : "No active owner";
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
  const card = h("section", { className: "card activity-card" }, h("h2", { className: "card-title" }, "Recent activity", h("small", null, "Verifications you can see")));
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

// ---------- Teams connection (MCP) ----------

function renderConnections() {
  if (!connectionsEl) {
    connectionsEl = h("section", { className: "card connect-card" });
    lastConnection = "";
    refreshConnection();
  }
  return connectionsEl;
}

async function refreshConnection() {
  let status = null;
  try {
    status = (await api("/api/connections")).teams;
  } catch {
    status = null;
  }
  const snapshot = JSON.stringify([status, Boolean(connectionToken)]);
  if (snapshot === lastConnection && connectionsEl && connectionsEl.firstChild) return;
  lastConnection = snapshot;
  drawConnection(status);
}

function drawConnection(status) {
  const el = connectionsEl;
  if (!el) return;
  clear(el);
  const connected = Boolean(status && status.connected);
  el.appendChild(
    h(
      "div",
      { className: "connect-head" },
      h("span", { className: "connect-logo", "aria-hidden": "true" }, icon("message")),
      h("div", { className: "connect-id" }, h("h2", { className: "card-title" }, "Microsoft Teams"), h("p", { className: "muted-text" }, "Ask TrustLabel from Teams over MCP")),
      h("span", { className: connected ? "req-status status-resolved" : "req-status status-idle" }, connected ? "Connected" : "Not connected"),
    ),
  );
  if (connectionToken && connected) {
    el.appendChild(
      h(
        "div",
        { className: "token-box" },
        copyRow("MCP server URL", `${location.origin}${connectionToken.mcp_path || "/mcp"}`),
        copyRow("API key (shown once)", connectionToken.token),
        h("p", { className: "muted-text" }, `Send it as header X-API-Key or Authorization: Bearer. Expires ${formatDateTime(connectionToken.expires_at)}.`),
      ),
    );
  } else if (connected) {
    const used = status.last_used_at ? ` · last used ${relativeTime(status.last_used_at)}` : "";
    el.appendChild(h("p", { className: "connect-copy" }, `Key created ${formatDateTime(status.created_at)} · ${plural(status.calls, "call")}${used}`));
  } else {
    el.appendChild(
      h("p", { className: "connect-copy" }, "A Teams agent asks TrustLabel directly and gets the same grades, reasons and expert routing, scoped to your client portfolio."),
    );
  }
  const actions = h("div", { className: "connect-actions" });
  const create = h("button", { type: "button", className: connected ? "btn btn-secondary" : "btn btn-primary" }, icon("link", "icon-sm"), connected ? "New key" : "Connect Teams");
  create.addEventListener("click", async () => {
    create.disabled = true;
    try {
      connectionToken = await api("/api/connections/teams", { method: "POST" });
      toast("Connection key created. Copy it now: it is shown only once.");
      await refreshConnection();
    } catch (err) {
      create.disabled = false;
      showError(err);
    }
  });
  actions.appendChild(create);
  if (connected) {
    const revoke = h("button", { type: "button", className: "btn btn-ghost" }, "Revoke");
    revoke.addEventListener("click", async () => {
      revoke.disabled = true;
      try {
        await api("/api/connections/teams", { method: "DELETE" });
        connectionToken = null;
        toast("Teams connection revoked.");
        await refreshConnection();
      } catch (err) {
        revoke.disabled = false;
        showError(err);
      }
    });
    actions.appendChild(revoke);
  }
  el.appendChild(actions);
  el.appendChild(
    h(
      "details",
      { className: "connect-steps" },
      h("summary", null, "How to add it to Teams", icon("chevronDown", "icon-xs")),
      h(
        "ol",
        null,
        h("li", null, "Serve TrustLabel over public HTTPS; Teams can't reach 127.0.0.1."),
        h("li", null, "Copilot Studio: your agent → Tools → Add a tool → New tool → Model Context Protocol."),
        h("li", null, "Server URL ", h("code", null, "https://<host>/mcp"), ", authentication API key, header ", h("code", null, "X-API-Key"), "."),
        h("li", null, "Publish the agent to Microsoft Teams and ask it about a client."),
      ),
    ),
  );
}

function copyRow(label, value) {
  const button = h("button", { type: "button", className: "btn btn-icon copy-btn", title: `Copy ${label}`, "aria-label": `Copy ${label}` }, icon("copy", "icon-sm"));
  button.addEventListener("click", async () => {
    try {
      await navigator.clipboard.writeText(value);
      toast("Copied to clipboard.");
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
  if (state.view === "ask" && !askViewEl.classList.contains("has-result")) {
    loadOverview();
    if (connectionsEl && !connectionToken) refreshConnection();
  }
}

boot();
