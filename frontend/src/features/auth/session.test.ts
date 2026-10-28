import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiFailure } from "@/lib/api/client";
import { SessionStore, safeReturnTo, validateCredentials } from "./session";
import { deferred } from "@/test/fixtures";

const userA = { id: "user-a", username: "demo_a" }, userB = { id: "user-b", username: "demo_b" };
const credentials = { username: "demo_b", password: "Password123!" };
async function authenticated() {
  const api = new ApiClient(); const request = vi.spyOn(api, "request").mockResolvedValue(userA);
  const csrf = vi.spyOn(api, "csrf").mockResolvedValue({ token: "fresh", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" });
  const clear = vi.fn(); const session = new SessionStore(api, clear); await session.restore(); clear.mockClear(); return { api, request, csrf, clear, session };
}
describe("identity lifecycle", () => {
  it.each(["BAD_CREDENTIALS", "USERNAME_TAKEN", "FORBIDDEN"])("preserves existing identity for %s", async code => {
    const { request, session, clear } = await authenticated(); request.mockRejectedValueOnce(new ApiFailure(code === "FORBIDDEN" ? 403 : 401, code, "error"));
    await expect(session.authenticate("login", credentials)).rejects.toMatchObject({ code });
    expect(session.getSnapshot()).toMatchObject({ status: "ready", user: userA }); expect(clear).toHaveBeenCalledOnce();
  });
  it("preserves identity on an unknown auth result but blocks writes until revalidation", async () => {
    const { request, session } = await authenticated(); request.mockRejectedValueOnce(new ApiFailure(0, "NETWORK_ERROR", "offline"));
    await expect(session.authenticate("login", credentials)).rejects.toThrow(); expect(session.getSnapshot()).toMatchObject({ status: "error", user: userA });
    await expect(session.authenticate("login", credentials)).rejects.toMatchObject({ code: "AUTH_NOT_READY" });
    request.mockResolvedValueOnce(userB); await session.restore(); expect(session.getSnapshot()).toMatchObject({ status: "ready", user: userB });
  });
  it("clears private state before switching, then refreshes CSRF and publishes the new owner", async () => {
    const { request, session, csrf, clear } = await authenticated();
    request.mockImplementationOnce(async () => { expect(clear).toHaveBeenCalledOnce(); expect(session.getSnapshot().status).toBe("changing"); return userB; });
    await session.authenticate("login", credentials); expect(session.getSnapshot()).toMatchObject({ user: userB, status: "ready" });
    expect(csrf).toHaveBeenCalledTimes(2); expect(clear).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(session.getSnapshot())).not.toContain(credentials.password);
  });
  it("rejects an incomplete successful identity response without publishing it", async () => {
    const { request, session } = await authenticated(); request.mockResolvedValueOnce({});
    await expect(session.authenticate("login", credentials)).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(session.getSnapshot()).toMatchObject({ user: userA, status: "error" });
  });
  it("revokes private state on expiry and ignores an older restore completion", async () => {
    const { request, session, api } = await authenticated(); const old = deferred<typeof userA>(); request.mockReturnValueOnce(old.promise);
    const disconnect = session.connect(); api.onUnauthorized!(); old.resolve(userA); await old.promise; await Promise.resolve();
    expect(session.getSnapshot().user).toBeNull(); expect(session.getSnapshot().notice).toContain("过期"); disconnect();
  });
  it("logout failure retains identity; acknowledged logout clears it without cancelling backend jobs", async () => {
    const { request, session } = await authenticated(); request.mockRejectedValueOnce(new ApiFailure(0, "NETWORK_ERROR", "offline"));
    await session.logout(); expect(session.getSnapshot()).toMatchObject({ user: userA, status: "error" });
    request.mockResolvedValueOnce(userA); await session.restore(); request.mockResolvedValueOnce(undefined); await session.logout();
    expect(session.getSnapshot()).toMatchObject({ user: null, status: "ready" });
    expect(request.mock.calls.every(([path]) => path === "/api/auth/me" || path === "/api/auth/logout")).toBe(true);
  });
});
describe("account form rules", () => {
  it.each(["https://evil.test", "//evil.test", "/\\evil.test", "/%2f%2fevil.test", "/login", ["/", "/tasks"], undefined])("rejects unsafe or unsuitable returnTo %j", value => expect(safeReturnTo(value)).toBe("/"));
  it("retains a known internal return path", () => expect(safeReturnTo("/templates/travel-postcard?source=gallery")).toBe("/templates/travel-postcard?source=gallery"));
  it("validates normalized usernames and Unicode password byte boundaries", () => {
    expect(validateCredentials(" DEMO_A ", "汉".repeat(24), "汉".repeat(24))).toEqual({});
    expect(validateCredentials("demo_a", "😀".repeat(18))).toEqual({});
    expect(validateCredentials("demo_a", "😀".repeat(19)).password).toBeTruthy();
    expect(validateCredentials("demo_a", "😀".repeat(4)).password).toBeTruthy();
    expect(validateCredentials("bad-name", "Password123!", "different")).toHaveProperty("confirmation");
  });
});
