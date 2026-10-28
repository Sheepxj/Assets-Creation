package com.sheepxj.assets.task;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.contract.ApiContracts.*;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.storage.FileStorage;
import java.time.Instant;
import java.util.concurrent.*;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

class TaskExecutionServiceTest {
    private final TaskStateStore state = mock(TaskStateStore.class);
    private final TaskStages stages = mock(TaskStages.class);
    private final TaskConfiguration.Delay delay = mock(TaskConfiguration.Delay.class);
    private final ObjectMapper json = new ObjectMapper();
    private final FileStorage storage = mock(FileStorage.class);
    private final TaskExecutionService execution = new TaskExecutionService(state, stages, delay, json, storage);

    @Test void stagesRunInOrderWithIndependentPersistentBoundaries() throws Exception {
        var task = task(SimulationSettings.FailStage.NONE); when(state.claimNext()).thenReturn(task);
        when(stages.generate(task)).thenReturn("results/source.png"); when(stages.finalizeResult(task, "results/source.png")).thenReturn("results/user/task.png");
        assertTrue(execution.runNextTask());
        var order = inOrder(state, stages, delay);
        order.verify(state).failRunning(anyString(), anyString()); order.verify(state).claimNext();
        order.verify(delay).pause(11); order.verify(stages).checkMaterials(task); order.verify(state).completeStage(task.id(), TaskStage.MATERIAL_CHECK, null);
        order.verify(delay).pause(22); order.verify(stages).generate(task); order.verify(state).completeStage(task.id(), TaskStage.GENERATE, null);
        order.verify(delay).pause(33); order.verify(stages).finalizeResult(task, "results/source.png"); order.verify(state).completeStage(task.id(), TaskStage.FINALIZE, "results/user/task.png");
        verify(state, never()).fail(anyString(), anyString(), anyString());
    }

    @ParameterizedTest @EnumSource(TaskStage.class)
    void specifiedFailureStopsAllLaterStages(TaskStage failure) throws Exception {
        var task = task(SimulationSettings.FailStage.valueOf(failure.name())); when(state.claimNext()).thenReturn(task);
        assertTrue(execution.runNextTask());
        verify(state).fail(eq(task.id()), eq("SIMULATED_FAILURE"), contains("模拟失败"));
        verify(delay, times(failure.ordinal() + 1)).pause(anyLong());
        verify(state, times(failure.ordinal())).completeStage(anyString(), any(), any());
        verify(stages, times(failure == TaskStage.MATERIAL_CHECK ? 0 : 1)).checkMaterials(task);
        verify(stages, times(failure == TaskStage.FINALIZE ? 1 : 0)).generate(task);
        verify(stages, never()).finalizeResult(any(), any());
    }

    @Test void interruptedWorkerLeavesRunningStateForRestartRecovery() throws Exception {
        when(state.claimNext()).thenReturn(task(SimulationSettings.FailStage.NONE));
        doThrow(new InterruptedException()).when(delay).pause(anyLong());
        try {
            execution.runNextTask(); assertTrue(Thread.currentThread().isInterrupted());
            verify(state, never()).fail(anyString(), anyString(), anyString()); verifyNoInteractions(stages);
        } finally { Thread.interrupted(); }
    }

    @Test void concurrentPollCannotStartAnotherExecution() throws Exception {
        when(state.claimNext()).thenReturn(task(SimulationSettings.FailStage.NONE));
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> { entered.countDown(); assertTrue(release.await(3, TimeUnit.SECONDS)); return null; }).when(delay).pause(11);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            var first = pool.submit(execution::runNextTask);
            try { assertTrue(entered.await(2, TimeUnit.SECONDS)); assertFalse(execution.runNextTask()); }
            finally { release.countDown(); }
            assertTrue(first.get(3, TimeUnit.SECONDS)); verify(state, times(1)).claimNext();
        }
    }

    private TaskRecord task(SimulationSettings.FailStage failure) throws Exception {
        return new TaskRecord("task", "user", "template", "title", "request", "fingerprint", TaskStatus.RUNNING, TaskStage.MATERIAL_CHECK,
                json.writeValueAsString(new SimulationSettings(11, 22, 33, failure)), Instant.now(), Instant.now(), null, null, null, null);
    }
}
