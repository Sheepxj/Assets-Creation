import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

const base = process.env.BASE_URL ?? "http://frontend:3000";
const mode = process.env.P8_MODE ?? "prepare";
const evidencePath = process.env.P8_EVIDENCE_FILE ?? "/evidence/p8-persistence.json";
const password = "P8Demo123!"; // Synthetic account in a dedicated acceptance project only.
const checks = [], hash = bytes => createHash("sha256").update(bytes).digest("hex");
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }
class Client {
  cookie = ""; token = ""; header = "X-CSRF-TOKEN";
  async request(method, path, body) {
    const headers = { Cookie: this.cookie };
    if (this.token) headers[this.header] = this.token;
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method, headers, signal: AbortSignal.timeout(20000),
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith("JSESSIONID=")) this.cookie = cookie.split(";")[0];
    const bytes = Buffer.from(await response.arrayBuffer());
    return { response, bytes, data: response.headers.get("content-type")?.includes("application/json") ? JSON.parse(bytes.toString()) : null };
  }
  async csrf() {
    const result = await this.request("GET", "/api/auth/csrf"); assert.equal(result.response.status, 200);
    this.token = result.data.token; this.header = result.data.headerName;
    return result;
  }
  async login(username, secret = password) {
    await this.csrf(); const result = await this.request("POST", "/api/auth/login", { username, password: secret });
    assert.equal(result.response.status, 200); await this.csrf(); return result.data;
  }
  async detail(id) { const result = await this.request("GET", `/api/tasks/${id}`); assert.equal(result.response.status, 200); return result.data; }
}
function privateImage(result, mime, sha) {
  assert.equal(result.response.status, 200); assert.equal(result.response.headers.get("content-type"), mime);
  assert.match(result.response.headers.get("content-disposition"), /^inline;/);
  assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
  assert.match(result.response.headers.get("cache-control"), /no-store/); assert.equal(hash(result.bytes), sha);
}
async function finished(client, id) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    const task = await client.detail(id);
    if (["SUCCEEDED", "FAILED"].includes(task.status)) { assert.equal(task.status, "SUCCEEDED", task.errorMessage); return task; }
    await pause(150);
  }
  throw new Error("Task did not reach a terminal state within the observation window");
}
await check("production pages, readiness and disabled smoke endpoints", async () => {
  for (const path of ["/", "/login", "/register", "/tasks", "/templates/coastal-memory"]) {
    const response = await fetch(base + path); assert.equal(response.status, 200);
    assert.doesNotMatch(await response.text(), /backend:8080|jdbc:mysql|local-demo-password/);
  }
  const health = await fetch(base + "/api/health"); assert.equal(health.status, 200);
  assert.deepEqual(await health.json(), { status: "UP", service: "assets-creation-api", database: "UP" });
  assert.equal((await fetch(base + "/api/_smoke/cookies")).status, 404);
});

