import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { randomUUID, createHash } from "node:crypto";
import { setTimeout as pause } from "node:timers/promises";

const base = process.env.BASE_URL ?? "http://frontend:3000";
const evidenceFile = process.env.P4_EVIDENCE_FILE ?? "/evidence/p4-tasks.json";
const mode = process.env.P4_CHECK_MODE ?? "full";
const stages = ["MATERIAL_CHECK", "GENERATE", "FINALIZE"];
const totalDelay = Number(process.env.SIM_CHECK_DELAY_MS ?? 2000) + Number(process.env.SIM_GENERATE_DELAY_MS ?? 8000) + Number(process.env.SIM_FINALIZE_DELAY_MS ?? 2000);
const checks = [];
const sha256 = bytes => createHash("sha256").update(bytes).digest("hex");
async function check(name, action) { await action(); checks.push(name); console.log(`PASS ${name}`); }

class Client {
  cookie = ""; token = ""; header = "X-CSRF-TOKEN";
  async request(method, path, body, csrf = true) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (csrf && this.token) headers[this.header] = this.token;
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, { method, headers, signal: AbortSignal.timeout(20000),
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
    for (const cookie of response.headers.getSetCookie()) if (cookie.startsWith("JSESSIONID=")) this.cookie = cookie.split(";")[0];
    const bytes = Buffer.from(await response.arrayBuffer());
    const data = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(bytes.toString()) : null;
    return { response, data, bytes };
  }
  async csrf() { const result = await this.request("GET", "/api/auth/csrf"); assert.equal(result.response.status, 200); this.token = result.data.token; this.header = result.data.headerName; }
  async login(name = "demo_a") {
    await this.csrf(); assert.equal((await this.request("POST", "/api/auth/login", { username: name, password: "Demo123456!" })).response.status, 200); await this.csrf();
  }
  async detail(id) { const result = await this.request("GET", "/api/tasks/" + id); assert.equal(result.response.status, 200); return result.data; }
  async create(asset, extra = {}) {
    const result = await this.request("POST", "/api/tasks", { templateId: "coastal-memory", assetIds: [asset], requestId: randomUUID(), ...extra });
    assert.equal(result.response.status, 202, JSON.stringify(result.data)); return result.data;
  }
}

function error(result, status, code) { assert.equal(result.response.status, status, JSON.stringify(result.data)); assert.equal(result.data.code, code); }
async function until(client, id, predicate, budget = Math.max(20000, totalDelay * 5 + 10000), observe = () => {}) {
  const deadline = Date.now() + budget;
  while (Date.now() < deadline) { const task = await client.detail(id); observe(task); if (predicate(task)) return task; await pause(75); }
  throw new Error("Task observation timed out: " + id);
}
const terminal = task => ["SUCCEEDED", "FAILED"].includes(task.status);
async function upload(client) {
  const form = new FormData(); form.set("file", new Blob([await readFile("/demo/samples/portrait.png")], { type: "image/png" }), "portrait.png");
  const result = await client.request("POST", "/api/assets", form); assert.equal(result.response.status, 201); return result.data.id;
}
async function save(evidence) { await writeFile(evidenceFile, JSON.stringify(evidence, null, 2), { mode: 0o600 }); }
async function verifyResult(client, task) {
  const result = await client.request("GET", task.resultUrl);
  assert.equal(result.response.status, 200); assert.equal(result.response.headers.get("content-type"), "image/png");
  assert.equal(sha256(result.bytes), sha256(await readFile("/demo/results/coastal-memory.png")));
}
const a = new Client(); await a.login();

