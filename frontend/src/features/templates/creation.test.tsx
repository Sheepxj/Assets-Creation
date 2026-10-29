import { useState } from "react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { act, fireEvent, screen } from "@testing-library/react";
import { asset, deferred, jsonResponse, task, template } from "@/test/fixtures";
import { installTaskApi, page, settle } from "@/test/task-support";
import { renderApp } from "@/test/render-app";
import { TasksPanel } from "@/features/tasks/cards";
import { TemplateDetail } from "./detail";

vi.mock("next/navigation", () => ({ usePathname: () => "/templates/travel-postcard" }));
const originalCreate = Object.getOwnPropertyDescriptor(URL, "createObjectURL"), originalRevoke = Object.getOwnPropertyDescriptor(URL, "revokeObjectURL");
beforeEach(() => {
  vi.useFakeTimers(); let next = 0;
  Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => `blob:test-${++next}`) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
afterEach(() => {
  vi.unstubAllGlobals(); vi.useRealTimers();
  if (originalCreate) Object.defineProperty(URL, "createObjectURL", originalCreate); else Reflect.deleteProperty(URL, "createObjectURL");
  if (originalRevoke) Object.defineProperty(URL, "revokeObjectURL", originalRevoke); else Reflect.deleteProperty(URL, "revokeObjectURL");
});
function backend(upload: (body: FormData, options?: RequestInit) => Response | Promise<Response>, submit: (body: string) => Response | Promise<Response>) {
  return installTaskApi((path, options) => {
    if (path === "/api/templates/travel-postcard") return jsonResponse(template);
    if (path === "/api/assets") return upload(options?.body as FormData, options);
    if (path === "/api/tasks" && options?.method === "POST") return submit(options.body as string);
    if (path === "/api/tasks/created") return jsonResponse(task("created"));
    if (path === "/api/tasks/active") return jsonResponse([]);
    if (path.startsWith("/api/tasks?")) return jsonResponse(page([]));
  });
}
function choose(slot: number, name: string) { fireEvent.change(screen.getByLabelText(`选择第 ${slot} 张图片`), { target: { files: [new File(["image"], name, { type: "image/png" })] } }); }
async function fillBoth() { choose(1, "one.png"); choose(2, "two.png"); await settle(); }

it("gates the real form during uploads and POST, then leaves submitting and keeps the accepted task while starting another form", async () => {
  const uploading = deferred<Response>(), submitting = deferred<Response>();
  const fetch = backend(body => (body.get("file") as File).name === "one.png" ? uploading.promise : jsonResponse(asset("second"), 201), () => submitting.promise);
  renderApp(<TemplateDetail id={template.id} />); await settle(); expect(screen.getByRole("button", { name: /开始制作/ })).toBeDisabled();
  await fillBoth(); expect(screen.getByText("上传中")).toBeInTheDocument(); expect(screen.getByRole("button", { name: /开始制作/ })).toBeDisabled();
  await act(async () => { uploading.resolve(jsonResponse(asset("first"), 201)); }); await settle();
  const button = screen.getByRole("button", { name: /开始制作/ }); expect(button).toBeEnabled(); fireEvent.click(button); fireEvent.click(button); await settle();
  expect(screen.getByRole("button", { name: /正在提交/ })).toBeDisabled(); expect(screen.getByLabelText("选择第 1 张图片")).toBeDisabled();
  expect(fetch.mock.calls.filter(([path, options]) => path === "/api/tasks" && options?.method === "POST")).toHaveLength(1);
  await act(async () => { submitting.resolve(jsonResponse(task("created"), 202)); }); await settle();
  expect(screen.queryByRole("button", { name: /正在提交/ })).not.toBeInTheDocument(); expect(screen.getByRole("article", { name: "旅行明信片 等待处理" })).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "开始下一次制作" })); await settle();
  expect(screen.getByRole("button", { name: /开始制作/ })).toBeDisabled(); expect(screen.queryByText("one.png")).not.toBeInTheDocument();
  expect(screen.getByRole("article", { name: "旅行明信片 等待处理" })).toBeInTheDocument();
});

it("replacement and removal cannot submit the obsolete upload through the actual form", async () => {
  const old = deferred<Response>(); let oldSignal: AbortSignal | null | undefined;
  const fetch = backend((body, options) => {
    const name = (body.get("file") as File).name;
    if (name === "old.png") { oldSignal = options?.signal; return old.promise; }
    return jsonResponse(asset(name), 201);
  }, () => jsonResponse(task("created"), 202));
  renderApp(<TemplateDetail id={template.id} />); await settle(); choose(1, "old.png"); await settle(); choose(1, "new.png"); choose(2, "two.png"); await settle();
  expect(oldSignal?.aborted).toBe(true); await act(async () => { old.resolve(jsonResponse(asset("obsolete"), 201)); }); await settle();
  expect(screen.getByText("new.png")).toBeInTheDocument(); expect(screen.queryByText("old.png")).not.toBeInTheDocument(); expect(screen.getByRole("button", { name: /开始制作/ })).toBeEnabled();
  fireEvent.click(screen.getByRole("button", { name: "移除第 1 张图片" })); await settle();
  const submit = screen.getByRole("button", { name: /开始制作/ }); expect(submit).toBeDisabled(); fireEvent.click(submit); await settle();
  expect(fetch.mock.calls.some(([path, options]) => path === "/api/tasks" && options?.method === "POST")).toBe(false);
});

it("an unknown HTTP result preserves materials and reuses the exact request payload on explicit safe retry", async () => {
  const sent: unknown[] = [];
  backend(body => jsonResponse(asset((body.get("file") as File).name), 201), body => {
    sent.push(JSON.parse(body)); return sent.length === 1 ? Promise.reject(new TypeError("offline")) : jsonResponse(task("created"), 202);
  });
  renderApp(<TemplateDetail id={template.id} />); await settle(); await fillBoth(); fireEvent.click(screen.getByRole("button", { name: /开始制作/ })); await settle();
  expect(screen.getByText("提交结果尚未确认")).toBeInTheDocument(); expect(screen.getByText("one.png")).toBeInTheDocument(); expect(screen.getByText("two.png")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: /安全重试本次提交/ })); await settle();
  expect(sent).toHaveLength(2); expect(sent[0]).toEqual(sent[1]); expect(screen.getByRole("button", { name: "开始下一次制作" })).toBeInTheDocument();
});

function NavigableCreator() { const [detail, showDetail] = useState(true); return <><button onClick={() => showDetail(false)}>离开详情</button>{detail ? <TemplateDetail id={template.id} /> : <TasksPanel />}</>; }
it("an acknowledgement arriving after the detail unmounts is still registered in the shared layout", async () => {
  const accepted = deferred<Response>(); backend(body => jsonResponse(asset((body.get("file") as File).name), 201), () => accepted.promise);
  renderApp(<NavigableCreator />); await settle(); await fillBoth(); fireEvent.click(screen.getByRole("button", { name: /开始制作/ })); await settle();
  fireEvent.click(screen.getByRole("button", { name: "离开详情" })); await settle(); expect(screen.queryByLabelText("选择第 1 张图片")).not.toBeInTheDocument();
  await act(async () => { accepted.resolve(jsonResponse(task("created"), 202)); }); await settle();
  expect(screen.getByRole("article", { name: "旅行明信片 等待处理" })).toBeInTheDocument(); expect(screen.getByLabelText("1 个未完成任务")).toBeInTheDocument();
});
