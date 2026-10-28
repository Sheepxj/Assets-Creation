import type { ApiError, CsrfDto } from "./contracts";

export class ApiFailure extends Error {
  constructor(public status: number, public code: string, message: string, public fieldErrors: Record<string, string> = {}) {
    super(message); this.name = "ApiFailure";
  }
}
export const isAborted = (error: unknown) => error instanceof Error && error.name === "AbortError";
export const failureMessage = (error: unknown) => error instanceof ApiFailure ? error.message : "操作未完成，请稍后重试";
export const resultUnknown = (error: unknown) => error instanceof ApiFailure && (error.status === 0 || error.status >= 500 || error.code === "INVALID_RESPONSE");

interface RequestOptions { method?: "GET" | "POST"; body?: unknown; signal?: AbortSignal; timeoutMs?: number }

/** One instance per mounted application. Epoch checks also reject transports that ignore abort. */
export class ApiClient {
  private epoch = 0;
  private requests = new Set<AbortController>();
  private token: CsrfDto | null = null;
  private pendingToken: Promise<CsrfDto> | null = null;
  onUnauthorized: (() => void) | null = null;
  get scope() { return this.epoch; }

  resetScope() {
    this.epoch++;
    for (const request of this.requests) request.abort();
    this.requests.clear(); this.clearCsrf();
  }
  clearCsrf() { this.token = null; this.pendingToken = null; }
  async csrf(): Promise<CsrfDto> {
    if (this.token) return this.token;
    if (this.pendingToken) return this.pendingToken;
    const epoch = this.epoch;
    const pending = this.request<CsrfDto>("/api/auth/csrf").then(token => {
      if (epoch !== this.epoch) throw new DOMException("Identity changed", "AbortError");
      this.token = token; return token;
    });
    this.pendingToken = pending;
    try { return await pending; }
    finally { if (this.pendingToken === pending) this.pendingToken = null; }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const epoch = this.epoch;
    const controller = new AbortController();
    const timeout = new AbortController();
    const timer = setTimeout(() => timeout.abort(), options.timeoutMs ?? 10000);
    const signal = AbortSignal.any([controller.signal, timeout.signal, ...(options.signal ? [options.signal] : [])]);
    this.requests.add(controller);
    const check = () => { if (epoch !== this.epoch || signal.aborted) throw new DOMException("Request cancelled", "AbortError"); };
    try {
      check();
      const headers = new Headers();
      const method = options.method ?? "GET";
      if (method !== "GET") {
        const token = await this.csrf(); check(); headers.set(token.headerName, token.token);
      }
      const multipart = options.body instanceof FormData;
      if (options.body !== undefined && !multipart) headers.set("Content-Type", "application/json");
      const response = await fetch(path, {
        method, headers, credentials: "same-origin", cache: "no-store", signal,
        body: options.body === undefined ? undefined : multipart ? options.body as FormData : JSON.stringify(options.body),
      });
      const text = await response.text(); check();
      let body: unknown = null;
      try { body = text ? JSON.parse(text) : null; }
      catch { throw new ApiFailure(response.status, "INVALID_RESPONSE", "服务响应无法读取，请稍后重试"); }
      if (!response.ok) {
        const error = body as Partial<ApiError> | null;
        const failure = new ApiFailure(response.status, typeof error?.code === "string" ? error.code : "REQUEST_FAILED",
          typeof error?.message === "string" ? error.message : "请求未完成，请稍后重试",
          error?.fieldErrors && typeof error.fieldErrors === "object" ? error.fieldErrors : {});
        if (response.status === 403) this.clearCsrf(); // Refresh before the next explicit attempt; never replay a write automatically.
        if (response.status === 401 && failure.code === "UNAUTHENTICATED") this.onUnauthorized?.();
        throw failure;
      }
      return body as T;
    } catch (error) {
      if (epoch !== this.epoch || controller.signal.aborted || options.signal?.aborted) throw new DOMException("Request cancelled", "AbortError");
      if (timeout.signal.aborted) throw new ApiFailure(0, "REQUEST_TIMEOUT", "请求超时，请稍后重试");
      if (error instanceof ApiFailure || isAborted(error)) throw error;
      throw new ApiFailure(0, "NETWORK_ERROR", "暂时无法连接服务，请检查网络后重试");
    } finally { clearTimeout(timer); this.requests.delete(controller); }
  }
}
