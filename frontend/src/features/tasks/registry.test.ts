import { describe, expect, it } from "vitest";
import { task } from "@/test/fixtures";
import { TaskRegistry } from "./registry";
describe("owner-scoped task records", () => {
  it("orders UTC timestamps by time across absent, variable and sub-millisecond fractions", () => {
    const registry = new TaskRegistry();
    for (const [id, time] of [
      ["whole", "2026-10-29T04:00:00Z"],
      ["half", "2026-10-29T04:00:00.500Z"],
      ["micro", "2026-10-29T04:00:00.500001Z"],
      ["nano", "2026-10-29T04:00:00.500001001Z"],
      ["next", "2026-10-29T04:00:01Z"],
    ]) registry.record({ ...task(id), createdAt: time });
    expect(registry.getSnapshot().map(item => item.id)).toEqual(["next", "nano", "micro", "half", "whole"]);
  });
  it("uses descending IDs only when timestamps represent the same instant", () => {
    const registry = new TaskRegistry();
    registry.record({ ...task("a"), createdAt: "2026-10-29T04:00:00Z" });
    registry.record({ ...task("b"), createdAt: "2026-10-29T04:00:00.000000Z" });
    expect(registry.getSnapshot().map(item => item.id)).toEqual(["b", "a"]);
  });
  it("keeps multiple jobs independent", () => {
    const registry = new TaskRegistry(); registry.record(task("a")); registry.record(task("b"));
    registry.record({ ...task("a"), status: "FAILED", currentStage: "GENERATE", errorMessage: "模拟失败" });
    expect(registry.getSnapshot().find(item => item.id === "a")?.status).toBe("FAILED");
    expect(registry.getSnapshot().find(item => item.id === "b")?.status).toBe("QUEUED");
  });
  it("never replaces a known terminal state with a stale running response", () => {
    const registry = new TaskRegistry(); registry.record({ ...task("a"), status: "SUCCEEDED", resultUrl: "/api/tasks/a/result" });
    registry.record({ ...task("a"), status: "RUNNING" }); expect(registry.getSnapshot()[0].status).toBe("SUCCEEDED");
  });
  it("clears every private record at an identity boundary", () => { const registry = new TaskRegistry(); registry.record(task()); registry.clear(); expect(registry.getSnapshot()).toEqual([]); });
  it("does not regress an observed phase when an older discovery response arrives", () => {
    const registry = new TaskRegistry();
    registry.record({ ...task("a"), status: "RUNNING", currentStage: "GENERATE" });
    registry.record(task("a")); registry.record({ ...task("a"), status: "RUNNING", currentStage: "MATERIAL_CHECK" });
    expect(registry.getSnapshot()[0]).toMatchObject({ status: "RUNNING", currentStage: "GENERATE" });
    registry.record({ ...task("a"), status: "RUNNING", currentStage: "FINALIZE" });
    expect(registry.getSnapshot()[0].currentStage).toBe("FINALIZE");
  });
});
