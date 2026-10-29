import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, screen, within } from "@testing-library/react";
import { focusManager, onlineManager } from "@tanstack/react-query";
import { renderApp } from "@/test/render-app";
import { deferred, jsonResponse, task } from "@/test/fixtures";
import { finished, installTaskApi, owner, page, running, settle, TaskProbe } from "@/test/task-support";
import { TasksPanel } from "./cards";
import { identityStorageKey } from "@/features/auth/identity-sync";

vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); focusManager.setFocused(undefined); onlineManager.setOnline(true); });
const tracked = () => JSON.parse(screen.getByLabelText("跟踪快照").textContent!);

it("shows discovery failure without claiming the account is empty, then recovers to a confirmed empty state", async () => {
  let unavailable = true;
  installTaskApi(path => path === "/api/tasks/active" || path.startsWith("/api/tasks?")
    ? unavailable ? jsonResponse({ code: "UNAVAILABLE", message: "记录请求故障" }, 503) : jsonResponse(path === "/api/tasks/active" ? [] : page([])) : undefined);
  renderApp(<TasksPanel />); await settle();
  expect(screen.getByText("记录请求故障")).toBeInTheDocument();
  expect(screen.queryByText("第一份灵感，从这里开始")).not.toBeInTheDocument();
  unavailable = false; fireEvent.click(screen.getByRole("button", { name: "重试" })); await settle();
  expect(screen.getByText("第一份灵感，从这里开始")).toBeInTheDocument();
  expect(screen.queryByText("记录请求故障")).not.toBeInTheDocument();
});

it("retains known cards during a discovery error without showing an empty state", async () => {
  let unavailable = false;
  installTaskApi(path => path === "/api/tasks/active" || path.startsWith("/api/tasks?")
    ? unavailable ? jsonResponse({ code: "UNAVAILABLE", message: "记录请求故障" }, 503) : jsonResponse(path === "/api/tasks/active" ? [] : page([finished("known")])) : undefined);
  renderApp(<TasksPanel />); await settle(); unavailable = true;
  fireEvent.click(screen.getByRole("button", { name: "刷新" })); await settle();
  expect(screen.getByText("记录请求故障")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "任务 known 制作完成" })).toBeInTheDocument();
  expect(screen.queryByText("第一份灵感，从这里开始")).not.toBeInTheDocument();
});

it("revalidates another tab's identity, clears A's cards and rejects late A responses before rendering B", async () => {
  vi.stubGlobal("BroadcastChannel", undefined);
  let switched = false;
  const late = deferred<Response>(), me = deferred<Response>();
  installTaskApi(path => {
    if (path === "/api/auth/me") return switched ? me.promise : jsonResponse(owner);
    if (path === "/api/tasks/active") return jsonResponse(switched ? [] : [running("a")]);
    if (path === "/api/tasks/a") return late.promise;
    if (path.startsWith("/api/tasks?")) return jsonResponse(page(switched ? [finished("b")] : [running("a")]));
  });
  renderApp(<TasksPanel />); await settle();
  expect(screen.getByText("demo_a")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "任务 a 制作中" })).toBeInTheDocument();
  switched = true;
  act(() => window.dispatchEvent(new StorageEvent("storage", { key: identityStorageKey, newValue: "another-tab" })));
  expect(screen.queryByText("demo_a")).not.toBeInTheDocument();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await act(async () => { late.resolve(jsonResponse(finished("a"))); }); await settle();
  expect(screen.queryByRole("article")).not.toBeInTheDocument();
  await act(async () => { me.resolve(jsonResponse({ id: "owner-b", username: "demo_b" })); }); await settle();
  expect(screen.getByText("demo_b")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "任务 b 制作完成" })).toBeInTheDocument();
  expect(screen.queryByRole("article", { name: /任务 a/ })).not.toBeInTheDocument();
});

it("a successful task keeps its result while another task independently progresses through its own stages", async () => {
  let stage: "MATERIAL_CHECK" | "GENERATE" | "FINALIZE" = "MATERIAL_CHECK";
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? jsonResponse([running("a"), running("b", stage)]) : path === "/api/tasks/a" ? jsonResponse(finished("a")) : path === "/api/tasks/b" ? jsonResponse(running("b", stage)) : path.startsWith("/api/tasks?") ? jsonResponse(page([])) : undefined);
  renderApp(<><TasksPanel /><TaskProbe /></>); await settle();
  const success = screen.getByRole("article", { name: "任务 a 制作完成" }); expect(within(success).getByRole("img")).toHaveAttribute("src", expect.stringContaining("/api/tasks/a/result"));
  expect(within(screen.getByRole("article", { name: "任务 b 制作中" })).getByText("正在素材检查，可以离开此页面。")).toBeInTheDocument();
  const aCalls = fetch.mock.calls.filter(([path]) => path === "/api/tasks/a").length;
  stage = "FINALIZE"; await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(within(screen.getByRole("article", { name: "任务 b 制作中" })).getByText("正在结果整理，可以离开此页面。")).toBeInTheDocument(); expect(tracked().pending).toBe(1);
  expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument(); expect(fetch.mock.calls.filter(([path]) => path === "/api/tasks/a")).toHaveLength(aCalls);
});

