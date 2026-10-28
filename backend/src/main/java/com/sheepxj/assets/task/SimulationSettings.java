package com.sheepxj.assets.task;

import com.sheepxj.assets.contract.ApiContracts.TaskStage;
import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.simulation")
public record SimulationSettings(long checkDelayMs, long generateDelayMs, long finalizeDelayMs, FailStage failStage) {
    public enum FailStage { NONE, MATERIAL_CHECK, GENERATE, FINALIZE }

    public SimulationSettings {
        if (checkDelayMs < 0 || generateDelayMs < 0 || finalizeDelayMs < 0 || failStage == null) {
            throw new IllegalArgumentException("Simulation delays must be nonnegative and fail-stage must be valid");
        }
    }

    public long delay(TaskStage stage) {
        return switch (stage) {
            case MATERIAL_CHECK -> checkDelayMs;
            case GENERATE -> generateDelayMs;
            case FINALIZE -> finalizeDelayMs;
        };
    }
    public boolean fails(TaskStage stage) { return failStage.name().equals(stage.name()); }
}
