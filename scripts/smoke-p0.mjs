import assert from "node:assert/strict";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL ?? "http://frontend:3000";
const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=", "base64");
const results = [];

async function check(name, fn) {
  await fn();
  results.push(name);
  console.log(`PASS ${name}`);
}

await check("Next.js page and Java/MySQL health", async () => {
  const page = await fetch(base);
  assert.equal(page.status, 200);
  assert.match(await page.text(), /素材制作/);
  const response = await fetch(`${base}/api/health`);
  assert.equal(response.status, 200);
  assert.equal((await response.json()).database, "UP");
});

const csrfResponse = await fetch(`${base}/api/auth/csrf`);
assert.equal(csrfResponse.status, 200);
const session = csrfResponse.headers.getSetCookie().find((value) => value.startsWith("JSESSIONID="))?.split(";")[0];
assert.ok(session, "Java session cookie must survive the proxy");
const csrf = await csrfResponse.json();
const credentials = { Cookie: session, [csrf.headerName]: csrf.token };

await check("multiple Set-Cookie response headers", async () => {
  const response = await fetch(`${base}/api/_smoke/cookies`);
  assert.equal(response.status, 200);
  assert.equal(response.headers.getSetCookie().length, 2);
});

await check("JSON, Cookie, session and CSRF forwarding", async () => {
  const response = await fetch(`${base}/api/_smoke/echo`, {
    method: "POST",
    headers: { ...credentials, "Content-Type": "application/json" },
    body: JSON.stringify({ message: "同源转发", count: 2 }),
  });
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { body: { message: "同源转发", count: 2 }, sessionPresent: true });
});

await check("multipart upload bytes survive forwarding", async () => {
  const form = new FormData();
  form.set("file", new Blob([png], { type: "image/png" }), "probe.png");
  const response = await fetch(`${base}/api/_smoke/upload`, { method: "POST", headers: credentials, body: form });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.sizeBytes, png.length);
  assert.equal(data.mimeType, "image/png");
  assert.equal(data.sha256, createHash("sha256").update(png).digest("hex"));
});

await check("5 MiB file reaches Java without proxy truncation", async () => {
  // Transport probe only: P3 will independently validate real image contents.
  const bytes = new Uint8Array(5 * 1024 * 1024);
  bytes.set(png);
  const form = new FormData();
  form.set("file", new Blob([bytes], { type: "image/png" }), "boundary.png");
  const response = await fetch(`${base}/api/_smoke/upload`, { method: "POST", headers: credentials, body: form });
  assert.equal(response.status, 200);
  const data = await response.json();
  assert.equal(data.sizeBytes, bytes.length);
  assert.equal(data.sha256, createHash("sha256").update(bytes).digest("hex"));
});

await check("over-limit file preserves structured 413 response", async () => {
  const form = new FormData();
  form.set("file", new Blob([new Uint8Array(5 * 1024 * 1024 + 1)], { type: "image/png" }), "too-large.png");
  const response = await fetch(`${base}/api/_smoke/upload`, { method: "POST", headers: credentials, body: form });
  assert.equal(response.status, 413);
  assert.equal((await response.json()).code, "FILE_TOO_LARGE");
});

await check("image response body and Content-Type", async () => {
  const response = await fetch(`${base}/api/_smoke/file`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type"), /^image\/png/);
  assert.deepEqual(Buffer.from(await response.arrayBuffer()), png);
});

await check("upstream error status and payload", async () => {
  const response = await fetch(`${base}/api/_smoke/error`);
  assert.equal(response.status, 400);
  assert.equal((await response.json()).code, "SMOKE_ERROR");
});

await check("CSRF and authentication failures remain distinct", async () => {
  const write = await fetch(`${base}/api/_smoke/echo`, { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" });
  assert.equal(write.status, 403);
  const query = await fetch(`${base}/api/tasks`);
  assert.equal(query.status, 401);
});

await check("proxy returns 504 on upstream timeout", async () => {
  const response = await fetch(`${base}/api/_smoke/delay?milliseconds=12000`);
  assert.equal(response.status, 504);
  assert.equal((await response.json()).code, "UPSTREAM_TIMEOUT");
});

console.log(JSON.stringify({ passed: results.length, checks: results }, null, 2));
