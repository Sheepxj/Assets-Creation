import { ApiClient, ApiFailure, isAborted, resultUnknown } from "@/lib/api/client";
import type { Credentials, UserDto } from "@/lib/api/contracts";
import { connectIdentitySync } from "./identity-sync";

export interface SessionSnapshot {
  user: UserDto | null; status: "loading" | "ready" | "changing" | "error";
  error: ApiFailure | null; notice: string | null; revision: number;
}
const initial: SessionSnapshot = { user: null, status: "loading", error: null, notice: null, revision: 0 };

export class SessionStore {
  private snapshot: SessionSnapshot = initial;
  private listeners = new Set<() => void>();
  private operation = 0;
  private changing = false;
  private identitySync: ReturnType<typeof connectIdentitySync> | null = null;
  constructor(readonly api: ApiClient, private clearPrivateState: () => void) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  getServerSnapshot = () => initial;
  private publish(change: Partial<SessionSnapshot>) {
    this.snapshot = { ...this.snapshot, ...change }; this.listeners.forEach(listener => listener());
  }
  private boundary() {
    this.api.resetScope(); this.clearPrivateState();
    this.publish({ revision: this.snapshot.revision + 1 });
  }
  connect() {
    const identitySync = connectIdentitySync(() => {
      this.operation++; this.changing = false; this.boundary();
      this.publish({ user: null, status: "loading", error: null, notice: null });
      void this.restore();
    });
    this.identitySync = identitySync;
    this.api.onUnauthorized = () => {
      if (!this.snapshot.user) return;
      this.operation++; this.changing = false; this.boundary();
      this.publish({ user: null, status: "ready", error: null, notice: "登录已过期，请重新登录。后台制作会继续执行。" });
    };
    void this.restore();
    return () => {
      identitySync.dispose();
      if (this.identitySync === identitySync) this.identitySync = null;
      this.operation++; this.api.onUnauthorized = null; this.api.resetScope();
    };
  }
  restore = async () => {
    if (this.changing) return;
    const operation = ++this.operation;
    this.publish({ status: "loading", error: null });
    try {
      const user = await this.api.request<UserDto>("/api/auth/me");
      if (!user || typeof user.id !== "string" || typeof user.username !== "string") throw new ApiFailure(200, "INVALID_RESPONSE", "账户响应无法确认，请重试");
      if (operation !== this.operation) return;
      this.boundary();
      this.api.clearCsrf(); await this.api.csrf();
      if (operation !== this.operation) return;
      this.publish({ user, status: "ready", error: null, notice: null });
    } catch (error) {
      if (operation !== this.operation || isAborted(error)) return;
      if (error instanceof ApiFailure && error.code === "UNAUTHENTICATED") {
        if (this.snapshot.user) this.boundary();
        this.publish({ user: null, status: "ready", error: null });
      } else this.publish({ status: "error", error: error as ApiFailure });
    }
  };
  authenticate = async (mode: "login" | "register", credentials: Credentials) => {
    if (this.changing) throw new ApiFailure(0, "AUTH_BUSY", "正在处理账号操作");
    if (this.snapshot.status !== "ready") throw new ApiFailure(0, "AUTH_NOT_READY", "请先确认账户状态");
    this.changing = true;
    const previous = this.snapshot.user;
    const operation = ++this.operation;
    this.boundary(); this.publish({ status: "changing", error: null });
    let authenticated: UserDto | null = null;
    try {
      const user = await this.api.request<UserDto>(`/api/auth/${mode}`, { method: "POST", body: credentials });
      this.identitySync?.publish();
      if (operation !== this.operation) throw new DOMException("Identity changed", "AbortError");
      if (!user || typeof user.id !== "string" || typeof user.username !== "string") throw new ApiFailure(200, "INVALID_RESPONSE", "账户响应无法确认，请重试");
      authenticated = user;
      this.boundary();
      this.api.clearCsrf(); await this.api.csrf();
      if (operation !== this.operation) throw new DOMException("Identity changed", "AbortError");
      this.publish({ user: authenticated, status: "ready", error: null, notice: null });
    } catch (error) {
      if (resultUnknown(error)) this.identitySync?.publish();
      if (operation === this.operation && !isAborted(error)) {
        this.publish({ user: authenticated ?? previous, status: authenticated || resultUnknown(error) ? "error" : "ready", error: authenticated || resultUnknown(error) ? error as ApiFailure : null });
      }
      throw error;
    } finally { if (operation === this.operation) this.changing = false; }
  };
  logout = async () => {
    if (this.changing) return;
    this.changing = true;
    const operation = ++this.operation;
    this.boundary(); this.publish({ status: "changing", error: null });
    let loggedOut = false;
    try {
      await this.api.request<void>("/api/auth/logout", { method: "POST" });
      this.identitySync?.publish();
      if (operation !== this.operation) return;
      loggedOut = true;
      this.boundary();
      this.api.clearCsrf(); await this.api.csrf();
      if (operation === this.operation) this.publish({ user: null, status: "ready", error: null, notice: null });
    } catch (error) {
      if (resultUnknown(error)) this.identitySync?.publish();
      if (operation === this.operation && !isAborted(error)) this.publish({ user: loggedOut ? null : this.snapshot.user, status: "error", error: error as ApiFailure });
    } finally { if (operation === this.operation) this.changing = false; }
  };
}

export function safeReturnTo(value: unknown): string {
  if (typeof value !== "string" || !value || /[\\\u0000-\u001f]/.test(value) || !value.startsWith("/") || value.startsWith("//")) return "/";
  try {
    const url = new URL(value, "https://local.invalid");
    return url.origin === "https://local.invalid" && /^\/(?:templates\/[a-z0-9-]+|tasks)?$/.test(url.pathname) ? url.pathname + url.search + url.hash : "/";
  } catch { return "/"; }
}

export function validateCredentials(username: string, password: string, confirmation?: string): Record<string, string> {
  const errors: Record<string, string> = {};
  if (!/^[a-z0-9_]{3,32}$/.test(username.trim().toLowerCase())) errors.username = "用户名需为 3～32 位英文字母、数字或下划线";
  if ([...password].length < 8 || new TextEncoder().encode(password).length > 72) errors.password = "密码至少 8 个字符，UTF-8 最多 72 字节";
  if (confirmation !== undefined && password !== confirmation) errors.confirmation = "两次输入的密码不一致";
  return errors;
}