if (mode === "full") {
  const asset = await upload(a); const key = randomUUID(); let one, two;
  await check("task writes require login CSRF and valid server-side materials", async () => {
    const anonymous = new Client(); await anonymous.csrf();
    const body = { templateId: "coastal-memory", assetIds: [asset], requestId: randomUUID() };
    error(await anonymous.request("POST", "/api/tasks", body), 401, "UNAUTHENTICATED");
    error(await a.request("POST", "/api/tasks", body, false), 403, "FORBIDDEN");
    error(await a.request("POST", "/api/tasks", { ...body, assetIds: [asset, asset] }), 400, "INVALID_ASSETS");
    error(await a.request("POST", "/api/tasks", { ...body, templateId: "missing" }), 404, "TEMPLATE_NOT_FOUND");
  });
  await check("two submissions return IDs quickly while background work remains active", async () => {
    let started = performance.now(); one = await a.create(asset, { requestId: key }); assert.ok(performance.now() - started < 1500);
    started = performance.now(); two = await a.create(asset); assert.ok(performance.now() - started < 1500);
    assert.ok(!terminal(one) && !terminal(two)); assert.notEqual(one.id, two.id);
    const active = await a.request("GET", "/api/tasks/active"); assert.equal(active.response.status, 200);
    for (const task of [one, two]) assert.ok(active.data.some(item => item.id === task.id));
    assert.equal((await a.detail(two.id)).status, "QUEUED");
  });
  await check("same request is idempotent and changed payload returns 409", async () => {
    assert.equal((await a.create(asset, { requestId: key })).id, one.id);
    error(await a.request("POST", "/api/tasks", { templateId: "travel-postcard", assetIds: [asset], requestId: key }), 409, "IDEMPOTENCY_CONFLICT");
    error(await a.request("GET", `/api/tasks/${one.id}/result`), 404, "RESOURCE_NOT_FOUND");
  });
  await check("Java exposes three independent stages and executes queued jobs in order", async () => {
    const observed = new Set();
    one = await until(a, one.id, terminal, undefined, task => { if (task.currentStage) observed.add(task.currentStage); });
    assert.equal(one.status, "SUCCEEDED"); assert.deepEqual([...observed], stages);
    two = await until(a, two.id, terminal); assert.equal(two.status, "SUCCEEDED");
    assert.ok(new Date(two.startedAt) >= new Date(one.finishedAt));
    for (const task of [one, two]) {
      assert.deepEqual(task.steps.map(step => step.stage), stages);
      assert.ok(task.steps.every(step => step.status === "SUCCEEDED" && step.startedAt && step.finishedAt));
      assert.equal(task.currentStage, "FINALIZE"); assert.equal(task.errorCode, null);
    }
  });
  await check("results are task-specific real images and terminal queries remain unchanged", async () => {
    const expected = await readFile("/demo/results/coastal-memory.png");
    assert.notEqual(one.resultUrl, two.resultUrl);
    for (const task of [one, two]) {
      const result = await a.request("GET", task.resultUrl); assert.equal(result.response.status, 200);
      assert.equal(result.response.headers.get("content-type"), "image/png"); assert.equal(result.response.headers.get("x-content-type-options"), "nosniff");
      assert.match(result.response.headers.get("cache-control"), /no-store/); assert.equal(sha256(result.bytes), sha256(expected));
      for (let i = 0; i < 3; i++) assert.deepEqual(await a.detail(task.id), task);
    }
  });
  await check("personal history active list and result ownership cannot be forged", async () => {
    const b = new Client(); await b.login("demo_b");
    for (const path of [`/api/tasks/${one.id}?userId=10000000-0000-4000-8000-000000000001`, one.resultUrl]) error(await b.request("GET", path), 404, "RESOURCE_NOT_FOUND");
    const other = await b.request("GET", "/api/tasks?pageSize=100"); assert.ok(other.data.items.every(task => ![one.id, two.id].includes(task.id)));
    const active = await a.request("GET", "/api/tasks/active"); assert.ok(active.data.every(task => ![one.id, two.id].includes(task.id)));
    const history = await a.request("GET", "/api/tasks?pageSize=1&status=SUCCEEDED"); assert.equal(history.data.items.length, 1); assert.ok(history.data.total >= 2);
    error(await a.request("GET", "/api/tasks?page=0"), 400, "INVALID_PAGINATION");
  });
  await check("work completes without queries or the creating client staying connected", async () => {
    const task = await a.create(asset); await pause(totalDelay + 1500);
    const fresh = new Client(); await fresh.login();
    const done = await fresh.detail(task.id); assert.equal(done.status, "SUCCEEDED");
    await save({ asset, terminal: [one, two, done] });
  });
} else {
  const evidence = JSON.parse(await readFile(evidenceFile, "utf8"));
  if (mode === "failure") {
    const failure = process.env.SIM_FAIL_STAGE; assert.ok(stages.includes(failure));
    await check(`configured ${failure} failure is persisted and stops all later steps`, async () => {
      const task = await a.create(evidence.asset); const failed = await until(a, task.id, terminal);
      assert.equal(failed.status, "FAILED"); assert.equal(failed.currentStage, failure); assert.equal(failed.errorCode, "SIMULATED_FAILURE");
      assert.ok(failed.errorMessage.includes("模拟失败")); assert.equal(failed.resultUrl, null);
      failed.steps.forEach((step, i) => assert.equal(step.status, i < stages.indexOf(failure) ? "SUCCEEDED" : i === stages.indexOf(failure) ? "FAILED" : "PENDING"));
      error(await a.request("GET", `/api/tasks/${failed.id}/result`), 404, "RESOURCE_NOT_FOUND");
      assert.deepEqual(await a.detail(failed.id), failed); evidence.terminal.push(failed); await save(evidence);
    });
  } else if (mode === "prepare-restart" || mode === "prepare-graceful") {
    await check("prepare one running task and one queued task for lifecycle verification", async () => {
      const running = await a.create(evidence.asset); const queued = await a.create(evidence.asset);
      const current = await until(a, running.id, task => task.status === "RUNNING", 5000);
      assert.equal((await a.detail(queued.id)).status, "QUEUED");
      evidence.lifecycle = { running: current.id, queued: queued.id, cookie: a.cookie, mode }; await save(evidence);
    });
  } else if (mode === "verify-restart") {
    await check("restart invalidates old session and fails only the interrupted task", async () => {
      const old = new Client(); old.cookie = evidence.lifecycle.cookie;
      error(await old.request("GET", "/api/tasks/" + evidence.lifecycle.running), 401, "UNAUTHENTICATED");
      const task = await a.detail(evidence.lifecycle.running); assert.equal(task.status, "FAILED");
      assert.equal(task.errorCode, "SERVICE_RESTARTED"); assert.equal(task.errorMessage, "服务重启导致制作中断");
      assert.equal(task.currentStage, "MATERIAL_CHECK"); assert.equal(task.steps[0].status, "FAILED"); assert.equal(task.steps[1].status, "PENDING");
    });
    await check("queued task resumes with old delay and failure snapshot despite new NONE config", async () => {
      assert.equal(process.env.SIM_FAIL_STAGE, "NONE");
      const task = await until(a, evidence.lifecycle.queued, terminal, 30000);
      assert.equal(task.status, "FAILED"); assert.equal(task.errorCode, "SIMULATED_FAILURE"); assert.equal(task.currentStage, "MATERIAL_CHECK");
    });
    await check("previous succeeded and failed terminal records survive restart unchanged", async () => {
      for (const task of evidence.terminal) { assert.deepEqual(await a.detail(task.id), task); if (task.status === "SUCCEEDED") await verifyResult(a, task); }
    });
  } else if (mode === "verify-graceful") {
    await check("graceful stop completed its running task and preserved the queued job for restart", async () => {
      const running = await a.detail(evidence.lifecycle.running), queued = await until(a, evidence.lifecycle.queued, terminal, 15000);
      assert.equal(running.status, "SUCCEEDED"); assert.equal(queued.status, "SUCCEEDED");
      for (const task of [running, queued, ...evidence.terminal]) {
        assert.deepEqual(await a.detail(task.id), task);
        if (task.status === "SUCCEEDED") await verifyResult(a, task);
      }
    });
  } else throw new Error("Unknown P4_CHECK_MODE");
}
console.log(JSON.stringify({ mode, passed: checks.length, checks }, null, 2));
