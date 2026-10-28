import { ApiClient, ApiFailure, isAborted, resultUnknown } from "@/lib/api/client";
import type { CreateTaskRequest, TaskDto } from "@/lib/api/contracts";
import type { UploadSlot } from "./upload-session";

export interface SubmissionSnapshot { status: "idle" | "pending" | "unknown" | "error" | "accepted"; task: TaskDto | null; error: ApiFailure | null; requestId: string | null }
const initial: SubmissionSnapshot = { status: "idle", task: null, error: null, requestId: null };
export class Submission {
  private snapshot = initial;
  private listeners = new Set<() => void>();
  private version = 0;
  private request: AbortController | null = null;
  private payload: CreateTaskRequest | null = null;
  constructor(private api: ApiClient, private templateId: string, private accepted: (task: TaskDto, scope: number) => void, private uncertain: () => void) {}
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.snapshot;
  private publish(snapshot: SubmissionSnapshot) { this.snapshot = snapshot; this.listeners.forEach(listener => listener()); }
  changed = () => { this.version++; this.request?.abort(); this.payload = null; this.publish(initial); };
  // Route navigation must not lose an acknowledgement. The owner-scoped provider receives it;
  // unmounted view listeners unsubscribe, and ApiClient still cancels on an identity change.
  dispose = () => { this.listeners.clear(); };
  submit = async (slots: UploadSlot[]) => {
    if (this.snapshot.status === "pending" || this.snapshot.status === "accepted") return;
    if (!slots.length || slots.some(slot => slot.status !== "ready" || !slot.asset)) return;
    const assetIds = slots.map(slot => slot.asset!.id);
    if (!this.payload || JSON.stringify(this.payload.assetIds) !== JSON.stringify(assetIds)) this.payload = { templateId: this.templateId, assetIds, requestId: crypto.randomUUID() };
    const payload = this.payload, version = this.version, scope = this.api.scope;
    const request = new AbortController(); this.request = request;
    this.publish({ ...initial, status: "pending", requestId: payload.requestId });
    try {
      const task = await this.api.request<TaskDto>("/api/tasks", { method: "POST", body: payload, signal: request.signal });
      if (version !== this.version || request.signal.aborted || scope !== this.api.scope) return;
      if (!task || typeof task.id !== "string" || !["QUEUED", "RUNNING", "SUCCEEDED", "FAILED"].includes(task.status)) throw new ApiFailure(202, "INVALID_RESPONSE", "受理响应无法确认");
      this.accepted(task, scope);
      this.publish({ status: "accepted", task, error: null, requestId: payload.requestId });
    } catch (error) {
      if (version !== this.version || request.signal.aborted || scope !== this.api.scope || isAborted(error)) return;
      this.publish({ ...initial, status: resultUnknown(error) ? "unknown" : "error", error: error as ApiFailure, requestId: payload.requestId });
      if (resultUnknown(error)) this.uncertain();
    }
  };
}
