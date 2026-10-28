package com.sheepxj.assets.task;

import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.SmartLifecycle;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

@Component
@ConditionalOnProperty(name = "app.worker.enabled", havingValue = "true", matchIfMissing = true)
public class TaskWorker implements SmartLifecycle {
    private static final Logger log = LoggerFactory.getLogger(TaskWorker.class);
    private final TaskStateStore state;
    private final TaskExecutionService execution;
    private volatile boolean running;
    private ScheduledExecutorService executor;

    public TaskWorker(TaskStateStore state, TaskExecutionService execution) { this.state = state; this.execution = execution; }

    @Override public boolean isAutoStartup() { return false; }
    @Override public int getPhase() { return Integer.MAX_VALUE; }
    @Override public boolean isRunning() { return running; }

    @EventListener(ApplicationReadyEvent.class)
    public void ready() { start(); }

    @Override
    public synchronized void start() {
        if (running) return;
        // Recovery must commit before the first queue poll. Failure here fails startup rather than serving an unrecovered worker.
        state.failRunning("SERVICE_RESTARTED", "服务重启导致制作中断");
        execution.startAccepting();
        executor = Executors.newSingleThreadScheduledExecutor(task -> {
            var thread = new Thread(task, "asset-task-worker"); thread.setDaemon(true); return thread;
        });
        running = true;
        executor.scheduleWithFixedDelay(this::poll, 0, 300, TimeUnit.MILLISECONDS);
    }

    private void poll() {
        if (!running) return;
        try { execution.runNextTask(); }
        catch (Exception exception) { log.error("Task queue poll failed; the next poll will retry persistence before claiming more tasks", exception); }
    }

    @Override
    public synchronized void stop() {
        execution.stopAccepting();
        running = false;
        if (executor == null) return;
        executor.shutdown();
        try {
            if (!executor.awaitTermination(10, TimeUnit.SECONDS)) {
                executor.shutdownNow();
                if (!executor.awaitTermination(5, TimeUnit.SECONDS)) log.warn("Worker did not stop within shutdown window; process termination and startup recovery are required");
            }
        } catch (InterruptedException exception) { executor.shutdownNow(); Thread.currentThread().interrupt(); }
    }
}
