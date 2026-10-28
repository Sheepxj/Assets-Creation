import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { task } from "@/test/fixtures";
import { TaskCard } from "./cards";

describe("task feedback", () => {
  it("keeps request errors separate from the server's running state", () => {
    const retry = vi.fn(); render(<TaskCard task={{ ...task(), status: "RUNNING", currentStage: "GENERATE" }} error={new Error("offline")} retry={retry} />);
    expect(screen.getByText("制作中")).toBeInTheDocument(); expect(screen.getByText("暂时无法更新，已保留上次任务状态。")).toBeInTheDocument();
    expect(screen.queryByText("制作失败")).not.toBeInTheDocument(); fireEvent.click(screen.getByRole("button", { name: "恢复查询" })); expect(retry).toHaveBeenCalledOnce();
  });
  it("explains pending later steps as not executed after a backend failure", () => {
    const failed = task(); failed.status = "FAILED"; failed.errorMessage = "模拟生成失败";
    failed.steps[0].status = "SUCCEEDED"; failed.steps[1].status = "FAILED";
    render(<TaskCard task={failed} />); expect(screen.getByText("未执行")).toBeInTheDocument(); expect(screen.getByText("模拟生成失败")).toBeInTheDocument();
  });
});
