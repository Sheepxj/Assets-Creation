package com.sheepxj.assets.task;

import com.sheepxj.assets.contract.ApiContracts.*;
import com.sheepxj.assets.persistence.mapper.TaskMapper;
import com.sheepxj.assets.persistence.mapper.TaskStepMapper;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.persistence.model.TaskStepRecord;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.concurrent.CancellationException;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.TransactionDefinition;
import org.springframework.transaction.support.TransactionTemplate;

@Component
public class TaskStateStore {
    private final TaskMapper tasks;
    private final TaskStepMapper steps;
    private final TransactionTemplate transactions;

    public TaskStateStore(TaskMapper tasks, TaskStepMapper steps, PlatformTransactionManager manager) {
        this.tasks = tasks; this.steps = steps; transactions = new TransactionTemplate(manager);
        transactions.setPropagationBehavior(TransactionDefinition.PROPAGATION_REQUIRES_NEW);
        transactions.setTimeout(10);
    }

    public TaskRecord claimNext() {
        writable();
        return transactions.execute(status -> {
            var task = tasks.findOldestQueued();
            if (task == null) return null;
            var now = now();
            var claimed = state(task, TaskStatus.RUNNING, TaskStage.MATERIAL_CHECK, now, null, null, null, null);
            if (tasks.transition(claimed, TaskStatus.QUEUED, null) != 1) return null;
            changed(steps.transition(new TaskStepRecord(task.id(), TaskStage.MATERIAL_CHECK, StepStatus.RUNNING, now, null, null, null), StepStatus.PENDING));
            return claimed;
        });
    }

    public TaskRecord completeStage(String id, TaskStage stage, String resultPath) {
        writable();
        return transactions.execute(status -> {
            var task = tasks.findById(id);
            if (task == null || task.status() != TaskStatus.RUNNING || task.currentStage() != stage) throw new IllegalStateException("Task stage changed before completion");
            var step = steps.findByTaskId(id).stream().filter(item -> item.stage() == stage).findFirst().orElseThrow();
            var now = now();
            changed(steps.transition(new TaskStepRecord(id, stage, StepStatus.SUCCEEDED, step.startedAt(), now, null, null), StepStatus.RUNNING));
            TaskRecord updated;
            if (stage == TaskStage.FINALIZE) {
                if (resultPath == null) throw new IllegalStateException("A successful task requires a readable result");
                updated = state(task, TaskStatus.SUCCEEDED, stage, task.startedAt(), now, resultPath, null, null);
            } else {
                TaskStage next = TaskStage.values()[stage.ordinal() + 1];
                changed(steps.transition(new TaskStepRecord(id, next, StepStatus.RUNNING, now, null, null, null), StepStatus.PENDING));
                updated = state(task, TaskStatus.RUNNING, next, task.startedAt(), null, null, null, null);
            }
            changed(tasks.transition(updated, TaskStatus.RUNNING, stage));
            return updated;
        });
    }

    public boolean fail(String id, String code, String message) {
        writable();
        return Boolean.TRUE.equals(transactions.execute(status -> {
            var task = tasks.findById(id);
            if (task == null || task.status() != TaskStatus.RUNNING) return false;
            var now = now();
            for (var step : steps.findByTaskId(id)) {
                if (step.status() == StepStatus.RUNNING || (step.stage() == task.currentStage() && step.status() == StepStatus.PENDING)) {
                    changed(steps.transition(new TaskStepRecord(id, step.stage(), StepStatus.FAILED,
                            step.startedAt() == null ? task.startedAt() : step.startedAt(), now, code, message), step.status()));
                }
            }
            changed(tasks.transition(state(task, TaskStatus.FAILED, task.currentStage(), task.startedAt(), now, null, code, message), TaskStatus.RUNNING, task.currentStage()));
            return true;
        }));
    }

    public void failRunning(String code, String message) {
        for (var task : tasks.findRunning()) fail(task.id(), code, message);
    }

    private static TaskRecord state(TaskRecord task, TaskStatus status, TaskStage stage, Instant started, Instant finished,
            String path, String code, String message) {
        return new TaskRecord(task.id(), task.userId(), task.templateId(), task.templateTitle(), task.requestId(), task.requestFingerprint(),
                status, stage, task.simulationConfigJson(), task.createdAt(), started, finished, path, code, message);
    }
    private static Instant now() { return Instant.now().truncatedTo(ChronoUnit.MICROS); }
    private static void changed(int count) { if (count != 1) throw new IllegalStateException("Task state transition lost its expected state"); }
    private static void writable() { if (Thread.currentThread().isInterrupted()) throw new CancellationException("Worker is stopping"); }
}
