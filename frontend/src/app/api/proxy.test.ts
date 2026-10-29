import { afterEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { GET, POST } from "./[...path]/route";

afterEach(() => { vi.unstubAllGlobals(); vi.unstubAllEnvs(); });
it("closes the incoming connection after an early 413 instead of reusing a partially consumed upload", async () => {
  vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(JSON.stringify({ code: "FILE_TOO_LARGE" }), { status: 413, headers: { "Content-Type": "application/json", connection: "keep-alive" } })));
  const response = await POST(new NextRequest("http://local.test/api/assets", { method: "POST", body: "multipart bytes" }), { params: Promise.resolve({ path: ["assets"] }) });
  expect(response.status).toBe(413); expect(response.headers.get("connection")).toBe("close"); expect(await response.json()).toEqual({ code: "FILE_TOO_LARGE" });
});
it("preserves independent cookies and query parameters while stripping other hop headers", async () => {
  vi.stubEnv("JAVA_API_URL", "http://java:8080");
  const headers = new Headers({ "Content-Type": "application/json", connection: "keep-alive", "content-length": "2" });
  headers.append("set-cookie", "one=1; Path=/; HttpOnly"); headers.append("set-cookie", "two=2; Path=/; HttpOnly");
  const fetch = vi.fn().mockResolvedValue(new Response("{}", { headers })); vi.stubGlobal("fetch", fetch);
  const response = await GET(new NextRequest("http://local.test/api/templates?category=travel", { headers: { cookie: "session=value", connection: "close" } }), { params: Promise.resolve({ path: ["templates"] }) });
  expect(fetch.mock.calls[0][0].toString()).toBe("http://java:8080/api/templates?category=travel");
  expect((fetch.mock.calls[0][1].headers as Headers).get("cookie")).toBe("session=value"); expect((fetch.mock.calls[0][1].headers as Headers).has("connection")).toBe(false);
  expect(response.headers.getSetCookie()).toHaveLength(2); expect(response.headers.has("connection")).toBe(false); expect(response.headers.has("content-length")).toBe(false); expect(response.headers.get("cache-control")).toBe("no-store");
});
