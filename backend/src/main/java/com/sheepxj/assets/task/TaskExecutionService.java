package com.sheepxj.assets.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.contract.ApiContracts.TaskStage;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.storage.FileStorage;
import java.util.concurrent.atomic.AtomicBoolean;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;

@Service
public class TaskExecutionService {
    private static final Logger log = LoggerFactory.getLogger(TaskExecutionService.class);
    private final TaskStateStore state;
    private final TaskStages stages;
    private final TaskConfiguration.Delay delay;
    private final ObjectMapper json;
    private final FileStorage storage;
    private final AtomicBoolean executing = new AtomicBoolean();
    private final Object claimLock = new Object();
    private boolean accepting = true;

    public TaskExecutionService(TaskStateStore state, TaskStages stages, TaskConfiguration.Delay delay, ObjectMapper json, FileStorage storage) {
        this.state = state; this.stages = stages; this.delay = delay; this.json = json; this.storage = storage;
    }

    public boolean runNextTask() {
        if (!executing.compareAndSet(false, true)) return false;
        try {
            synchronized (claimLock) { if (!accepting) return false; }
            // No other execution is active in this single-instance worker. Reconcile an earlier uncertain DB write before taking more work.
            state.failRunning("STATE_PERSISTENCE_FAILED", "制作状态保存失败，处理已停止");
            TaskRecord task;
            // Closing admission and committing a claim share the same lock. A poll already in flight must recheck after reconciliation.
            synchronized (claimLock) {
                if (!accepting) return false;
                task = state.claimNext();
            }
            if (task == null) return false;
            execute(task);
            return true;
        } finally { executing.set(false); }
    }

    public void startAccepting() { synchronized (claimLock) { accepting = true; } }
    public void stopAccepting() { synchronized (claimLock) { accepting = false; } }

    private void execute(TaskRecord task) {
        TaskStage stage = TaskStage.MATERIAL_CHECK;
        String generated = null, result = null;
        boolean savingState = false;
        try {
            var settings = json.readValue(task.simulationConfigJson(), SimulationSettings.class);
            for (TaskStage next : TaskStage.values()) {
                stage = next;
                savingState = false;
                log.info("Task {} stage {} started", task.id(), stage);
                delay.pause(settings.delay(stage));
                if (settings.fails(stage)) throw new SimulatedFailure();
                switch (stage) {
                    case MATERIAL_CHECK -> stages.checkMaterials(task);
                    case GENERATE -> generated = stages.generate(task);
                    case FINALIZE -> result = stages.finalizeResult(task, generated);
                }
                if (Thread.currentThread().isInterrupted()) throw new InterruptedException();
                savingState = true;
                state.completeStage(task.id(), stage, result);
                log.info("Task {} stage {} succeeded", task.id(), stage);
            }
        } catch (InterruptedException exception) {
            Thread.currentThread().interrupt();
            log.info("Task {} interrupted during {}; startup recovery will mark it failed", task.id(), stage);
        } catch (Exception exception) {
            if (Thread.currentThread().isInterrupted()) return;
            String code = savingState ? "STATE_PERSISTENCE_FAILED" : exception instanceof SimulatedFailure ? "SIMULATED_FAILURE" : stage.name() + "_FAILED";
            String label = switch (stage) { case MATERIAL_CHECK -> "素材检查"; case GENERATE -> "模拟生成"; case FINALIZE -> "结果整理"; };
            String message = savingState ? "制作状态保存失败，处理已停止" : exception instanceof SimulatedFailure ? label + "发生指定的模拟失败" :
                    switch (stage) { case MATERIAL_CHECK -> "素材丢失、损坏或不符合模板要求，请重新上传后制作"; case GENERATE -> "模拟生成失败，预置结果暂时不可用"; case FINALIZE -> "结果整理失败，无法保存或读取结果图片"; };
            log.warn("Task {} stage {} failed: {}", task.id(), stage, code, exception);
            if (state.fail(task.id(), code, message) && result != null) storage.removeAfterFailure(result);
        }
    }

    private static final class SimulatedFailure extends RuntimeException { }
}