if (mode === "prepare") {
  const a = new Client(), username = "p8_" + randomUUID().replaceAll("-", "").slice(0, 20);
  let user, asset, templates; const tasks = [];
  const original = await readFile("/demo/samples/portrait.png"), resultSha = hash(await readFile("/demo/results/coastal-memory.png"));
  await check("registration rotates private session and accepts a fresh CSRF token", async () => {
    const anonymous = await a.csrf(); const cookie = anonymous.response.headers.getSetCookie().find(value => value.startsWith("JSESSIONID="));
    assert.match(cookie, /HttpOnly/i); assert.match(cookie, /SameSite=Lax/i); const old = a.cookie;
    const registered = await a.request("POST", "/api/auth/register", { username, password });
    assert.equal(registered.response.status, 201); user = registered.data; assert.notEqual(a.cookie, old);
    assert.deepEqual(Object.keys(user).sort(), ["id", "username"]); await a.csrf();
    const me = await a.request("GET", "/api/auth/me"); assert.deepEqual(me.data, user);
  });
  await check("packaged templates and all covers are readable without host source mounts", async () => {
    const response = await fetch(base + "/api/templates"); templates = await response.json(); assert.equal(templates.length, 6);
    for (const template of templates) {
      const cover = await fetch(base + template.coverUrl); assert.equal(cover.status, 200);
      assert.equal(hash(Buffer.from(await cover.arrayBuffer())), hash(await readFile("/demo/" + template.coverUrl.slice("/api/demo/".length))));
    }
  });
  await check("multipart upload and protected preview retain exact bytes and headers", async () => {
    const form = new FormData(); form.set("file", new Blob([original], { type: "image/png" }), "p8-portrait.png");
    const uploaded = await a.request("POST", "/api/assets", form); assert.equal(uploaded.response.status, 201); asset = uploaded.data;
    privateImage(await a.request("GET", asset.previewUrl), "image/png", hash(original));
  });
  await check("two accepted jobs complete independently and persist all three steps", async () => {
    const ids = [];
    for (let i = 0; i < 2; i++) {
      const started = performance.now(); const result = await a.request("POST", "/api/tasks", { templateId: "coastal-memory", assetIds: [asset.id], requestId: randomUUID() });
      assert.equal(result.response.status, 202); assert.ok(performance.now() - started < 2000); ids.push(result.data.id);
    }
    assert.notEqual(ids[0], ids[1]);
    for (const id of ids) { const task = await finished(a, id); assert.equal(task.steps.length, 3); assert.ok(task.steps.every(step => step.status === "SUCCEEDED")); tasks.push(task); }
  });
  await check("results and personal history read persisted server records", async () => {
    for (const task of tasks) privateImage(await a.request("GET", task.resultUrl), "image/png", resultSha);
    const history = await a.request("GET", "/api/tasks?page=1&pageSize=100"); assert.equal(history.data.total, 2);
    assert.deepEqual(history.data.items.map(item => item.id).sort(), tasks.map(task => task.id).sort());
  });
  await check("another account cannot read the prepared private asset or tasks", async () => {
    const b = new Client(); await b.login("demo_b", "Demo123456!");
    for (const path of [asset.previewUrl, ...tasks.flatMap(task => [`/api/tasks/${task.id}`, task.resultUrl])]) {
      const result = await b.request("GET", path); assert.equal(result.response.status, 404); assert.equal(result.data.code, "RESOURCE_NOT_FOUND");
    }
  });
  await writeFile(evidencePath, JSON.stringify({ user, cookie: a.cookie, asset, assetSha: hash(original), tasks, resultSha, templates }, null, 2), { mode: 0o600 });
  console.log("Saved local-only persistence evidence; no cookie is printed.");
} else if (mode === "verify") {
  const saved = JSON.parse(await readFile(evidencePath, "utf8")); const a = new Client();
  await check("old session expires but the registered account survives recreation", async () => {
    const old = new Client(); old.cookie = saved.cookie;
    const expired = await old.request("GET", "/api/auth/me"); assert.equal(expired.response.status, 401); assert.equal(expired.data.code, "UNAUTHENTICATED");
    assert.deepEqual(await a.login(saved.user.username), saved.user);
  });
  await check("user file volume retains original bytes and owner protection", async () => { privateImage(await a.request("GET", saved.asset.previewUrl), saved.asset.mimeType, saved.assetSha); });
  await check("task and step records remain identical and result files retain hashes", async () => {
    for (const task of saved.tasks) { assert.deepEqual(await a.detail(task.id), task); privateImage(await a.request("GET", task.resultUrl), "image/png", saved.resultSha); }
    const history = await a.request("GET", "/api/tasks?page=1&pageSize=100"); assert.equal(history.data.total, 2);
    assert.deepEqual(history.data.items.map(item => item.id).sort(), saved.tasks.map(task => task.id).sort());
  });
  await check("initialization remains idempotent on the reused MySQL volume", async () => {
    const templates = await a.request("GET", "/api/templates"); assert.deepEqual(templates.data, saved.templates);
    const active = await a.request("GET", "/api/tasks/active"); assert.deepEqual(active.data, []);
  });
} else throw new Error("Unknown P8_MODE");
console.log(JSON.stringify({ mode, passed: checks.length, checks }, null, 2));
