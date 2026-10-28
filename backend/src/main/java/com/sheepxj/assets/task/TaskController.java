package com.sheepxj.assets.task;

import com.sheepxj.assets.contract.ApiContracts.*;
import java.util.List;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/tasks")
public class TaskController {
    private final TaskService service;
    private final TaskQueryService queries;
    public TaskController(TaskService service, TaskQueryService queries) { this.service = service; this.queries = queries; }

    @PostMapping
    @ResponseStatus(HttpStatus.ACCEPTED)
    public TaskDto create(@RequestBody CreateTaskRequest request) { return service.create(request); }
    @GetMapping
    public PageResponse<TaskDto> history(@RequestParam(defaultValue = "1") int page, @RequestParam(defaultValue = "20") int pageSize,
            @RequestParam(required = false) TaskStatus status) { return queries.history(page, pageSize, status); }
    @GetMapping("/active") public List<TaskDto> active() { return queries.active(); }
    @GetMapping("/{id}") public TaskDto detail(@PathVariable String id) { return queries.detail(id); }
    @GetMapping("/{id}/result")
    public ResponseEntity<Resource> result(@PathVariable String id) {
        var result = queries.result(id);
        return ResponseEntity.ok().cacheControl(CacheControl.noStore()).contentType(MediaType.parseMediaType(result.mimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(result.filename()).build().toString())
                .body(new FileSystemResource(result.path()));
    }
}
