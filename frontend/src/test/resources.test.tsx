import { afterEach, expect, it, vi } from "vitest";
import { act, render } from "@testing-library/react";
import { QueryClient, QueryClientProvider, useQuery } from "@tanstack/react-query";
import { clearTestQueries, trackQueries } from "./query-clients";

afterEach(() => vi.useRealTimers());
it("the test teardown removes subscriptions, aborts transport and clears cache GC timers without hiding a polling leak", async () => {
  vi.useFakeTimers(); let signal: AbortSignal | undefined;
  const request = vi.fn((value: AbortSignal) => { signal = value; return new Promise<never>((_, reject) => value.addEventListener("abort", () => reject(new DOMException("cancelled", "AbortError")), { once: true })); });
  const client = trackQueries(new QueryClient({ defaultOptions: { queries: { retry: false } } }));
  function Watching() { useQuery({ queryKey: ["resource-audit"], queryFn: ({ signal }) => request(signal), refetchInterval: 2000 }); return null; }
  const view = render(<QueryClientProvider client={client}><Watching /></QueryClientProvider>);
  await act(async () => { await vi.advanceTimersByTimeAsync(0); }); expect(signal?.aborted).toBe(false);
  view.unmount(); await act(async () => { await vi.advanceTimersByTimeAsync(0); }); expect(signal?.aborted).toBe(true);
  clearTestQueries(); await act(async () => { await vi.advanceTimersByTimeAsync(0); });
  expect(client.getQueryCache().getAll()).toHaveLength(0); expect(vi.getTimerCount()).toBe(0);
  const calls = request.mock.calls.length; await act(async () => { await vi.advanceTimersByTimeAsync(10000); });
  expect(request).toHaveBeenCalledTimes(calls); expect(vi.getTimerCount()).toBe(0);
});
