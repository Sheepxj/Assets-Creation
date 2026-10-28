package com.sheepxj.assets.task;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.*;
import com.sheepxj.assets.persistence.mapper.TaskMapper;
import com.sheepxj.assets.persistence.mapper.TaskStepMapper;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.security.CurrentUser;
import com.sheepxj.assets.storage.FileStorage;
import java.nio.file.Path;
import java.util.List;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@Transactional(readOnly = true)
public class TaskQueryService {
    private final TaskMapper tasks;
    private final TaskStepMapper steps;
    private final CurrentUser user;
    private final FileStorage storage;

    public TaskQueryService(TaskMapper tasks, TaskStepMapper steps, CurrentUser user, FileStorage storage) {
        this.tasks = tasks; this.steps = steps; this.user = user; this.storage = storage;
    }

    public TaskDto detail(String id) { return dto(require(id)); }
    public List<TaskDto> active() { return tasks.findActiveByUserId(user.require().id()).stream().map(this::dto).toList(); }
    public PageResponse<TaskDto> history(int page, int pageSize, TaskStatus status) {
        if (page < 1 || pageSize < 1 || pageSize > 100) throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_PAGINATION", "page 至少为 1，pageSize 必须在 1～100 之间");
        String id = user.require().id();
        long total = tasks.countByUserId(id, status);
        var items = tasks.findByUserId(id, status, pageSize, ((long) page - 1) * pageSize).stream().map(this::dto).toList();
        return new PageResponse<>(items, page, pageSize, total);
    }

    public record Result(Path path, String mimeType, String filename) { }
    public Result result(String id) {
        var task = require(id);
        if (task.status() != TaskStatus.SUCCEEDED || task.resultPath() == null) throw missing();
        boolean png = task.resultPath().endsWith(".png");
        return new Result(storage.readable(task.resultPath()), png ? "image/png" : "image/jpeg", id + (png ? ".png" : ".jpg"));
    }

    private TaskRecord require(String id) {
        var task = tasks.findByIdAndUserId(id, user.require().id());
        if (task == null) throw missing();
        return task;
    }

    private TaskDto dto(TaskRecord task) {
        var taskSteps = steps.findByTaskId(task.id()).stream().map(step -> new TaskStepDto(step.stage(), step.status(),
                step.startedAt(), step.finishedAt(), step.errorCode(), step.errorMessage())).toList();
        return new TaskDto(task.id(), task.templateId(), task.templateTitle(), task.status(), task.currentStage(), taskSteps,
                task.createdAt(), task.startedAt(), task.finishedAt(), task.status() == TaskStatus.SUCCEEDED ? "/api/tasks/" + task.id() + "/result" : null,
                task.errorCode(), task.errorMessage());
    }
    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在"); }
}
