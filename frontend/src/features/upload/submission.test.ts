import { describe, expect, it, vi } from "vitest";
import { ApiClient, ApiFailure } from "@/lib/api/client";
import { asset, deferred, task, template } from "@/test/fixtures";
import type { TaskDto } from "@/lib/api/contracts";
import type { UploadSlot } from "./upload-session";
import { Submission } from "./submission";

const ready = (id: string): UploadSlot => ({ status: "ready", asset: asset(id), file: null, localUrl: null, error: null, canRetry: false });
describe("submission intent", () => {
  it("does not submit unfinished material and ignores rapid repeated clicks", async () => {
    const api = new ApiClient(), pending = deferred<TaskDto>(); const request = vi.spyOn(api, "request").mockReturnValue(pending.promise); const accepted = vi.fn();
    const submission = new Submission(api, template.id, accepted, vi.fn());
    await submission.submit([{ ...ready("one"), status: "uploading" }]); expect(request).not.toHaveBeenCalled();
    const first = submission.submit([ready("one"), ready("two")]); await submission.submit([ready("one"), ready("two")]); expect(request).toHaveBeenCalledOnce();
    pending.resolve(task()); await first; expect(submission.getSnapshot().status).toBe("accepted"); expect(accepted).toHaveBeenCalledOnce();
    await submission.submit([ready("one"), ready("two")]); expect(request).toHaveBeenCalledOnce();
  });
  it.each([0, 502, 504])("preserves the same requestId and material after an uncertain %s response", async status => {
    const api = new ApiClient(); const request = vi.spyOn(api, "request").mockRejectedValueOnce(new ApiFailure(status, "UNCERTAIN", "响应未知")).mockResolvedValueOnce(task());
    const uncertain = vi.fn(); const submission = new Submission(api, template.id, vi.fn(), uncertain); const slots = [ready("one"), ready("two")];
    await submission.submit(slots); const original = submission.getSnapshot().requestId; expect(submission.getSnapshot().status).toBe("unknown"); expect(uncertain).toHaveBeenCalledOnce();
    await submission.submit(slots); expect(submission.getSnapshot().status).toBe("accepted");
    expect(request.mock.calls[0][1]?.body).toEqual(request.mock.calls[1][1]?.body); expect(submission.getSnapshot().requestId).toBe(original);
  });
  it("changing materials creates a new key and prevents a stale acceptance from replacing the form", async () => {
    const api = new ApiClient(), old = deferred<TaskDto>(); const request = vi.spyOn(api, "request").mockReturnValueOnce(old.promise).mockResolvedValueOnce(task("new"));
    const accepted = vi.fn(), submission = new Submission(api, template.id, accepted, vi.fn()); const first = submission.submit([ready("one")]);
    const key = submission.getSnapshot().requestId; submission.changed(); await submission.submit([ready("two")]);
    expect(submission.getSnapshot().requestId).not.toBe(key); old.resolve(task("old")); await first; expect(submission.getSnapshot().task?.id).toBe("new"); expect(accepted).toHaveBeenCalledOnce();
    expect(request.mock.calls[0][1]?.signal?.aborted).toBe(true);
  });
  it("navigation still forwards the acknowledgement to shared tracking, while identity changes discard it", async () => {
    const api = new ApiClient(), pending = deferred<TaskDto>(); vi.spyOn(api, "request").mockReturnValue(pending.promise); const accepted = vi.fn();
    const submission = new Submission(api, template.id, accepted, vi.fn()); const sending = submission.submit([ready("one")]); submission.dispose(); pending.resolve(task()); await sending;
    expect(accepted).toHaveBeenCalledOnce();
    const late = deferred<TaskDto>(); vi.mocked(api.request).mockReturnValue(late.promise); const next = new Submission(api, template.id, accepted, vi.fn());
    const second = next.submit([ready("two")]); api.resetScope(); late.resolve(task("other")); await second; expect(accepted).toHaveBeenCalledOnce();
  });
  it("invalid accepted response is unknown and confirmed 400 failure is a form error", async () => {
    const api = new ApiClient(); vi.spyOn(api, "request").mockResolvedValueOnce({}).mockRejectedValueOnce(new ApiFailure(400, "INVALID_ASSETS", "素材不足"));
    const submission = new Submission(api, template.id, vi.fn(), vi.fn()); await submission.submit([ready("one")]); expect(submission.getSnapshot().status).toBe("unknown");
    await submission.submit([ready("one")]); expect(submission.getSnapshot()).toMatchObject({ status: "error", error: { code: "INVALID_ASSETS" } });
  });
});
