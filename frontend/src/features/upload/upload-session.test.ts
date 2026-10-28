import { beforeEach, describe, expect, it, vi } from "vitest";
import { ApiClient, ApiFailure } from "@/lib/api/client";
import { asset, deferred, template } from "@/test/fixtures";
import type { AssetDto } from "@/lib/api/contracts";
import { UploadSession } from "./upload-session";

const file = (name = "photo.png") => new File(["png-data"], name, { type: "image/png" });
beforeEach(() => {
  let id = 0; Object.defineProperty(URL, "createObjectURL", { configurable: true, value: vi.fn(() => "blob:" + ++id) });
  Object.defineProperty(URL, "revokeObjectURL", { configurable: true, value: vi.fn() });
});
describe("independent upload slots", () => {
  it("replacement aborts the previous selection and cannot accept its late result", async () => {
    const api = new ApiClient(), first = deferred<AssetDto>(), second = deferred<AssetDto>();
    const request = vi.spyOn(api, "request").mockReturnValueOnce(first.promise).mockReturnValueOnce(second.promise);
    const changed = vi.fn(), uploads = new UploadSession(api, template, changed);
    const one = uploads.choose(0, file("one.png")); const firstSignal = request.mock.calls[0][1]!.signal!;
    const two = uploads.choose(0, file("two.png")); expect(firstSignal.aborted).toBe(true);
    first.resolve(asset("old")); await one; expect(uploads.getSnapshot()[0].asset).toBeNull();
    second.resolve(asset("new")); await two; expect(uploads.getSnapshot()[0].asset?.id).toBe("new");
    expect(uploads.getSnapshot()[1].status).toBe("empty"); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:1"); expect(URL.revokeObjectURL).toHaveBeenCalledWith("blob:2");
  });
  it("removal clears the server ID immediately and discards a late response", async () => {
    const api = new ApiClient(), pending = deferred<AssetDto>(); vi.spyOn(api, "request").mockReturnValue(pending.promise);
    const uploads = new UploadSession(api, template, vi.fn()); const uploading = uploads.choose(0, file()); uploads.remove(0);
    pending.resolve(asset("old")); await uploading; expect(uploads.getSnapshot()[0]).toMatchObject({ status: "empty", asset: null, file: null });
    expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
  it("invalid replacement cannot retain the previously valid asset ID", async () => {
    const api = new ApiClient(); const request = vi.spyOn(api, "request").mockResolvedValue(asset("valid")); const uploads = new UploadSession(api, template, vi.fn());
    await uploads.choose(0, file()); await uploads.choose(0, new File(["svg"], "bad.svg", { type: "image/svg+xml" }));
    expect(uploads.getSnapshot()[0]).toMatchObject({ status: "error", asset: null, canRetry: false }); expect(request).toHaveBeenCalledOnce();
  });
  it("enforces empty and exact-size bounds before making requests", async () => {
    const api = new ApiClient(); const request = vi.spyOn(api, "request").mockResolvedValue(asset("boundary")); const uploads = new UploadSession(api, template, vi.fn());
    await uploads.choose(0, new File([], "empty.png", { type: "image/png" })); expect(request).not.toHaveBeenCalled();
    await uploads.choose(0, new File([new Uint8Array(5242881)], "large.png", { type: "image/png" })); expect(request).not.toHaveBeenCalled();
    await uploads.choose(0, new File([new Uint8Array(5242880)], "boundary.png", { type: "image/png" })); expect(uploads.getSnapshot()[0].status).toBe("ready");
  });
  it("failed uploads have no asset ID, can retry, and release their temporary preview", async () => {
    const api = new ApiClient(); const request = vi.spyOn(api, "request").mockRejectedValueOnce(new ApiFailure(503, "STORAGE_UNAVAILABLE", "存储暂不可用")).mockResolvedValueOnce(asset("retry"));
    const uploads = new UploadSession(api, template, vi.fn()); await uploads.choose(0, file()); expect(uploads.getSnapshot()[0]).toMatchObject({ status: "error", asset: null, canRetry: true });
    await uploads.choose(0, uploads.getSnapshot()[0].file!); expect(uploads.getSnapshot()[0].asset?.id).toBe("retry"); expect(request).toHaveBeenCalledTimes(2);
    uploads.clear(); expect(uploads.getSnapshot().every(slot => slot.status === "empty")).toBe(true); expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });
  it("identity changes and unmount prevent an old upload from filling another form", async () => {
    const api = new ApiClient(), pending = deferred<AssetDto>(); vi.spyOn(api, "request").mockReturnValue(pending.promise);
    const uploads = new UploadSession(api, template, vi.fn()); const uploading = uploads.choose(0, file()); api.resetScope(); uploads.dispose();
    pending.resolve(asset("old-owner")); await uploading; expect(uploads.getSnapshot()[0].asset).toBeNull(); expect(URL.revokeObjectURL).toHaveBeenCalledOnce();
  });
});
