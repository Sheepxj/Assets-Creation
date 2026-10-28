import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { createHash } from "node:crypto";

const base = process.env.BASE_URL ?? "http://frontend:3000";
const evidenceFile = process.env.P3_EVIDENCE_FILE ?? "/evidence/p3-assets.json";
const mode = process.env.P3_CHECK_MODE ?? "full";
const maxBytes = 5 * 1024 * 1024;
const results = [];
const savedAssets = [];
const hash = bytes => createHash("sha256").update(bytes).digest("hex");

async function check(name, action) {
  await action();
  results.push(name);
  console.log(`PASS ${name}`);
}

class Client {
  cookie = "";
  token = "";
  header = "X-CSRF-TOKEN";

  async request(method, path, body, csrf = true) {
    const headers = {};
    if (this.cookie) headers.Cookie = this.cookie;
    if (csrf && this.token) headers[this.header] = this.token;
    if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
    const response = await fetch(base + path, {
      method, headers, signal: AbortSignal.timeout(20000),
      body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body),
    });
    for (const cookie of response.headers.getSetCookie()) {
      if (cookie.startsWith("JSESSIONID=")) this.cookie = /max-age=0/i.test(cookie) ? "" : cookie.split(";")[0];
    }
    const bytes = Buffer.from(await response.arrayBuffer());
    const data = response.headers.get("content-type")?.includes("application/json") ? JSON.parse(bytes.toString("utf8")) : null;
    return { response, bytes, data };
  }

  async csrf() {
    const result = await this.request("GET", "/api/auth/csrf");
    assert.equal(result.response.status, 200);
    this.token = result.data.token;
    this.header = result.data.headerName;
  }

  async login(username = "demo_a") {
    await this.csrf();
    assert.equal((await this.request("POST", "/api/auth/login", { username, password: "Demo123456!" })).response.status, 200);
    await this.csrf();
  }
}

function form(bytes, mime = "image/png", filename = "portrait.png", field = "file") {
  const body = new FormData();
  body.append(field, new Blob([bytes], { type: mime }), filename);
  return body;
}

function expectError(result, status, code) {
  assert.equal(result.response.status, status, JSON.stringify(result.data));
  assert.equal(result.data.code, code);
  assert.equal(typeof result.data.message, "string");
  assert.equal(typeof result.data.fieldErrors, "object");
}

async function upload(client, bytes, mime = "image/png", filename = "portrait.png", forgedUser = false) {
  const body = form(bytes, mime, filename);
  if (forgedUser) body.set("userId", "10000000-0000-4000-8000-000000000002");
  const result = await client.request("POST", "/api/assets", body);
  assert.equal(result.response.status, 201, JSON.stringify(result.data));
  const dto = result.data;
  assert.deepEqual(Object.keys(dto).sort(), ["id", "mimeType", "originalFilename", "previewUrl", "sizeBytes"]);
  assert.match(dto.id, /^[0-9a-f-]{36}$/);
  assert.equal(dto.mimeType, mime);
  assert.equal(dto.sizeBytes, bytes.length);
  assert.equal(dto.previewUrl, `/api/assets/${dto.id}/content`);
  savedAssets.push({ ...dto, sha256: hash(bytes) });
  return dto;
}

async function verifyPreview(client, asset) {
  const preview = await client.request("GET", asset.previewUrl);
  assert.equal(preview.response.status, 200, JSON.stringify(preview.data));
  assert.equal(preview.response.headers.get("content-type"), asset.mimeType);
  assert.match(preview.response.headers.get("content-disposition"), /^inline; filename="[0-9a-f-]+\.(?:png|jpg)"$/);
  assert.equal(preview.response.headers.get("x-content-type-options"), "nosniff");
  assert.match(preview.response.headers.get("cache-control"), /no-store/);
  assert.equal(preview.bytes.length, asset.sizeBytes);
  assert.equal(hash(preview.bytes), asset.sha256);
}

