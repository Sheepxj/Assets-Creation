package com.sheepxj.assets.persistence.model;

import com.sheepxj.assets.contract.ApiContracts.StepStatus;
import com.sheepxj.assets.contract.ApiContracts.TaskStage;
import java.time.Instant;

public record TaskStepRecord(String taskId, TaskStage stage, StepStatus status,
        Instant startedAt, Instant finishedAt, String errorCode, String errorMessage) { }
