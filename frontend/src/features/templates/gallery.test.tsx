import { beforeEach, describe, expect, it, vi } from "vitest";
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ApiClient, ApiFailure } from "@/lib/api/client";
import { deferred, template } from "@/test/fixtures";
import type { TemplateDto } from "@/lib/api/contracts";
import { Gallery } from "./gallery";
import { TemplateDetail } from "./detail";

let api: ApiClient;
vi.mock("@/components/providers", () => ({ useApp: () => ({ api, auth: { status: "ready", user: null } }) }));
beforeEach(() => { api = new ApiClient(); });
function show(child: React.ReactNode) { return render(<QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>{child}</QueryClientProvider>); }
describe("template screens", () => {
  it("does not display a previous category's late response", async () => {
    const travel = deferred<TemplateDto[]>(), portrait = deferred<TemplateDto[]>();
    const request = vi.spyOn(api, "request").mockImplementation(path => {
      if (path.endsWith("/categories")) return Promise.resolve([{ id: "travel", title: "旅行风景" }, { id: "portrait", title: "人像写真" }]);
      if (path.endsWith("=travel")) return travel.promise;
      if (path.endsWith("=portrait")) return portrait.promise;
      return Promise.resolve([template]);
    });
    show(<Gallery />); await screen.findByRole("heading", { name: "旅行明信片" });
    fireEvent.click(screen.getByRole("button", { name: "旅行风景" }));
    fireEvent.click(screen.getByRole("button", { name: "人像写真" }));
    await act(async () => portrait.resolve([{ ...template, id: "studio-portrait", title: "光影肖像" }]));
    await screen.findByRole("heading", { name: "光影肖像" });
    await act(async () => travel.resolve([{ ...template, title: "迟到的旅行" }]));
    expect(screen.queryByText("迟到的旅行")).not.toBeInTheDocument();
    expect(request.mock.calls.find(([path]) => path.endsWith("=travel"))![1]!.signal!.aborted).toBe(true);
  });
  it("offers a retry after request failure and distinguishes a successful empty list", async () => {
    let failed = true;
    vi.spyOn(api, "request").mockImplementation(path => path.endsWith("/categories") ? Promise.resolve([]) : failed ? Promise.reject(new ApiFailure(503, "UNAVAILABLE", "模板服务暂不可用")) : Promise.resolve([]));
    show(<Gallery />); await screen.findByText("模板服务暂不可用"); failed = false;
    fireEvent.click(screen.getByRole("button", { name: "重试" })); await screen.findByText("这个分类暂时没有模板");
  });
  it("a missing detail never renders a submit action or invented template requirements", async () => {
    vi.spyOn(api, "request").mockRejectedValue(new ApiFailure(404, "TEMPLATE_NOT_FOUND", "模板不存在或已不可用"));
    show(<TemplateDetail id="missing" />); await screen.findByText("模板不存在或已不可用");
    await waitFor(() => expect(screen.queryByRole("button", { name: "开始制作" })).not.toBeInTheDocument());
  });
});