it("restores an active task older than the entire recent page and reads its real detail", async () => {
  const old = { ...task("old"), createdAt: "2026-01-01T00:00:00Z" };
  const recent = Array.from({ length: 20 }, (_, i) => finished(`recent-${i}`));
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? jsonResponse([old]) : path === "/api/tasks/old" ? jsonResponse(running("old")) : path.startsWith("/api/tasks?") ? jsonResponse(page(recent, 30, 1, 20)) : undefined);
  renderApp(<><TaskProbe /></>); await settle();
  expect(tracked().tasks).toHaveLength(21); expect(tracked().pending).toBe(1);
  expect(tracked().tasks.find((item: { id: string }) => item.id === "old")).toMatchObject({ currentStage: "GENERATE", status: "RUNNING" });
  expect(fetch.mock.calls.some(([path]) => path === "/api/tasks/old")).toBe(true);
});

it("keeps following a task that disappears from active until detail supplies the final state", async () => {
  let disappeared = false, complete = false;
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? jsonResponse(disappeared ? [] : [running("a")]) : path === "/api/tasks/a" ? jsonResponse(complete ? finished("a") : running("a")) : path.startsWith("/api/tasks?") ? jsonResponse(page([])) : undefined);
  renderApp(<><TasksPanel /><TaskProbe /></>); await settle();
  disappeared = true; await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(screen.getByRole("article", { name: "任务 a 制作中" })).toBeInTheDocument(); expect(tracked().pending).toBe(1);
  complete = true; await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument(); expect(tracked().pending).toBe(0);
  const before = fetch.mock.calls.length;
  focusManager.setFocused(false); focusManager.setFocused(true); onlineManager.setOnline(false); onlineManager.setOnline(true);
  await act(async () => { await vi.advanceTimersByTimeAsync(8000); }); await settle(); expect(fetch.mock.calls).toHaveLength(before);
});

it("one backend task failure preserves its own reason while the other task continues and succeeds", async () => {
  let endB = false;
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? jsonResponse([running("b")]) : path === "/api/tasks/a" ? jsonResponse(finished("a", true)) : path === "/api/tasks/b" ? jsonResponse(endB ? finished("b") : running("b")) : path.startsWith("/api/tasks?") ? jsonResponse(page([running("a"), running("b")])) : undefined);
  renderApp(<><TasksPanel /><TaskProbe /></>); await settle();
  expect(within(screen.getByRole("article", { name: "任务 a 制作失败" })).getByText("a 的生成失败")).toBeInTheDocument();
  expect(within(screen.getByRole("article", { name: "任务 b 制作中" })).queryByText("a 的生成失败")).not.toBeInTheDocument();
  const aCalls = fetch.mock.calls.filter(([path]) => path === "/api/tasks/a").length;
  endB = true; await act(async () => { await vi.advanceTimersByTimeAsync(2300); }); await settle();
  expect(screen.getByRole("article", { name: "任务 b 制作完成" })).toBeInTheDocument(); expect(tracked().pending).toBe(0);
  expect(fetch.mock.calls.filter(([path]) => path === "/api/tasks/a")).toHaveLength(aCalls);
});

it("starts tracking a newly accepted task after the app has become completely idle", async () => {
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? jsonResponse([]) : path === "/api/tasks/accepted" ? jsonResponse(running("accepted")) : path.startsWith("/api/tasks?") ? jsonResponse(page([])) : undefined);
  renderApp(<><TaskProbe /></>); await settle(); const idleCount = fetch.mock.calls.length;
  await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); await settle(); expect(fetch.mock.calls).toHaveLength(idleCount);
  fireEvent.click(screen.getByRole("button", { name: "受理新任务" })); await settle();
  expect(tracked().pending).toBe(1); expect(tracked().tasks[0].currentStage).toBe("GENERATE");
  expect(fetch.mock.calls.some(([path]) => path === "/api/tasks/accepted")).toBe(true);
});

it("pauses failed discovery without inventing a task failure and restores it explicitly", async () => {
  let available = false;
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? available ? jsonResponse([running("a")]) : jsonResponse({ code: "UNAVAILABLE", message: "发现暂不可用" }, 503) : path === "/api/tasks/a" ? jsonResponse(finished("a")) : path.startsWith("/api/tasks?") ? jsonResponse(page([])) : undefined);
  renderApp(<><TasksPanel /><TaskProbe /></>); await settle();
  expect(screen.getByText("发现暂不可用")).toBeInTheDocument(); expect(tracked().tasks).toEqual([]);
  const calls = fetch.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); await settle(); expect(fetch.mock.calls).toHaveLength(calls);
  available = true; fireEvent.click(screen.getByRole("button", { name: "重试" })); await settle();
  expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument();
});