if (mode === "verify-restart") {
  const saved = JSON.parse(await readFile(evidenceFile, "utf8"));
  await check("recreated Java container invalidates its previous session", async () => {
    const old = new Client(); old.cookie = saved.cookie;
    expectError(await old.request("GET", saved.assets[0].previewUrl), 401, "UNAUTHENTICATED");
  });
  await check("new login reads every persisted asset with identical bytes after recreation", async () => {
    const fresh = new Client(); await fresh.login();
    assert.equal(saved.assets.length, 4);
    for (const asset of saved.assets) await verifyPreview(fresh, asset);
  });
} else if (mode === "full") {
  const anonymous = new Client(); const a = new Client(); const b = new Client();
  const png = await readFile("/demo/samples/portrait.png");
  const jpeg = await readFile("/demo/samples/landscape.jpg");
  let templates;

  await check("public categories and templates support filtering and empty results", async () => {
    const categories = await anonymous.request("GET", "/api/templates/categories");
    assert.equal(categories.response.status, 200); assert.equal(categories.data.length, 3);
    const all = await anonymous.request("GET", "/api/templates");
    assert.equal(all.response.status, 200); templates = all.data; assert.equal(templates.length, 6);
    assert.deepEqual([...new Set(templates.map(t => t.requiredImageCount))].sort(), [1, 2, 3]);
    for (const category of categories.data) {
      const filtered = await anonymous.request("GET", "/api/templates?category=" + encodeURIComponent(category.id));
      assert.equal(filtered.response.status, 200); assert.equal(filtered.data.length, 2);
      assert.ok(filtered.data.every(t => t.category === category.id));
    }
    const empty = await anonymous.request("GET", "/api/templates?category=nonexistent");
    assert.equal(empty.response.status, 200); assert.deepEqual(empty.data, []);
  });

  await check("details return actual template requirements and unknown template is JSON 404", async () => {
    for (const template of templates) {
      const detail = await anonymous.request("GET", "/api/templates/" + template.id);
      assert.equal(detail.response.status, 200); assert.deepEqual(detail.data, template);
      assert.deepEqual(template.acceptedMimeTypes, ["image/jpeg", "image/png"]);
      assert.equal(template.maxFileSizeBytes, maxBytes);
    }
    expectError(await anonymous.request("GET", "/api/templates/nonexistent"), 404, "TEMPLATE_NOT_FOUND");
  });

  await check("all six public covers serve repository JPEG bytes and missing cover is 404", async () => {
    for (const template of templates) {
      assert.match(template.coverUrl, /^\/api\/demo\/covers\/[a-z0-9-]+\.jpg$/);
      const cover = await anonymous.request("GET", template.coverUrl);
      assert.equal(cover.response.status, 200); assert.equal(cover.response.headers.get("content-type"), "image/jpeg");
      assert.deepEqual(cover.bytes, await readFile("/demo/" + template.coverUrl.slice("/api/demo/".length)));
    }
    expectError(await anonymous.request("GET", "/api/demo/covers/missing.jpg"), 404, "RESOURCE_NOT_FOUND");
  });

  await a.login(); await b.login("demo_b");
  await check("real PNG upload returns a persistent DTO and ignores forged userId", async () => {
    await upload(a, png, "image/png", "portrait.png", true);
  });
  await check("real JPEG is classified by content even with a misleading filename extension", async () => {
    await upload(a, jpeg, "image/jpeg", "landscape.png");
  });
  await check("independent preview requests retain bytes MIME inline filename and private headers", async () => {
    for (const asset of savedAssets) { await verifyPreview(a, asset); await verifyPreview(a, asset); }
  });
  await check("another user and missing resources are indistinguishable JSON 404", async () => {
    expectError(await b.request("GET", savedAssets[0].previewUrl + "?userId=10000000-0000-4000-8000-000000000001"), 404, "RESOURCE_NOT_FOUND");
    expectError(await a.request("GET", "/api/assets/00000000-0000-4000-8000-000000000000/content"), 404, "RESOURCE_NOT_FOUND");
    expectError(await anonymous.request("GET", savedAssets[0].previewUrl), 401, "UNAUTHENTICATED");
  });
  await check("uploads require an authenticated session and a CSRF header", async () => {
    expectError(await a.request("POST", "/api/assets", form(png), false), 403, "FORBIDDEN");
    await anonymous.csrf();
    expectError(await anonymous.request("POST", "/api/assets", form(png)), 401, "UNAUTHENTICATED");
  });
  await check("empty spoofed SVG corrupt and MIME-mismatched images return clear errors", async () => {
    const invalid = [
      [Buffer.alloc(0), "image/png", 400, "FILE_EMPTY"],
      [Buffer.from("<html>fake png</html>"), "image/png", 415, "UNSUPPORTED_IMAGE_TYPE"],
      [Buffer.from("<svg xmlns='http://www.w3.org/2000/svg'/>"), "image/svg+xml", 415, "UNSUPPORTED_IMAGE_TYPE"],
      [png.subarray(0, 20), "image/png", 400, "INVALID_IMAGE"],
      [png, "image/jpeg", 415, "IMAGE_TYPE_MISMATCH"],
    ];
    for (const [bytes, mime, status, code] of invalid) expectError(await a.request("POST", "/api/assets", form(bytes, mime)), status, code);
  });
  await check("missing multiple wrongly named files and JSON bodies are rejected", async () => {
    const missing = new FormData(); missing.set("description", "no image");
    const multiple = form(png); multiple.append("file", new Blob([png], { type: "image/png" }), "second.png");
    for (const body of [missing, multiple, form(png, "image/png", "portrait.png", "other")]) {
      expectError(await a.request("POST", "/api/assets", body), 400, "INVALID_FILE_COUNT");
    }
    expectError(await a.request("POST", "/api/assets", {}), 415, "HTTP_415");
  });
  await check("a decodable PNG of exactly 5 MiB crosses Next.js and Java intact", async () => {
    const boundary = Buffer.alloc(maxBytes); png.copy(boundary);
    const asset = await upload(a, boundary, "image/png", "boundary.png");
    await verifyPreview(a, savedAssets.find(item => item.id === asset.id));
  });
  await check("5 MiB plus one byte and request overflow return JSON 413 through the proxy", async () => {
    for (const size of [maxBytes + 1, 7 * 1024 * 1024]) {
      const excess = Buffer.alloc(size); png.copy(excess);
      expectError(await a.request("POST", "/api/assets", form(excess)), 413, "FILE_TOO_LARGE");
    }
  });
  await check("client path-like filenames remain metadata and never choose a preview path", async () => {
    const asset = await upload(a, png, "image/png", "C:\\fakepath\\original.png");
    assert.equal(asset.originalFilename, "original.png");
    await verifyPreview(a, savedAssets.find(item => item.id === asset.id));
  });
  await writeFile(evidenceFile, JSON.stringify({ cookie: a.cookie, assets: savedAssets }, null, 2), { mode: 0o600 });
  console.log("Saved local-only evidence for the container recreation check.");
} else {
  throw new Error("Unknown P3_CHECK_MODE");
}

console.log(JSON.stringify({ mode, passed: results.length, checks: results }, null, 2));
