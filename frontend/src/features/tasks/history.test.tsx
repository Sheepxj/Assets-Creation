import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { useEffect } from "react";
import { act, fireEvent, render, screen, within } from "@testing-library/react";
import { useQueryClient, type QueryClient } from "@tanstack/react-query";
import { Providers } from "@/components/providers";
import { jsonResponse } from "@/test/fixtures";
import { finished, installTaskApi, page, running, settle, TaskProbe } from "@/test/task-support";
import { History } from "./history";

vi.mock("next/navigation", () => ({ usePathname: () => "/tasks" }));
beforeEach(() => vi.useFakeTimers());
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers(); });
let queryClient: QueryClient;
function CaptureQueries() { const client = useQueryClient(); useEffect(() => { queryClient = client; }, [client]); return null; }

it("paginates Java history without stopping tracking of a task on another page", async () => {
  const records = [...Array.from({ length: 25 }, (_, i) => finished(`past-${i}`)), running("old")];
  let done = false;
  const fetch = installTaskApi(path => {
    if (path === "/api/tasks/active") return jsonResponse(done ? [] : [running("old")]);
    if (path === "/api/tasks/old") return jsonResponse(done ? finished("old") : running("old"));
    if (path.startsWith("/api/tasks?")) {
      const url = new URL(path, "http://test"), number = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("pageSize"));
      return jsonResponse(page(records.slice((number - 1) * size, number * size), records.length, number, size));
    }
  });
  render(<Providers><History /></Providers>); await settle();
  expect(screen.getByText("第 1 页 · 共 26 条")).toBeInTheDocument(); expect(screen.queryByRole("article", { name: "任务 old 制作中" })).not.toBeInTheDocument();
  const count = fetch.mock.calls.filter(([path]) => path === "/api/tasks/old").length;
  fireEvent.click(screen.getByRole("button", { name: "下一页" })); await settle();
  await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(fetch.mock.calls.filter(([path]) => path === "/api/tasks/old").length).toBeGreaterThan(count);
  fireEvent.click(screen.getByRole("button", { name: "下一页" })); await settle();
  expect(screen.getByText("第 3 页 · 共 26 条")).toBeInTheDocument(); expect(screen.getByRole("article", { name: "任务 old 制作中" })).toBeInTheDocument();
  done = true; await act(async () => { await vi.advanceTimersByTimeAsync(2200); }); await settle();
  expect(screen.getByRole("article", { name: "任务 old 制作完成" })).toBeInTheDocument();
  expect(screen.queryByLabelText("1 个未完成任务")).not.toBeInTheDocument();
});

it("a terminal discovered in recent records refreshes the selected history filter even when its detail query was paused", async () => {
  let completed = false;
  const fetch = installTaskApi(path => {
    if (path === "/api/tasks/active") return jsonResponse(completed ? [] : [running("a")]);
    if (path === "/api/tasks/a") return jsonResponse({ code: "UNAVAILABLE", message: "详情暂停" }, 503);
    if (path === "/api/tasks?page=1&pageSize=20") return jsonResponse(page([completed ? finished("a") : running("a")], 1, 1, 20));
    if (path.startsWith("/api/tasks?")) return jsonResponse(page(path.includes("status=SUCCEEDED") ? completed ? [finished("a")] : [] : [running("a")]));
  });
  render(<Providers><CaptureQueries /><History /></Providers>); await settle();
  fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "SUCCEEDED" } }); await settle(); expect(screen.getByText("这里还没有作品")).toBeInTheDocument();
  const detailCalls = fetch.mock.calls.filter(([path]) => path === "/api/tasks/a").length;
  completed = true;
  await act(async () => { await queryClient.refetchQueries({ queryKey: ["tasks", "owner-a", "recent"], exact: true }); }); await settle();
  expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument();
  expect(fetch.mock.calls.filter(([path]) => path === "/api/tasks/a")).toHaveLength(detailCalls);
  expect(queryClient.getQueryData(["tasks", "owner-a", "detail", "a"])).toMatchObject({ status: "SUCCEEDED" });
  expect(queryClient.getQueryState(["tasks", "owner-a", "history", 1, ""])?.isInvalidated).toBe(true);
});

