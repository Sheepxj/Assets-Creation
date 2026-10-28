package com.sheepxj.assets.system;

import com.sheepxj.assets.common.ApiException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import java.security.MessageDigest;
import java.util.Base64;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.context.annotation.Profile;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Temporary infrastructure probes: registered only with the explicit smoke profile. */
@Profile("smoke")
@RestController
@RequestMapping("/api/_smoke")
public class SmokeController {
    private static final byte[] PNG = Base64.getDecoder().decode(
            "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=");

    @GetMapping("/cookies")
    public Map<String, Boolean> cookies(HttpServletResponse response) {
        response.addHeader("Set-Cookie", "smoke_one=one; Path=/; HttpOnly; SameSite=Lax");
        response.addHeader("Set-Cookie", "smoke_two=two; Path=/; HttpOnly; SameSite=Lax");
        return Map.of("ok", true);
    }

    @PostMapping("/echo")
    public Map<String, Object> echo(@RequestBody Map<String, Object> body, HttpServletRequest request) {
        return Map.of("body", body, "sessionPresent", request.getSession(false) != null);
    }

    @PostMapping("/upload")
    public Map<String, Object> upload(@RequestParam("file") MultipartFile file) throws Exception {
        return Map.of("sizeBytes", file.getSize(), "mimeType", file.getContentType(),
                "sha256", HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(file.getBytes())));
    }

    @GetMapping(value = "/file", produces = MediaType.IMAGE_PNG_VALUE)
    public byte[] file() { return PNG.clone(); }

    @GetMapping("/error")
    public ResponseEntity<Void> error() {
        throw new ApiException(HttpStatus.BAD_REQUEST, "SMOKE_ERROR", "可预期的转发验证错误");
    }

    @GetMapping("/delay")
    public Map<String, Boolean> delay(@RequestParam(defaultValue = "0") long milliseconds) throws InterruptedException {
        if (milliseconds < 0 || milliseconds > 15000) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_DELAY", "延迟必须在 0～15000 毫秒之间");
        }
        Thread.sleep(milliseconds);
        return Map.of("ok", true);
    }
}
