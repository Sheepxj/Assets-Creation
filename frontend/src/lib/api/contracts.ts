/** Shared API contract. See docs/api.md. IDs are opaque strings. */
export type TaskStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type TaskStage = "MATERIAL_CHECK" | "GENERATE" | "FINALIZE";
export type StepStatus = "PENDING" | "RUNNING" | "SUCCEEDED" | "FAILED";
export type ImageMimeType = "image/jpeg" | "image/png";
export type IsoTimestamp = string;

export interface ApiError {
  code: string;
  message: string;
  fieldErrors: Record<string, string>;
}
export interface PageResponse<T> { items: T[]; page: number; pageSize: number; total: number }
export interface UserDto { id: string; username: string }
export interface Credentials { username: string; password: string }
export interface CsrfDto { token: string; headerName: string; parameterName: string }
export interface CategoryDto { id: string; title: string }
export interface TemplateDto {
  id: string; title: string; category: string; coverUrl: string; description: string;
  requiredImageCount: number; acceptedMimeTypes: ImageMimeType[]; maxFileSizeBytes: number;
}
export interface AssetDto {
  id: string; originalFilename: string; mimeType: ImageMimeType; sizeBytes: number; previewUrl: string;
}
export interface CreateTaskRequest { templateId: string; assetIds: string[]; requestId: string }
export interface TaskStepDto {
  stage: TaskStage; status: StepStatus; startedAt: IsoTimestamp | null;
  finishedAt: IsoTimestamp | null; errorCode: string | null; errorMessage: string | null;
}
export interface TaskDto {
  id: string; templateId: string; templateTitle: string; status: TaskStatus;
  currentStage: TaskStage | null; steps: TaskStepDto[]; createdAt: IsoTimestamp;
  startedAt: IsoTimestamp | null; finishedAt: IsoTimestamp | null;
  resultUrl: string | null; errorCode: string | null; errorMessage: string | null;
}
