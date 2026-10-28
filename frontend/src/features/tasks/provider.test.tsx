import { afterEach, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { Providers } from "@/components/providers";
import { TasksPanel } from "./cards";
import { jsonResponse, task } from "@/test/fixtures";
import type { TaskDto } from "@/lib/api/contracts";

vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
const done = (value: TaskDto): TaskDto => ({ ...value, status: "SUCCEEDED", currentStage: "FINALIZE", resultUrl: `/api/tasks/${value.id}/result`, finishedAt: "2026-10-28T12:01:00Z", steps: value.steps.map(step => ({ ...step, status: "SUCCEEDED" })) });
async function settle() { for (let i = 0; i < 12; i++) await act(async () => { await vi.advanceTimersByTimeAsync(10); }); }

it("tracks jobs independently, pauses only a failed query, and stops timers at terminal states", async () => {
  vi.useFakeTimers();
  const a = { ...task("a"), templateTitle: "任务 A" }, b = { ...task("b"), templateTitle: "任务 B" };
  let aRecovered = false, bFinished = false;
  const fetch = vi.fn((path: string) => {
    if (path === "/api/auth/me") return Promise.resolve(jsonResponse({ id: "owner", username: "demo_a" }));
    if (path === "/api/auth/csrf") return Promise.resolve(jsonResponse({ token: "t", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" }));
    if (path === "/api/tasks/active") return Promise.resolve(jsonResponse([a, b]));
    if (path === "/api/tasks/a") return Promise.resolve(aRecovered ? jsonResponse(done(a)) : jsonResponse({ code: "UPSTREAM_UNAVAILABLE", message: "查询暂不可用", fieldErrors: {} }, 503));
    if (path === "/api/tasks/b") return Promise.resolve(jsonResponse(bFinished ? done(b) : b));
    return Promise.resolve(jsonResponse({ items: [a, b], total: 2, page: 1, pageSize: 20 }));
  });
  vi.stubGlobal("fetch", fetch);
  render(<Providers><TasksPanel /></Providers>); await settle();
  const cardA = screen.getByRole("article", { name: "任务 A 等待处理" });
  expect(within(cardA).getByText("暂时无法更新，已保留上次任务状态。")).toBeInTheDocument();
  const aCalls = () => fetch.mock.calls.filter(([path]) => path === "/api/tasks/a").length;
  expect(aCalls()).toBe(1);
  bFinished = true; await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(screen.getByRole("article", { name: "任务 B 制作完成" })).toBeInTheDocument(); expect(aCalls()).toBe(1);
  aRecovered = true; fireEvent.click(within(cardA).getByRole("button", { name: "恢复查询" })); await settle();
  expect(screen.getByRole("article", { name: "任务 A 制作完成" })).toBeInTheDocument();
  const trackedCalls = () => fetch.mock.calls.filter(([path]) => path === "/api/tasks/active" || /^\/api\/tasks\/[ab]$/.test(path)).length;
  const finalCount = trackedCalls(); await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); await settle();
  expect(trackedCalls()).toBe(finalCount);
});
