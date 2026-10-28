import type { AssetDto, TaskDto, TemplateDto } from "@/lib/api/contracts";
export const template: TemplateDto = { id: "travel-postcard", title: "旅行明信片", category: "travel", coverUrl: "/api/demo/covers/travel-postcard.jpg", description: "上传两张图片，留下旅行灵感", requiredImageCount: 2, acceptedMimeTypes: ["image/jpeg", "image/png"], maxFileSizeBytes: 5242880 };
export const asset = (id: string): AssetDto => ({ id, originalFilename: "photo.png", mimeType: "image/png", sizeBytes: 10, previewUrl: `/api/assets/${id}/content` });
export const task = (id = "task-1"): TaskDto => ({ id, templateId: template.id, templateTitle: template.title, status: "QUEUED", currentStage: null, createdAt: "2026-10-28T12:00:00Z", startedAt: null, finishedAt: null, resultUrl: null, errorCode: null, errorMessage: null,
  steps: ["MATERIAL_CHECK", "GENERATE", "FINALIZE"].map(stage => ({ stage: stage as TaskDto["steps"][number]["stage"], status: "PENDING", startedAt: null, finishedAt: null, errorCode: null, errorMessage: null })) });
export function deferred<T>() { let resolve!: (value: T) => void; let reject!: (error: unknown) => void; const promise = new Promise<T>((yes, no) => { resolve = yes; reject = no; }); return { promise, resolve, reject }; }
export const jsonResponse = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { "Content-Type": "application/json" } });
