package com.sheepxj.assets.system;

import com.sheepxj.assets.common.ApiException;
import java.util.Map;
import org.springframework.dao.DataAccessException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class HealthController {
    private final SystemMapper mapper;

    public HealthController(SystemMapper mapper) { this.mapper = mapper; }

    @GetMapping("/api/health")
    public Map<String, String> health() {
        try {
            if (mapper.ping() != 1) throw new IllegalStateException("Unexpected database health response");
            return Map.of("status", "UP", "service", "assets-creation-api", "database", "UP");
        } catch (DataAccessException exception) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "DATABASE_UNAVAILABLE", "数据库暂时不可用");
        }
    }
}
