import { afterEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, screen, waitFor } from "@testing-library/react";
import { renderApp } from "@/test/render-app";
import { AuthForm } from "./form";
import { deferred, jsonResponse } from "@/test/fixtures";

const navigation = vi.hoisted(() => ({ replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => navigation, usePathname: () => "/register" }));
afterEach(() => vi.unstubAllGlobals());
function backend(register: () => Promise<Response>) {
  let tokens = 0;
  const fetch = vi.fn((path: string) => {
    if (path === "/api/auth/me") return Promise.resolve(jsonResponse({ code: "UNAUTHENTICATED", message: "请登录", fieldErrors: {} }, 401));
    if (path === "/api/auth/csrf") return Promise.resolve(jsonResponse({ token: "token-" + ++tokens, headerName: "X-CSRF-TOKEN", parameterName: "_csrf" }));
    if (path === "/api/auth/register") return register();
    if (path === "/api/tasks/active") return Promise.resolve(jsonResponse([]));
    return Promise.resolve(jsonResponse({ items: [], total: 0, page: 1, pageSize: 20 }));
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
function fill(confirmation = "Password123!") {
  fireEvent.change(screen.getByLabelText("用户名"), { target: { value: "new_user" } });
  fireEvent.change(screen.getByLabelText("密码", { exact: true }), { target: { value: "Password123!" } });
  fireEvent.change(screen.getByLabelText("确认密码"), { target: { value: confirmation } });
}
describe("registration page", () => {
  it("validates confirmation without sending credentials and keeps semantic labels", async () => {
    const fetch = backend(() => Promise.resolve(jsonResponse({ id: "new", username: "new_user" }, 201)));
    renderApp(<><AuthForm mode="register" /></>);
    const submit = await screen.findByRole("button", { name: "注册并开始创作" }); await waitFor(() => expect(submit).not.toBeDisabled());
    fill("different"); fireEvent.click(submit); await screen.findByText("两次输入的密码不一致");
    expect(fetch.mock.calls.some(([path]) => path === "/api/auth/register")).toBe(false);
    expect(screen.getByLabelText("确认密码")).toHaveAttribute("autocomplete", "new-password");
  });
  it("disables duplicate submission, automatically logs in and uses a safe return path", async () => {
    const pending = deferred<Response>(); const fetch = backend(() => pending.promise); const persist = vi.spyOn(Storage.prototype, "setItem");
    renderApp(<><AuthForm mode="register" returnTo="/templates/travel-postcard" /></>);
    const submit = await screen.findByRole("button", { name: "注册并开始创作" }); await waitFor(() => expect(submit).not.toBeDisabled());
    fill(); fireEvent.click(submit); await waitFor(() => expect(screen.getByRole("button", { name: "正在处理…" })).toBeDisabled());
    expect(fetch.mock.calls.filter(([path]) => path === "/api/auth/register")).toHaveLength(1);
    await act(async () => pending.resolve(jsonResponse({ id: "new", username: "new_user" }, 201)));
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith("/templates/travel-postcard"));
    expect(screen.getByText("new_user")).toBeInTheDocument(); expect(persist).not.toHaveBeenCalled();
    expect(fetch.mock.calls.filter(([path]) => path === "/api/auth/csrf")).toHaveLength(2);
  });
  it("renders duplicate-username and server field errors", async () => {
    backend(() => Promise.resolve(jsonResponse({ code: "USERNAME_TAKEN", message: "用户名已被使用", fieldErrors: { username: "换一个用户名" } }, 409)));
    renderApp(<><AuthForm mode="register" /></>);
    const submit = await screen.findByRole("button", { name: "注册并开始创作" }); await waitFor(() => expect(submit).not.toBeDisabled());
    fill(); fireEvent.click(submit); await screen.findByText("用户名已被使用"); expect(screen.getByText("换一个用户名")).toBeInTheDocument();
  });
});
