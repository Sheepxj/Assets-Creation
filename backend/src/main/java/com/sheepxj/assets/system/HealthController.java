package com.sheepxj.assets.system;

import com.sheepxj.assets.common.ApiException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.boot.availability.ApplicationAvailability;
import org.springframework.boot.availability.ReadinessState;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final SystemMapper mapper;
    private final ApplicationAvailability availability;

    public HealthController(SystemMapper mapper, ApplicationAvailability availability) {
        this.mapper = mapper; this.availability = availability;
    }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        // ACCEPTING_TRAFFIC is published after synchronous ApplicationReadyEvent listeners,
        // including the worker's recovery transaction, have finished.
        if (availability.getReadinessState() != ReadinessState.ACCEPTING_TRAFFIC) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "SERVICE_NOT_READY", "服务尚未就绪，请稍后重试");
        }
        try {
            if (mapper.ping() != 1) throw new IllegalStateException("Unexpected database health response");
            return Map.of("status", "UP", "service", "assets-creation-api", "database", "UP");
        } catch (DataAccessException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库暂时不可用");
        }
    }
}
