package com.sheepxj.assets.task;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.Test;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TaskWorkerTest {
    @Test void recoveryPrecedesPollingAndAnExceptionDoesNotCancelTheNextPoll() throws Exception {
        var state = mock(TaskStateStore.class); var execution = mock(TaskExecutionService.class);
        var next = new CountDownLatch(1);
        when(execution.runNextTask()).thenThrow(new IllegalStateException("database unavailable"))
                .thenAnswer(call -> { next.countDown(); return false; });
        var worker = new TaskWorker(state, execution);
        try {
            worker.start(); assertTrue(next.await(3, TimeUnit.SECONDS));
            var order = inOrder(state, execution);
            order.verify(state).failRunning("SERVICE_RESTARTED", "服务重启导致制作中断");
            order.verify(execution, atLeast(2)).runNextTask();
        } finally { worker.stop(); }
        assertFalse(worker.isRunning());
    }
    @Test void failedRecoveryDoesNotLaunchAnExecutor() {
        var state = mock(TaskStateStore.class); var execution = mock(TaskExecutionService.class);
        doThrow(new IllegalStateException("database unavailable")).when(state).failRunning(anyString(), anyString());
        var worker = new TaskWorker(state, execution);
        assertThrows(IllegalStateException.class, worker::start); assertFalse(worker.isRunning()); verifyNoInteractions(execution);
    }
}
