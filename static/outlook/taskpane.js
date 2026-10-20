"use strict";

(function () {
  const KEY_STORE = "trustlabel-key";
  const BODY_LIMIT = 20000;
  const SUBJECT_LIMIT = 500;
  const ACTIONS = {
    use: { label: "Safe to use", tone: "pos" },
    verify: { label: "Use with caution", tone: "warn" },
    ask_expert: { label: "Don't act yet", tone: "neg" },
  };

  const $ = (id) => document.getElementById(id);
  const els = {
    loading: $("loading"),
    connect: $("connect"),
    keyInput: $("key-input"),
    demo: $("demo"),
    demoSubject: $("demo-subject"),
    demoBody: $("demo-body"),
    account: $("account"),
    accountName: $("account-name"),
    disconnect: $("disconnect"),
    error: $("error"),
    result: $("result"),
  };

  let mailbox = null; // Office.context.mailbox when running inside Outlook
  let email = null; // {subject, body, sender} currently being checked
  let generation = 0; // ignores responses for an email that is no longer selected

  class ApiError extends Error {
    constructor(status) {
      super("HTTP " + status);
      this.status = status;
    }
  }

  function getKey() {
    try {
      return localStorage.getItem(KEY_STORE);
    } catch (_) {
      return null;
    }
  }

  function setKey(value) {
    try {
      if (value) localStorage.setItem(KEY_STORE, value);
      else localStorage.removeItem(KEY_STORE);
    } catch (_) {
      /* storage unavailable: key lives for this pane only */
    }
  }

  async function api(path, body, key) {
    const headers = { "X-API-Key": key || getKey() || "", Accept: "application/json" };
    const init = { method: body ? "POST" : "GET", headers, credentials: "omit", cache: "no-store" };
    if (body) {
      headers["Content-Type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(path, init);
    if (!response.ok) throw new ApiError(response.status);
    return response.json();
  }

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined && text !== null) node.textContent = String(text);
    return node;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function showError(message) {
    els.error.textContent = message;
    els.error.hidden = !message;
  }

  function handleError(err) {
    if (err instanceof ApiError && err.status === 401) {
      disconnect();
      showError("Your TrustLabel key is no longer valid. Paste a new one.");
    } else if (err instanceof ApiError && err.status === 429) {
      showError("Too many requests, try again in a minute");
    } else {
      showError("TrustLabel could not check this email. Try again.");
    }
  }

  function gradeTile(grade, extra) {
    const valid = typeof grade === "string" && /^[A-G]$/.test(grade);
    return el("span", "grade " + (valid ? "g-" + grade : "g-none") + (extra ? " " + extra : ""), valid ? grade : "–");
  }

  // ---------- key ----------

  function showConnect() {
    els.loading.hidden = true;
    els.account.hidden = true;
    els.demo.hidden = true;
    clear(els.result);
    els.connect.hidden = false;
    els.keyInput.value = "";
    els.keyInput.focus();
  }

  function showAccount(me) {
    els.accountName.textContent = "Connected as " + me.name;
    els.account.hidden = false;
    els.connect.hidden = true;
  }

  function disconnect() {
    setKey(null);
    generation += 1;
    showConnect();
  }

  els.disconnect.addEventListener("click", () => {
    showError("");
    disconnect();
  });

  els.connect.addEventListener("submit", async (event) => {
    event.preventDefault();
    const key = els.keyInput.value.trim();
    if (!key) return;
    showError("");
    try {
      const me = await api("/api/v1/me", null, key);
      setKey(key);
      showAccount(me);
      start();
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) showError("That key was not accepted. Check it and try again.");
      else handleError(err);
    }
  });

  // ---------- brief ----------

  async function brief(clientId) {
    if (!email) return;
    const ticket = ++generation;
    showError("");
    clear(els.result);
    els.result.appendChild(el("p", "muted", "Checking…"));
    try {
      const data = await api("/api/v1/brief", {
        subject: email.subject,
        body: email.body,
        sender: email.sender,
        client_id: clientId || null,
      });
      if (ticket === generation) render(data);
    } catch (err) {
      if (ticket !== generation) return;
      clear(els.result);
      handleError(err);
    }
  }

  function render(data) {
    clear(els.result);
    if (!data.client && Array.isArray(data.clients) && data.clients.length) {
      els.result.appendChild(clientPicker(data.clients));
    }
    if (!data.matched) {
      els.result.appendChild(el("p", "card empty", "No known topic in this email"));
      els.result.appendChild(captureCard(data));
      return;
    }
    const answer = data.answer;
    if (answer) els.result.appendChild(answerCard(data, answer));
    if (Array.isArray(data.sources) && data.sources.length) els.result.appendChild(sourceList(data.sources.slice(0, 3)));
    if (data.expert) els.result.appendChild(expertCard(data.expert));
    if (data.open_request) {
      els.result.appendChild(el("p", "note", "Already asked " + data.open_request.assignee_name + " to verify this."));
    }
    const actions = el("div", "actions");
    if (data.reply && data.reply.text) {
      if (mailbox) {
        const label = data.reply.kind === "holding" ? "Send holding reply" : "Reply with this";
        const reply = el("button", "btn btn-primary", label);
        reply.type = "button";
        reply.addEventListener("click", () => openReply(data.reply.text));
        actions.appendChild(reply);
      } else {
        const preview = el("div", "card reply-preview");
        preview.appendChild(el("h3", "", data.reply.kind === "holding" ? "Holding reply" : "Suggested reply"));
        preview.appendChild(el("p", "reply-text", data.reply.text));
        els.result.appendChild(preview);
      }
    }
    if (answer && answer.action === "ask_expert" && data.expert && !data.open_request && data.topic) {
      const ask = el("button", "btn btn-secondary", "Ask " + data.expert.name);
      ask.type = "button";
      ask.addEventListener("click", () => askExpert(ask, data));
      actions.appendChild(ask);
    }
    if (actions.firstChild) els.result.appendChild(actions);
    els.result.appendChild(captureCard(data));
  }

  // ---------- add this email as a source (stores the email text, so only on an explicit click) ----------

  const CAPTURE_ERRORS = {
    403: "This client is not in your portfolio.",
    422: "No verifiable claim found in this email. A claim is only kept when its quote appears word for word.",
    429: "Rate limit reached. Try again later.",
    502: "The AI service failed. Try again.",
    503: "Adding emails as sources needs the AI extractor, which is not configured on this TrustLabel server.",
  };

  function captureCard(data) {
    const card = el("section", "card stack");
    const button = el("button", "btn btn-secondary", "Add this email as a source");
    button.type = "button";
    const context = data.client ? data.client.name : data.context_label;
    const hint = el("p", "muted", "Stores this email's text in TrustLabel" + (context ? " for " + context : "") + ".");
    const status = el("div", "stack");
    button.addEventListener("click", () => {
      const pick = document.getElementById("client-pick");
      const clientId = data.client ? data.client.id : (pick && pick.value) || null;
      captureEmail(button, status, clientId);
    });
    card.append(button, hint, status);
    return card;
  }

  async function captureEmail(button, status, clientId) {
    if (!email) return;
    button.disabled = true;
    clear(status);
    status.appendChild(el("p", "muted", "Adding…"));
    try {
      const data = await api("/api/v1/capture", {
        subject: email.subject,
        sender_name: email.senderName,
        sender_email: email.sender,
        body: email.body,
        client_id: clientId,
      });
      clear(status);
      status.appendChild(el("p", "note", "Added as a source"));
      status.appendChild(claimList(data.claims || []));
      button.textContent = "Added";
    } catch (err) {
      clear(status);
      button.disabled = false;
      if (err instanceof ApiError && err.status === 401) {
        handleError(err);
        return;
      }
      const message = (err instanceof ApiError && CAPTURE_ERRORS[err.status]) || "TrustLabel could not add this email.";
      status.appendChild(el("p", "error", message));
    }
  }

  function claimList(claims) {
    const list = el("ul", "sources");
    for (const claim of claims) {
      const item = el("li", "source");
      item.appendChild(gradeTile(claim.grade, "sm"));
      const text = el("div", "source-text");
      text.appendChild(el("span", "source-title", claim.topic.label + ": " + claim.value_display));
      text.appendChild(el("span", "muted", "“" + claim.quote + "”"));
      item.appendChild(text);
      list.appendChild(item);
    }
    return list;
  }

  function clientPicker(clients) {
    const wrap = el("div", "card stack");
    const label = el("label", "", "Which client is this about?");
    label.htmlFor = "client-pick";
    const select = el("select", "field");
    select.id = "client-pick";
    const placeholder = el("option", "", "Choose a client…");
    placeholder.value = "";
    select.appendChild(placeholder);
    for (const client of clients) {
      const option = el("option", "", client.name);
      option.value = client.id;
      select.appendChild(option);
    }
    select.addEventListener("change", () => {
      if (select.value) brief(select.value);
    });
    wrap.append(label, select);
    return wrap;
  }

  function answerCard(data, answer) {
    const action = ACTIONS[answer.action] || ACTIONS.verify;
    const card = el("article", "card answer");
    const badge = el("div", "badge tone-" + action.tone);
    badge.appendChild(gradeTile(answer.grade));
    badge.appendChild(el("span", "", action.label));
    card.appendChild(badge);
    card.appendChild(el("h2", "headline", answer.headline));
    if (answer.value_display && answer.value_display !== answer.headline) {
      card.appendChild(el("p", "value mono", answer.value_display));
    }
    const context = data.context_label || (data.client && data.client.name);
    if (context) card.appendChild(el("p", "muted", context + (data.topic ? " · " + data.topic.label : "")));
    if (answer.detail) card.appendChild(el("p", "detail", answer.detail));
    return card;
  }

  function sourceList(sources) {
    const wrap = el("section", "card");
    wrap.appendChild(el("h3", "", "Sources"));
    const list = el("ul", "sources");
    for (const source of sources) {
      const item = el("li", "source");
      item.appendChild(gradeTile(source.grade, "sm"));
      const text = el("div", "source-text");
      text.appendChild(el("span", "source-title", source.title));
      const meta = [source.kind_label, source.value_display].filter(Boolean).join(" · ");
      if (meta) text.appendChild(el("span", "muted", meta));
      item.appendChild(text);
      list.appendChild(item);
    }
    wrap.appendChild(list);
    return wrap;
  }

  function expertCard(expert) {
    const card = el("section", "card");
    card.appendChild(el("h3", "", "Who can verify"));
    card.appendChild(el("p", "expert-name", expert.name));
    if (expert.title) card.appendChild(el("p", "muted", expert.title));
    if (Array.isArray(expert.reasons) && expert.reasons.length) {
      const list = el("ul", "reasons");
      for (const reason of expert.reasons) list.appendChild(el("li", "", reason));
      card.appendChild(list);
    }
    return card;
  }

  async function askExpert(button, data) {
    button.disabled = true;
    showError("");
    const question = (email.subject + "\n\n" + email.body.slice(0, 300)).trim().slice(0, 2000);
    try {
      const request = await api("/api/v1/verifications", {
        topic_id: data.topic.id,
        client_id: data.client ? data.client.id : null,
        question,
      });
      const sent = request.question ? ": “" + request.question + "”" : "";
      button.replaceWith(el("p", "note", "Asked " + request.assignee_name + sent));
    } catch (err) {
      button.disabled = false;
      handleError(err);
    }
  }

  // ---------- reply (HTML string for Outlook only; never inserted into this page) ----------

  function escapeHtml(text) {
    return text
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function replyHtml(text) {
    return text
      .split(/\n\s*\n/)
      .map((para) => para.trim())
      .filter(Boolean)
      .map((para) => "<p>" + escapeHtml(para).replace(/\n/g, "<br>") + "</p>")
      .join("");
  }

  function openReply(text) {
    try {
      mailbox.item.displayReplyForm(replyHtml(text));
    } catch (_) {
      showError("Outlook could not open the reply form.");
    }
  }

  // ---------- reading the message ----------

  function readItem() {
    const item = mailbox && mailbox.item;
    if (!item) {
      email = null;
      clear(els.result);
      els.result.appendChild(el("p", "card empty", "Select an email to check it with TrustLabel."));
      return;
    }
    const ticket = ++generation;
    const sender = item.from && item.from.emailAddress ? String(item.from.emailAddress) : null;
    const senderName = item.from && item.from.displayName ? String(item.from.displayName).slice(0, 200) : null;
    const subject = String(item.subject || "").slice(0, SUBJECT_LIMIT);
    item.body.getAsync(Office.CoercionType.Text, (result) => {
      if (ticket !== generation) return;
      if (result.status !== Office.AsyncResultStatus.Succeeded) {
        showError("Could not read this email.");
        return;
      }
      email = { subject, body: String(result.value || "").slice(0, BODY_LIMIT), sender, senderName };
      brief(null);
    });
  }

  function startDemo() {
    els.demo.hidden = false;
  }

  els.demo.addEventListener("submit", (event) => {
    event.preventDefault();
    email = {
      subject: els.demoSubject.value.slice(0, SUBJECT_LIMIT),
      body: els.demoBody.value.slice(0, BODY_LIMIT),
      sender: null,
      senderName: null,
    };
    brief(null);
  });

  function start() {
    if (mailbox) readItem();
    else startDemo();
  }

  async function boot() {
    els.loading.hidden = true;
    if (!getKey()) {
      showConnect();
      return;
    }
    try {
      showAccount(await api("/api/v1/me"));
    } catch (err) {
      if (err instanceof ApiError && err.status === 401) {
        disconnect();
        return;
      }
      handleError(err);
      return;
    }
    start();
  }

  function onOffice(info) {
    const ctx = typeof Office !== "undefined" ? Office.context : null;
    if (info && info.host && ctx && ctx.mailbox) {
      mailbox = ctx.mailbox;
      if (typeof mailbox.addHandlerAsync === "function" && Office.EventType && Office.EventType.ItemChanged) {
        mailbox.addHandlerAsync(Office.EventType.ItemChanged, () => {
          if (getKey()) readItem();
        });
      }
    }
    boot();
  }

  if (typeof Office !== "undefined" && typeof Office.onReady === "function") {
    Office.onReady(onOffice);
  } else {
    boot();
  }
})();
