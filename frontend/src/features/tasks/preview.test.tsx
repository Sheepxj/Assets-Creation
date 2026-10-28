import { afterEach, beforeEach, expect, it } from "vitest";
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { finished, running } from "@/test/task-support";
import type { TaskStage } from "@/lib/api/contracts";
import { TaskCard } from "./cards";

const showModal = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "showModal");
const close = Object.getOwnPropertyDescriptor(HTMLDialogElement.prototype, "close");
beforeEach(() => {
  Object.defineProperty(HTMLDialogElement.prototype, "showModal", { configurable: true, value(this: HTMLDialogElement) { this.setAttribute("open", ""); } });
  Object.defineProperty(HTMLDialogElement.prototype, "close", { configurable: true, value(this: HTMLDialogElement) { this.removeAttribute("open"); } });
});
afterEach(() => {
  cleanup();
  if (showModal) Object.defineProperty(HTMLDialogElement.prototype, "showModal", showModal); else Reflect.deleteProperty(HTMLDialogElement.prototype, "showModal");
  if (close) Object.defineProperty(HTMLDialogElement.prototype, "close", close); else Reflect.deleteProperty(HTMLDialogElement.prototype, "close");
});

it.each<[TaskStage, string]>([["MATERIAL_CHECK", "素材检查"], ["GENERATE", "模拟生成"], ["FINALIZE", "结果整理"]])("shows the persisted %s phase with exactly one executing step", (stage, label) => {
  render(<TaskCard task={running("a", stage)} />);
  expect(screen.getByText(`正在${label}，可以离开此页面。`)).toBeInTheDocument(); expect(screen.getAllByText("处理中")).toHaveLength(1);
  expect(screen.queryByRole("button", { name: "预览任务 a制作结果" })).not.toBeInTheDocument();
});

it("previews the protected result, reports image failure without changing task success, and restores focus on cancel", () => {
  render(<TaskCard task={finished("a")} />);
  const open = screen.getByRole("button", { name: "预览任务 a制作结果" }); open.focus(); fireEvent.click(open);
  const dialog = screen.getByRole("dialog", { name: "任务 a · 制作结果" });
  const image = within(dialog).getByRole("img", { name: "任务 a制作结果" }); expect(new URL(image.getAttribute("src")!, window.location.origin).pathname).toBe("/api/tasks/a/result");
  fireEvent.error(image); expect(within(dialog).getByRole("alert")).toHaveTextContent("制作状态保持成功");
  expect(screen.getByRole("article", { name: "任务 a 制作完成" })).toBeInTheDocument(); expect(screen.queryByText("制作失败")).not.toBeInTheDocument();
  fireEvent(dialog, new Event("cancel", { bubbles: true, cancelable: true })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(open).toHaveFocus();
  fireEvent.click(open); expect(within(screen.getByRole("dialog")).getByRole("img")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "关闭预览" })); expect(screen.queryByRole("dialog")).not.toBeInTheDocument(); expect(open).toHaveFocus();
});
