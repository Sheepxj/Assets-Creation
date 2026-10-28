import { afterEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiFailure } from "./client";
import { deferred, jsonResponse } from "@/test/fixtures";

afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
describe("same-origin API transport", () => {
  it("gets CSRF and preserves a browser-generated multipart boundary and cookies", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ token: "token", headerName: "X-CSRF-TOKEN" })).mockResolvedValueOnce(jsonResponse({ id: "asset" }, 201));
    vi.stubGlobal("fetch", fetch); const api = new ApiClient(); const body = new FormData(); body.set("file", new Blob(["png"], { type: "image/png" }), "p.png");
    await api.request("/api/assets", { method: "POST", body });
    const options = fetch.mock.calls[1][1] as RequestInit;
    expect(fetch.mock.calls[0][0]).toBe("/api/auth/csrf"); expect(options.credentials).toBe("same-origin"); expect(options.body).toBe(body);
    expect(new Headers(options.headers).get("X-CSRF-TOKEN")).toBe("token"); expect(new Headers(options.headers).has("Content-Type")).toBe(false);
  });
  it("only UNAUTHENTICATED expires identity, never BAD_CREDENTIALS or network errors", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ token: "t", headerName: "X-CSRF-TOKEN" }))
      .mockResolvedValueOnce(jsonResponse({ code: "BAD_CREDENTIALS", message: "用户名或密码错误", fieldErrors: {} }, 401))
      .mockRejectedValueOnce(new TypeError("offline"))
      .mockResolvedValueOnce(jsonResponse({ code: "UNAUTHENTICATED", message: "请先登录", fieldErrors: {} }, 401));
    vi.stubGlobal("fetch", fetch); const api = new ApiClient(); const expired = vi.fn(); api.onUnauthorized = expired;
    await expect(api.request("/api/auth/login", { method: "POST", body: {} })).rejects.toMatchObject({ code: "BAD_CREDENTIALS" }); expect(expired).not.toHaveBeenCalled();
    await expect(api.request("/api/tasks")).rejects.toMatchObject({ code: "NETWORK_ERROR", status: 0 }); expect(expired).not.toHaveBeenCalled();
    await expect(api.request("/api/tasks")).rejects.toMatchObject({ code: "UNAUTHENTICATED" }); expect(expired).toHaveBeenCalledOnce();
  });
  it.each([200, 401])("ignores old owner responses even when transport ignores cancellation (%s)", async status => {
    const pending = deferred<Response>(); vi.stubGlobal("fetch", vi.fn().mockReturnValue(pending.promise));
    const api = new ApiClient(); const expired = vi.fn(); api.onUnauthorized = expired;
    const old = api.request("/api/tasks"); api.resetScope();
    pending.resolve(jsonResponse(status === 200 ? [{ id: "old-user" }] : { code: "UNAUTHENTICATED" }, status));
    await expect(old).rejects.toMatchObject({ name: "AbortError" }); expect(expired).not.toHaveBeenCalled();
  });
  it("returns field errors and refreshes CSRF on the next explicit attempt without replaying writes", async () => {
    const fetch = vi.fn().mockResolvedValueOnce(jsonResponse({ token: "old", headerName: "X-CSRF-TOKEN" }))
      .mockResolvedValueOnce(jsonResponse({ code: "FORBIDDEN", message: "刷新后重试", fieldErrors: { file: "校验失败" } }, 403))
      .mockResolvedValueOnce(jsonResponse({ token: "new", headerName: "X-CSRF-TOKEN" })).mockResolvedValueOnce(jsonResponse({ id: "ok" }));
    vi.stubGlobal("fetch", fetch); const api = new ApiClient();
    await expect(api.request("/api/tasks", { method: "POST", body: {} })).rejects.toMatchObject({ status: 403, fieldErrors: { file: "校验失败" } });
    expect(fetch).toHaveBeenCalledTimes(2);
    await api.request("/api/tasks", { method: "POST", body: {} });
    expect(fetch).toHaveBeenCalledTimes(4); expect(new Headers(fetch.mock.calls[3][1].headers).get("X-CSRF-TOKEN")).toBe("new");
  });
  it("distinguishes an explicit cancellation from a request timeout", async () => {
    vi.useFakeTimers();
    vi.stubGlobal("fetch", vi.fn((_path, options: RequestInit) => new Promise((_resolve, reject) => options.signal!.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError"))))));
    const api = new ApiClient(); const timeout = api.request("/api/tasks", { timeoutMs: 10 }).catch(error => error);
    await vi.advanceTimersByTimeAsync(10); expect(await timeout).toMatchObject({ code: "REQUEST_TIMEOUT", status: 0 });
    const cancel = new AbortController(); const stopped = api.request("/api/tasks", { signal: cancel.signal }).catch(error => error); cancel.abort();
    expect(await stopped).toMatchObject({ name: "AbortError" });
  });
  it("treats malformed successful responses as unreadable, not successful", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>upstream</html>", { status: 200 })));
    await expect(new ApiClient().request("/api/templates")).rejects.toBeInstanceOf(ApiFailure);
  });
});
