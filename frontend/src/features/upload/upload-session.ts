import { ApiClient, failureMessage, isAborted } from "@/lib/api/client";
import type { AssetDto, TemplateDto } from "@/lib/api/contracts";
import { fileSize, imageTypes } from "@/lib/format";

export interface UploadSlot {
  status: "empty" | "uploading" | "ready" | "error";
  file: File | null; localUrl: string | null; asset: AssetDto | null; error: string | null; canRetry: boolean;
}
const empty = (): UploadSlot => ({ status: "empty", file: null, localUrl: null, asset: null, error: null, canRetry: false });

export class UploadSession {
  private slots: UploadSlot[];
  private versions: number[];
  private requests: (AbortController | undefined)[];
  private listeners = new Set<() => void>();
  constructor(private api: ApiClient, private template: TemplateDto, private changed: () => void) {
    this.slots = Array.from({ length: template.requiredImageCount }, empty);
    this.versions = this.slots.map(() => 0); this.requests = [];
  }
  subscribe = (listener: () => void) => { this.listeners.add(listener); return () => { this.listeners.delete(listener); }; };
  getSnapshot = () => this.slots;
  private set(index: number, value: UploadSlot) {
    this.slots = this.slots.map((slot, i) => i === index ? value : slot); this.listeners.forEach(listener => listener());
  }
  private release(index: number) {
    this.requests[index]?.abort(); this.requests[index] = undefined; this.versions[index]++;
    const url = this.slots[index].localUrl; if (url) URL.revokeObjectURL(url);
  }
  remove = (index: number) => { this.release(index); this.set(index, empty()); this.changed(); };
  clear = () => { this.slots.forEach((_, i) => this.release(i)); this.slots = this.slots.map(empty); this.changed(); this.listeners.forEach(listener => listener()); };
  dispose = () => { this.slots.forEach((_, i) => this.release(i)); this.slots = this.slots.map(empty); };
  retry = (index: number) => { const slot = this.slots[index]; if (slot.file && slot.canRetry) void this.choose(index, slot.file); };

  choose = async (index: number, file: File) => {
    this.release(index); this.changed();
    let error: string | null = null;
    if (file.size === 0) error = "请选择一张非空图片";
    else if (!this.template.acceptedMimeTypes.includes(file.type as AssetDto["mimeType"])) error = `仅支持 ${imageTypes(this.template.acceptedMimeTypes)} 图片`;
    else if (file.size > this.template.maxFileSizeBytes) error = `单张图片不能超过 ${fileSize(this.template.maxFileSizeBytes)}`;
    if (error) { this.set(index, { ...empty(), status: "error", file, error }); return; }
    const localUrl = URL.createObjectURL(file);
    const controller = new AbortController(); this.requests[index] = controller;
    const version = this.versions[index]; const scope = this.api.scope;
    this.set(index, { ...empty(), status: "uploading", file, localUrl });
    const body = new FormData(); body.append("file", file);
    try {
      const asset = await this.api.request<AssetDto>("/api/assets", { method: "POST", body, signal: controller.signal });
      if (version !== this.versions[index] || controller.signal.aborted || scope !== this.api.scope) return;
      URL.revokeObjectURL(localUrl);
      this.set(index, { ...empty(), status: "ready", file, asset });
    } catch (error) {
      if (version !== this.versions[index] || controller.signal.aborted || scope !== this.api.scope || isAborted(error)) return;
      this.set(index, { ...empty(), status: "error", file, localUrl, error: failureMessage(error), canRetry: true });
    }
  };
}
