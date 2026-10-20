// Browser harness for tests/test_frontend_session.py (Aikido 765575000). Drives the real static/app.js against the
// real server and holds chosen replies until after the tab has switched sessions, then checks that no held reply
// reaches the current session: no key in the DOM, no toast, no cleared key, no logout. Reports to /__harness/result.

const realFetch = window.fetch.bind(window);
const failures = [];
const check = (ok, message) => {
  if (!ok) failures.push(message);
};
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

window.addEventListener("error", (e) => failures.push(`uncaught: ${e.message}`));
window.addEventListener("unhandledrejection", (e) => failures.push(`unhandled rejection: ${e.reason}`));
window.confirm = () => true;

function deferred() {
  let resolve;
  const promise = new Promise((r) => (resolve = r));
  return { promise, resolve };
}

// One-shot holds: the matching request is answered (by the server, or by `synth`) right away, but its reply is
// handed to the app only on release(). The app's abort signal is dropped so only the session check can discard it.
const holds = [];
let inflight = 0;

function hold(method, path, synth = null) {
  const entry = { method, path, synth, taken: false, sent: deferred(), gate: deferred(), body: null };
  entry.release = () => entry.gate.resolve();
  holds.push(entry);
  return entry;
}

window.fetch = async (input, init = {}) => {
  const url = new URL(String(input), location.href);
  const method = (init.method || "GET").toUpperCase();
  const entry = holds.find((x) => !x.taken && x.method === method && x.path === url.pathname);
  if (!entry) {
    inflight += 1;
    try {
      return await realFetch(input, init);
    } finally {
      inflight -= 1;
    }
  }
  entry.taken = true;
  let status;
  let text;
  if (entry.synth) {
    ({ status, text } = entry.synth);
  } else {
    const { signal, ...rest } = init;
    const real = await realFetch(input, rest);
    status = real.status;
    text = status === 204 ? null : await real.text();
  }
  entry.body = text;
  entry.sent.resolve();
  await entry.gate.promise;
  return new Response(text, { status, headers: { "Content-Type": "application/json" } });
};

async function waitFor(fn, what, timeout = 15000) {
  const end = performance.now() + timeout;
  while (performance.now() < end) {
    const value = fn();
    if (value) return value;
    await sleep(20);
  }
  throw new Error(`timed out waiting for ${what}`);
}

// Lets every continuation of a released reply run, including any request it starts.
async function settle() {
  for (let idle = 0; idle < 5; ) {
    await sleep(30);
    idle = inflight === 0 ? idle + 1 : 0;
  }
}

const keyCard = () => document.querySelector(".integration-wide");
const keyButton = (label) => [...(keyCard()?.querySelectorAll("button") ?? [])].find((b) => b.textContent.trim() === label);
const tokenBox = () => keyCard()?.querySelector(".token-box") ?? null;
const shownToken = () => tokenBox()?.querySelector(".copy-value")?.textContent ?? null;
const toastText = () => document.getElementById("toast")?.textContent ?? "";
const signedInAs = () => document.querySelector(".user-name")?.textContent ?? null;
const navButton = (label) => [...document.querySelectorAll(".nav-btn")].find((b) => b.textContent.trim() === label);

async function login(user) {
  const form = await waitFor(() => document.querySelector("form.login-card"), "login form");
  document.getElementById("login-username").value = user.username;
  document.getElementById("login-password").value = user.password;
  form.requestSubmit();
  await waitFor(() => signedInAs() === user.name, `signed in as ${user.username}`);
}

async function logout() {
  document.querySelector('button[aria-label="Log out"]').click();
  await waitFor(() => document.querySelector("form.login-card"), "login form after logout");
}

// Only the current session's own state may be on screen: `token` (or no token box at all when null).
function checkUntouched(step, user, token, toast) {
  check(signedInAs() === user.name, `${step}: no longer signed in as ${user.username}`);
  check(shownToken() === token, `${step}: key box shows ${JSON.stringify(shownToken())}, expected ${JSON.stringify(token)}`);
  check(toastText() === toast, `${step}: toast changed to ${JSON.stringify(toastText())}`);
  check(!document.body.textContent.includes("Integrations could not be loaded"), `${step}: integrations replaced by an error`);
}

async function run() {
  const cfg = await (await realFetch("/__harness/config")).json();
  await import("/static/app.js");

  // Account A starts a key creation, a revoke and a refresh (answered 401); all three replies are held.
  await login(cfg.a);
  await waitFor(() => keyButton("Revoke"), "A's active key card");
  const aCreate = hold("POST", "/api/connections/teams");
  keyButton("Create key").click();
  await aCreate.sent.promise;
  const aToken = JSON.parse(aCreate.body).token;
  check(typeof aToken === "string" && aToken.length > 20, "server did not issue A's key");
  const aRevoke = hold("DELETE", "/api/connections/teams");
  keyButton("Revoke").click();
  await aRevoke.sent.promise;
  const aRefresh = hold("GET", "/api/integrations", { status: 401, text: '{"detail":"Not authenticated"}' });
  navButton("Integrations").click();
  await aRefresh.sent.promise;

  // Same tab: A logs out, B logs in and creates B's own key.
  await logout();
  await login(cfg.b);
  await waitFor(() => keyButton("Revoke"), "B's active key card");
  keyButton("Create key").click();
  const bToken = await waitFor(shownToken, "B's new key");
  check(toastText().includes("Key created"), "B's create showed no toast");
  const bToast = toastText();

  aCreate.release();
  await settle();
  checkUntouched("A's delayed create", cfg.b, bToken, bToast);
  check(!document.body.textContent.includes(aToken), "A's key is visible in B's session");

  aRevoke.release();
  await settle();
  checkUntouched("A's delayed revoke", cfg.b, bToken, bToast);

  aRefresh.release();
  await settle();
  checkUntouched("A's delayed 401", cfg.b, bToken, bToast);
  check(!document.querySelector("form.login-card"), "A's delayed 401 logged B out");

  // B's own revoke and create still work.
  keyButton("Revoke").click();
  await waitFor(() => !keyButton("Revoke") && !tokenBox(), "B's key revoked");
  check(toastText().includes("Personal key revoked"), "B's revoke showed no toast");
  check(keyCard().textContent.includes("No key"), "B's key card not reset after revoke");
  keyButton("Create key").click();
  const bToken2 = await waitFor(shownToken, "B's second key");
  check(bToken2 !== bToken, "B's second create returned the same key");

  // Same user signs in again while a create from the previous sign-in is still in flight.
  const bCreate = hold("POST", "/api/connections/teams");
  keyButton("Create key").click();
  await bCreate.sent.promise;
  const bStale = JSON.parse(bCreate.body).token;
  await logout();
  check(!document.body.textContent.includes(bToken2), "B's key still in the DOM after logout");
  await login(cfg.b);
  await waitFor(() => keyButton("Revoke"), "B's key card after re-login");
  const reloginToast = toastText();
  bCreate.release();
  await settle();
  checkUntouched("B's delayed create after re-login", cfg.b, null, reloginToast);
  check(!document.body.textContent.includes(bStale), "previous sign-in's key shown after re-login");
}

let error = null;
try {
  await run();
} catch (err) {
  error = String(err && err.stack ? err.stack : err);
}
await realFetch("/__harness/result", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ failures, error }) });
