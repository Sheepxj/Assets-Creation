import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomBytes } from "node:crypto";

const base = process.env.BASE_URL ?? "http://frontend:3000";
const sessionFile = process.env.P2_SESSION_FILE ?? "/evidence/p2-session.json";
const mode = process.env.P2_CHECK_MODE ?? "full";
const results = [];
const httpPassword = "HttpDemo123!";

async function check(name, action) {
  await action();
  results.push(name);
  console.log(`PASS ${name}`);
}

class Client {
  cookie = "";
  token = "";
  header = "X-CSRF-TOKEN";

  async request(method, path, body, includeCsrf = true) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (includeCsrf && this.token) headers[this.header] = this.token;
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method, headers,
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      if (cookie.startsWith("JSESSIONID=")) this.cookie = /max-age=0/i.test(cookie) ? "" : cookie.split(";")[0];
    }
    const text = await response.text();
    return { response, data: text ? JSON.parse(text) : null, text };
  }

  async csrf() {
    const result = await this.request("GET", "/api/auth/csrf");
    assert.equal(result.response.status, 200);
    this.token = result.data.token;
    this.header = result.data.headerName;
    return result;
  }

  async login(username, password = "Demo123456!") {
    await this.csrf();
    const result = await this.request("POST", "/api/auth/login", { username, password });
    assert.equal(result.response.status, 200);
    await this.csrf();
    return result.data;
  }
}

if (mode === "verify-restart") {
  const saved = JSON.parse(await readFile(sessionFile, "utf8"));
  await check("Java restart invalidates the previous authenticated session", async () => {
    const old = new Client(); old.cookie = saved.cookie;
    assert.equal((await old.request("GET", "/api/auth/me")).response.status, 401);
  });
  await check("registered account survives restart and can log in again", async () => {
    const fresh = new Client();
    const user = await fresh.login(saved.user.username, httpPassword);
    assert.equal(user.id, saved.user.id);
    assert.equal((await fresh.request("GET", "/api/auth/me")).data.id, saved.user.id);
  });
} else if (mode === "full") {
  const registered = new Client();
  let user;
  const username = "p2_http_" + Date.now().toString(36) + randomBytes(2).toString("hex");

  await check("anonymous access is JSON 401 and session Cookie is HttpOnly/Lax", async () => {
    assert.equal((await registered.request("GET", "/api/auth/me")).response.status, 401);
    const csrf = await registered.csrf();
    const cookie = csrf.response.headers.getSetCookie().find(value => value.startsWith("JSESSIONID="));
    assert.ok(cookie?.includes("HttpOnly"));
    assert.ok(cookie?.includes("SameSite=Lax"));
    assert.ok(!/; Secure/i.test(cookie), "Local HTTP demonstration must not require HTTPS cookies");
  });

  await check("login and registration reject requests without CSRF", async () => {
    for (const path of ["/api/auth/register", "/api/auth/login"]) {
      assert.equal((await registered.request("POST", path, { username, password: httpPassword }, false)).response.status, 403);
    }
  });

  await check("registration normalizes identity and establishes a persistent session", async () => {
    const oldCookie = registered.cookie;
    const result = await registered.request("POST", "/api/auth/register", {
      username: "  " + username.toUpperCase() + "  ", password: httpPassword,
      userId: "10000000-0000-4000-8000-000000000002",
    });
    assert.equal(result.response.status, 201);
    assert.deepEqual(Object.keys(result.data).sort(), ["id", "username"]);
    user = result.data;
    assert.equal(user.username, username);
    assert.notEqual(registered.cookie, oldCookie);
    assert.equal((await registered.request("GET", "/api/auth/me?userId=forged")).data.id, user.id);
    const old = new Client(); old.cookie = oldCookie;
    assert.equal((await old.request("GET", "/api/auth/me")).response.status, 401);
  });

  await check("authentication invalidates old CSRF while refreshed token works", async () => {
    assert.equal((await registered.request("POST", "/api/auth/logout", {})).response.status, 403);
    await registered.csrf();
    const form = new FormData(); form.set("file", new Blob([new Uint8Array([1, 2, 3])], { type: "image/png" }), "probe.png");
    const upload = await registered.request("POST", "/api/_smoke/upload", form);
    assert.equal(upload.response.status, 200);
    assert.equal(upload.data.sizeBytes, 3);
  });

  await check("real session idle timeout is 1800 seconds", async () => {
    const result = await registered.request("GET", "/api/_smoke/session");
    assert.equal(result.response.status, 200);
    assert.equal(result.data.maxInactiveIntervalSeconds, 1800);
  });

  await check("duplicate names return 409 without replacing the account", async () => {
    const other = new Client(); await other.csrf();
    const result = await other.request("POST", "/api/auth/register", { username: username.toUpperCase(), password: "Different123!" });
    assert.equal(result.response.status, 409);
    assert.equal(result.data.code, "USERNAME_TAKEN");
  });

  await check("wrong username and wrong password return the same 401", async () => {
    const other = new Client(); await other.csrf();
    const wrongPassword = await other.request("POST", "/api/auth/login", { username: "demo_a", password: "Incorrect123!" });
    const missingUser = await other.request("POST", "/api/auth/login", { username: "missing_" + randomBytes(6).toString("hex"), password: "Incorrect123!" });
    assert.equal(wrongPassword.response.status, 401);
    assert.equal(missingUser.response.status, 401);
    assert.deepEqual(wrongPassword.data, missingUser.data);
  });

  const a = new Client(); const b = new Client();
  await check("independent users keep separate authenticated identities", async () => {
    await a.login(" DEMO_A "); await b.login("demo_b");
    assert.equal((await a.request("GET", "/api/auth/me")).data.username, "demo_a");
    assert.equal((await b.request("GET", "/api/auth/me")).data.username, "demo_b");
  });

  await check("account switching rotates Cookie and logout revokes that session", async () => {
    const before = a.cookie;
    await a.login("demo_b");
    assert.notEqual(a.cookie, before);
    const active = a.cookie;
    const logout = await a.request("POST", "/api/auth/logout", {});
    assert.equal(logout.response.status, 204);
    assert.equal(logout.text, "");
    assert.equal(a.cookie, "");
    const stale = new Client(); stale.cookie = active;
    assert.equal((await stale.request("GET", "/api/auth/me")).response.status, 401);
    assert.equal((await b.request("GET", "/api/auth/me")).data.username, "demo_b");
  });

  await check("test-only ownership controllers are absent from the runtime JAR", async () => {
    assert.equal((await registered.request("GET", "/api/_test/ownership/assets/unknown")).response.status, 404);
  });

  await writeFile(sessionFile, JSON.stringify({ cookie: registered.cookie, user, createdUserIds: [user.id] }), { mode: 0o600 });
  console.log("Saved a private local-only session snapshot for the restart check.");
} else {
  throw new Error("Unknown P2_CHECK_MODE");
}

console.log(JSON.stringify({ mode, passed: results.length, checks: results }, null, 2));
