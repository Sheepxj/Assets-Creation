// Run inside the frontend container via stdin. Public demo credentials only.
const base = process.env.BASE_URL ?? "http://127.0.0.1:3000";
let cookie = "", token = "", csrfHeader = "X-CSRF-TOKEN";
async function request(method, path, body, expected = 200) {
  const headers = { Cookie: cookie };
  if (token) headers[csrfHeader] = token;
  if (body !== undefined && !(body instanceof FormData)) headers["Content-Type"] = "application/json";
  const response = await fetch(base + path, { method, headers, signal: AbortSignal.timeout(20000),
    body: body === undefined ? undefined : body instanceof FormData ? body : JSON.stringify(body) });
  for (const value of response.headers.getSetCookie()) if (value.startsWith("JSESSIONID=")) cookie = /max-age=0/i.test(value) ? "" : value.split(";")[0];
  const data = response.status === 204 ? null : await response.json();
  if (response.status !== expected) throw new Error(`${method} ${path}: ${response.status} ${data?.code ?? ""}`);
  return data;
}
async function csrf() {
  const result = await request("GET", "/api/auth/csrf"); token = result.token; csrfHeader = result.headerName;
}
await csrf();
const user = await request("POST", "/api/auth/login", { username: "demo_a", password: "Demo123456!" });
await csrf();
try {
  console.log("Authenticated demo user:", JSON.stringify(user));
  const template = await request("GET", "/api/templates/coastal-memory");
  // Use the packaged public JPEG as input, so no host files or paid service are needed.
  const cover = await fetch(base + template.coverUrl, { signal: AbortSignal.timeout(20000) });
  if (!cover.ok) throw new Error("Packaged cover is unavailable");
  const form = new FormData(); form.set("file", await cover.blob(), "api-demo.jpg");
  const asset = await request("POST", "/api/assets", form, 201);
  console.log("201 AssetDto:", JSON.stringify(asset));
  const payload = { templateId: template.id, assetIds: [asset.id], requestId: crypto.randomUUID() };
  console.log("CreateTaskRequest:", JSON.stringify(payload));
  let task = await request("POST", "/api/tasks", payload, 202);
  console.log("202 TaskDto:", JSON.stringify(task));
  const deadline = Date.now() + 120000;
  while (!["SUCCEEDED", "FAILED"].includes(task.status)) {
    if (Date.now() > deadline) throw new Error("Observation timed out; the task continues on Java");
    await new Promise(resolve => setTimeout(resolve, 300)); task = await request("GET", "/api/tasks/" + task.id);
  }
  console.log("Terminal TaskDto:", JSON.stringify(task));
  if (task.status !== "SUCCEEDED") throw new Error(`Task failed: ${task.errorCode}`);
  const result = await fetch(base + task.resultUrl, { headers: { Cookie: cookie }, signal: AbortSignal.timeout(20000) });
  if (!result.ok) throw new Error("Result is unavailable");
  console.log("Result:", result.status, result.headers.get("content-type"), (await result.arrayBuffer()).byteLength, "bytes");
} finally {
  await request("POST", "/api/auth/logout", undefined, 204);
}
