package com.sheepxj.assets.persistence.model;

import com.sheepxj.assets.contract.ApiContracts.TaskStage;
import com.sheepxj.assets.contract.ApiContracts.TaskStatus;
import java.time.Instant;

public record TaskRecord(String id, String userId, String templateId, String templateTitle,
        String requestId, String requestFingerprint, TaskStatus status, TaskStage currentStage,
        String simulationConfigJson, Instant createdAt, Instant startedAt, Instant finishedAt,
        String resultPath, String errorCode, String errorMessage) { }
