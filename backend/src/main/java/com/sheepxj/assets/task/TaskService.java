package com.sheepxj.assets.task;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.*;
import com.sheepxj.assets.persistence.mapper.*;
import com.sheepxj.assets.persistence.model.*;
import com.sheepxj.assets.security.CurrentUser;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

@Service
public class TaskService {
    private final TaskMapper tasks;
    private final TaskAssetMapper links;
    private final TaskStepMapper steps;
    private final CurrentUser current;
    private final TaskMaterials materials;
    private final SimulationSettings simulation;
    private final ObjectMapper json;
    private final TaskQueryService queries;
    private final TransactionTemplate transactions;

    public TaskService(TaskMapper tasks, TaskAssetMapper links, TaskStepMapper steps, CurrentUser current,
            TaskMaterials materials, SimulationSettings simulation, ObjectMapper json, TaskQueryService queries,
            PlatformTransactionManager manager) {
        this.tasks = tasks; this.links = links; this.steps = steps; this.current = current; this.materials = materials;
        this.simulation = simulation; this.json = json; this.queries = queries; transactions = new TransactionTemplate(manager);
    }

    private record Payload(String templateId, List<String> assetIds) { }

    public TaskDto create(CreateTaskRequest request) {
        validate(request);
        String requestId = UUID.fromString(request.requestId()).toString();
        String userId = current.require().id();
        String fingerprint;
        String snapshot;
        try {
            fingerprint = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(json.writeValueAsBytes(new Payload(request.templateId(), request.assetIds()))));
            snapshot = json.writeValueAsString(simulation);
        } catch (JsonProcessingException | NoSuchAlgorithmException exception) { throw new IllegalStateException("Cannot encode task configuration", exception); }
        var previous = tasks.findByRequestId(userId, requestId);
        if (previous != null) return existing(previous, fingerprint);
        // Decode/read files before entering the short creation transaction.
        var template = materials.validate(userId, request.templateId(), request.assetIds());
        String id = UUID.randomUUID().toString();
        var task = new TaskRecord(id, userId, template.id(), template.title(), requestId, fingerprint, TaskStatus.QUEUED,
                null, snapshot, Instant.now().truncatedTo(ChronoUnit.MICROS), null, null, null, null, null);
        try {
            transactions.executeWithoutResult(status -> {
                tasks.insert(task);
                for (int i = 0; i < request.assetIds().size(); i++) links.insert(new TaskAssetRecord(id, request.assetIds().get(i), userId, i));
                for (TaskStage stage : TaskStage.values()) steps.insert(new TaskStepRecord(id, stage, StepStatus.PENDING, null, null, null, null));
            });
        } catch (DuplicateKeyException exception) {
            // The losing transaction has rolled back before reading the winning committed request.
            previous = tasks.findByRequestId(userId, requestId);
            if (previous == null) throw exception;
            return existing(previous, fingerprint);
        }
        return queries.detail(id);
    }

    private TaskDto existing(TaskRecord task, String fingerprint) {
        if (!task.requestFingerprint().equals(fingerprint)) throw new ApiException(HttpStatus.CONFLICT, "IDEMPOTENCY_CONFLICT", "同一 requestId 已用于不同的模板或素材顺序，请为新制作生成新 ID");
        return queries.detail(task.id());
    }

    private static void validate(CreateTaskRequest request) {
        if (request == null || request.templateId() == null || request.templateId().isBlank() || request.templateId().length() > 64) throw invalid("templateId", "请选择有效模板");
        if (request.assetIds() == null || request.assetIds().isEmpty() || request.assetIds().size() > 100
                || request.assetIds().stream().anyMatch(id -> id == null || id.isBlank() || id.length() > 36)) throw invalid("assetIds", "请提供有效素材列表");
        try {
            if (request.requestId() == null || !UUID.fromString(request.requestId()).toString().equalsIgnoreCase(request.requestId())) throw new IllegalArgumentException();
        } catch (IllegalArgumentException exception) { throw invalid("requestId", "requestId 必须为标准 UUID"); }
    }
    private static ApiException invalid(String field, String message) { return new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", message, Map.of(field, message)); }
}
