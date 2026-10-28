import { act } from "@testing-library/react";
import { vi } from "vitest";
import { useApp } from "@/components/providers";
import { useTasks } from "@/features/tasks/provider";
import { jsonResponse, task } from "./fixtures";
import type { TaskDto, TaskStage } from "@/lib/api/contracts";

export const owner = { id: "owner-a", username: "demo_a" };
export function running(id: string, stage: TaskStage = "GENERATE"): TaskDto {
  const value = task(id), index = value.steps.findIndex(step => step.stage === stage);
  return { ...value, templateTitle: `任务 ${id}`, status: "RUNNING", currentStage: stage, startedAt: value.createdAt,
    steps: value.steps.map((step, i) => ({ ...step, status: i < index ? "SUCCEEDED" : i === index ? "RUNNING" : "PENDING" })) };
}
export function finished(id: string, failed = false): TaskDto {
  const value = running(id, failed ? "GENERATE" : "FINALIZE");
  return { ...value, status: failed ? "FAILED" : "SUCCEEDED", finishedAt: "2026-10-28T12:01:00Z",
    resultUrl: failed ? null : `/api/tasks/${id}/result`, errorCode: failed ? "SIMULATED_FAILURE" : null, errorMessage: failed ? `${id} 的生成失败` : null,
    steps: value.steps.map((step, i) => ({ ...step, status: failed ? i === 0 ? "SUCCEEDED" : i === 1 ? "FAILED" : "PENDING" : "SUCCEEDED" })) };
}
export const page = (items: TaskDto[], total = items.length, number = 1, pageSize = 12) => ({ items, total, page: number, pageSize });
export async function settle() { for (let i = 0; i < 12; i++) await act(async () => { await vi.advanceTimersByTimeAsync(10); }); }
export function installTaskApi(handler: (path: string, options?: RequestInit) => Response | Promise<Response> | undefined) {
  const fetch = vi.fn((path: string, options?: RequestInit) => {
    const result = handler(path, options);
    if (result) return Promise.resolve(result);
    if (path === "/api/auth/me") return Promise.resolve(jsonResponse(owner));
    if (path === "/api/auth/csrf") return Promise.resolve(jsonResponse({ token: "csrf", headerName: "X-CSRF-TOKEN", parameterName: "_csrf" }));
    throw new Error(`Unexpected test request: ${path}`);
  });
  vi.stubGlobal("fetch", fetch); return fetch;
}
export function TaskProbe() {
  const tasks = useTasks(), app = useApp();
  return <><output aria-label="跟踪快照">{JSON.stringify({ pending: tasks.pending, tasks: tasks.tasks })}</output>
    <button onClick={() => tasks.accept(task("accepted"), app.api.scope)}>受理新任务</button>
    <button onClick={() => void app.session.authenticate("login", { username: "demo_b", password: "Password123!" })}>切换 B</button>
  </>;
}