it("keeps existing history on a failed refresh and recovers only through explicit retry", async () => {
  let unavailable = false;
  const fetch = installTaskApi(path => path === "/api/tasks/active" ? jsonResponse([]) : path === "/api/tasks?page=1&pageSize=20" ? jsonResponse(page([finished("a")])) : path.startsWith("/api/tasks?") ? unavailable ? jsonResponse({ code: "UNAVAILABLE", message: "历史暂不可用" }, 503) : jsonResponse(page([finished("a")])) : undefined);
  render(<Providers><History /></Providers>); await settle();
  unavailable = true; fireEvent.click(screen.getByRole("button", { name: "刷新记录" })); await settle();
  expect(screen.getByText("记录暂时无法更新，已保留上次数据")).toBeInTheDocument(); expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument();
  const before = fetch.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(6000); }); await settle(); expect(fetch.mock.calls).toHaveLength(before);
  unavailable = false; fireEvent.click(screen.getByRole("button", { name: "重试" })); await settle();
  expect(screen.queryByText("记录暂时无法更新，已保留上次数据")).not.toBeInTheDocument(); expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument();
});

it("returns to an existing page when completion shrinks the filtered collection", async () => {
  const active = Array.from({ length: 13 }, (_, i) => running(`job-${i}`)); let completed = false;
  installTaskApi(path => {
    if (path === "/api/tasks/active") return jsonResponse(active.slice(0, completed ? 12 : 13));
    if (/^\/api\/tasks\/job-/.test(path)) return jsonResponse(running(path.split("/").at(-1)!));
    if (path.startsWith("/api/tasks?")) {
      const url = new URL(path, "http://test"), number = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("pageSize"));
      const values = active.slice(0, completed ? 12 : 13);
      return jsonResponse(page(values.slice((number - 1) * size, number * size), values.length, number, size));
    }
  });
  render(<Providers><History /></Providers>); await settle();
  fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "RUNNING" } }); await settle();
  fireEvent.click(screen.getByRole("button", { name: "下一页" })); await settle(); expect(screen.getByText("第 2 页 · 共 13 条")).toBeInTheDocument();
  completed = true; fireEvent.click(screen.getByRole("button", { name: "刷新记录" })); await settle();
  expect(screen.getByText("第 1 页 · 共 12 条")).toBeInTheDocument(); expect(screen.getByRole("button", { name: "上一页" })).toBeDisabled();
  expect(screen.getAllByRole("article")).toHaveLength(12);
});

it("clears old owner cache and resets page and status when switching users", async () => {
  let switched = false;
  installTaskApi(path => {
    if (path === "/api/auth/login") { switched = true; return jsonResponse({ id: "owner-b", username: "demo_b" }); }
    if (path === "/api/tasks/active") return jsonResponse([]);
    if (path.startsWith("/api/tasks?")) {
      const url = new URL(path, "http://test"), number = Number(url.searchParams.get("page")), size = Number(url.searchParams.get("pageSize"));
      return jsonResponse(page(switched ? [] : Array.from({ length: 12 }, (_, i) => finished(`a-${number}-${i}`)), switched ? 0 : 24, number, size));
    }
  });
  render(<Providers><CaptureQueries /><History /><TaskProbe /></Providers>); await settle();
  fireEvent.change(screen.getByLabelText("任务状态"), { target: { value: "SUCCEEDED" } }); await settle();
  fireEvent.click(screen.getByRole("button", { name: "下一页" })); await settle();
  expect(screen.getByText("第 2 页 · 共 24 条")).toBeInTheDocument();
  expect(screen.getByLabelText("任务状态")).toHaveValue("SUCCEEDED");
  fireEvent.click(screen.getByRole("button", { name: "切换 B" })); await settle();
  expect(screen.getByLabelText("任务状态")).toHaveValue(""); expect(screen.getByText("这里还没有作品")).toBeInTheDocument();
  expect(screen.queryAllByRole("article")).toHaveLength(0);
  const oldQueries = queryClient.getQueryCache().getAll().filter(query => query.queryKey.includes("owner-a"));
  expect(oldQueries.every(query => query.state.data === undefined && query.state.fetchStatus === "idle" && query.getObserversCount() === 0)).toBe(true);
  expect(queryClient.getQueryCache().getAll().some(query => query.queryKey.includes("owner-b"))).toBe(true);
  expect(within(screen.getByRole("main")).queryByText("任务 a-1-0")).not.toBeInTheDocument();
});