it("unmount cancels in-flight requests and all tracking timers; remount discovers the server again", async () => {
  const pending = deferred<Response>(); let resume = false; let signal: AbortSignal | null | undefined;
  const fetch = installTaskApi((path, options) => path === "/api/tasks/active" ? jsonResponse([running("a")]) : path === "/api/tasks/a" ? resume ? jsonResponse(finished("a")) : (signal = options?.signal, pending.promise) : path.startsWith("/api/tasks?") ? jsonResponse(page([])) : undefined);
  const view = renderApp(<><TaskProbe /></>); await settle(); expect(signal?.aborted).toBe(false);
  view.unmount(); expect(signal?.aborted).toBe(true); const count = fetch.mock.calls.length;
  await act(async () => { pending.resolve(jsonResponse(finished("a"))); await vi.advanceTimersByTimeAsync(8000); }); expect(fetch.mock.calls).toHaveLength(count);
  resume = true; renderApp(<><TaskProbe /></>); await settle(); expect(tracked().tasks[0].status).toBe("SUCCEEDED");
  expect(fetch.mock.calls.some(([, options]) => options?.method === "POST")).toBe(false);
});

it("switching users cancels old details and rejects even a transport that delivers the old response", async () => {
  const old = deferred<Response>(); let switched = false; let oldSignal: AbortSignal | null | undefined;
  installTaskApi((path, options) => {
    if (path === "/api/auth/login") { switched = true; return jsonResponse({ id: "owner-b", username: "demo_b" }); }
    if (path === "/api/auth/me") return jsonResponse(owner);
    if (path === "/api/tasks/active") return jsonResponse([running(switched ? "b" : "a")]);
    if (path === "/api/tasks/a") { oldSignal = options?.signal; return old.promise; }
    if (path === "/api/tasks/b") return jsonResponse(finished("b"));
    if (path.startsWith("/api/tasks?")) return jsonResponse(page([]));
  });
  renderApp(<><TaskProbe /></>); await settle(); expect(tracked().tasks[0].id).toBe("a");
  fireEvent.click(screen.getByRole("button", { name: "切换 B" })); await settle(); expect(oldSignal?.aborted).toBe(true);
  await act(async () => { old.resolve(jsonResponse(finished("a", true))); }); await settle();
  expect(tracked().tasks.map((item: { id: string }) => item.id)).toEqual(["b"]); expect(tracked().pending).toBe(0);
  expect(screen.queryByText("demo_a")).not.toBeInTheDocument(); expect(screen.getByText("demo_b")).toBeInTheDocument();
});

it("a detail timeout preserves that running task and permits recovery while another task completes", async () => {
  let recover = false, completeB = false;
  const fetch = installTaskApi((path, options) => {
    if (path === "/api/tasks/active") return jsonResponse([running("a"), running("b")]);
    if (path === "/api/tasks/a") return recover ? jsonResponse(finished("a")) : new Promise<Response>((_, reject) => options?.signal?.addEventListener("abort", () => reject(new DOMException("aborted", "AbortError")), { once: true }));
    if (path === "/api/tasks/b") return jsonResponse(completeB ? finished("b") : running("b"));
    if (path.startsWith("/api/tasks?")) return jsonResponse(page([]));
  });
  renderApp(<><TasksPanel /></>); await settle(); completeB = true;
  await act(async () => { await vi.advanceTimersByTimeAsync(10500); }); await settle();
  const a = screen.getByRole("article", { name: "任务 a 制作中" }); expect(within(a).getByText("暂时无法更新，已保留上次任务状态。")).toBeInTheDocument();
  expect(screen.getByRole("article", { name: "任务 b 制作完成" })).toBeInTheDocument();
  const before = fetch.mock.calls.filter(([path]) => path === "/api/tasks/a").length;
  await act(async () => { await vi.advanceTimersByTimeAsync(5000); }); await settle(); expect(fetch.mock.calls.filter(([path]) => path === "/api/tasks/a")).toHaveLength(before);
  recover = true; fireEvent.click(within(a).getByRole("button", { name: "恢复查询" })); await settle(); expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument();
});

it("session expiry clears all tracked data, cancels outstanding details, and prevents late repopulation", async () => {
  const late = deferred<Response>(); let expired = false; let detailSignal: AbortSignal | null | undefined;
  const fetch = installTaskApi((path, options) => {
    if (path === "/api/tasks/active") return expired ? jsonResponse({ code: "UNAUTHENTICATED", message: "会话失效" }, 401) : jsonResponse([running("a")]);
    if (path === "/api/tasks/a") { detailSignal = options?.signal; return late.promise; }
    if (path.startsWith("/api/tasks?")) return jsonResponse(page([]));
  });
  renderApp(<><TasksPanel /><TaskProbe /></>); await settle(); expect(tracked().pending).toBe(1);
  expired = true; await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(detailSignal?.aborted).toBe(true); expect(screen.getByText(/登录已过期/)).toBeInTheDocument(); expect(tracked()).toEqual({ pending: 0, tasks: [] });
  const before = fetch.mock.calls.length;
  await act(async () => { late.resolve(jsonResponse(finished("a"))); await vi.advanceTimersByTimeAsync(6000); }); await settle();
  expect(tracked().tasks).toEqual([]); expect(fetch.mock.calls).toHaveLength(before);
});
