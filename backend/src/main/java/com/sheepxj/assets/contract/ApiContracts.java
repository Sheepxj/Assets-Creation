package com.sheepxj.assets.contract;

import java.time.Instant;
import java.util.List;
import java.util.Map;

/** Transport contracts only. Business behavior is introduced in subsequent phases. */
public final class ApiContracts {
    private ApiContracts() { }

    public enum TaskStatus { QUEUED, RUNNING, SUCCEEDED, FAILED }
    public enum TaskStage { MATERIAL_CHECK, GENERATE, FINALIZE }
    public enum StepStatus { PENDING, RUNNING, SUCCEEDED, FAILED }

    public record ApiError(String code, String message, Map<String, String> fieldErrors) { }
    public record PageResponse<T>(List<T> items, int page, int pageSize, long total) { }
    public record UserDto(String id, String username) { }
    public record Credentials(String username, String password) {
        @Override public String toString() { return "Credentials[username=" + username + ", password=[REDACTED]]"; }
    }
    public record CsrfDto(String token, String headerName, String parameterName) { }
    public record CategoryDto(String id, String title) { }
    public record TemplateDto(String id, String title, String category, String coverUrl,
            String description, int requiredImageCount, List<String> acceptedMimeTypes,
            long maxFileSizeBytes) { }
    public record AssetDto(String id, String originalFilename, String mimeType,
            long sizeBytes, String previewUrl) { }
    public record CreateTaskRequest(String templateId, List<String> assetIds, String requestId) { }
    public record TaskStepDto(TaskStage stage, StepStatus status, Instant startedAt,
            Instant finishedAt, String errorCode, String errorMessage) { }
    public record TaskDto(String id, String templateId, String templateTitle, TaskStatus status,
            TaskStage currentStage, List<TaskStepDto> steps, Instant createdAt, Instant startedAt,
            Instant finishedAt, String resultUrl, String errorCode, String errorMessage) { }
}
