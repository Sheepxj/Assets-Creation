package com.sheepxj.assets.task;

import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.storage.FileStorage;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.AfterEach;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;

class TaskWorkerTest {
    @AfterEach void noWorkerThreadSurvivesItsTest() {
        assertTrue(Thread.getAllStackTraces().keySet().stream().noneMatch(thread -> thread.isAlive() && thread.getName().equals("asset-task-worker")));
    }
    @Test void shutdownDuringPollMustNotClaimAnotherTask() throws Exception {
        var state = mock(TaskStateStore.class);
        var entered = new CountDownLatch(1); var release = new CountDownLatch(1);
        doAnswer(call -> { entered.countDown(); assertTrue(release.await(5, TimeUnit.SECONDS)); return null; })
                .when(state).failRunning(eq("STATE_PERSISTENCE_FAILED"), anyString());
        var execution = new TaskExecutionService(state, mock(TaskStages.class), mock(TaskConfiguration.Delay.class), new ObjectMapper(), mock(FileStorage.class));
        var worker = new TaskWorker(state, execution);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            worker.start();
            try {
                assertTrue(entered.await(3, TimeUnit.SECONDS));
                var stopping = pool.submit(() -> { worker.stop(); });
                long deadline = System.nanoTime() + TimeUnit.SECONDS.toNanos(3);
                while (worker.isRunning() && System.nanoTime() < deadline) Thread.sleep(5);
                assertFalse(worker.isRunning());
                release.countDown();
                stopping.get(3, TimeUnit.SECONDS);
                verify(state, never()).claimNext();
            } finally { release.countDown(); worker.stop(); }
        }
    }

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
