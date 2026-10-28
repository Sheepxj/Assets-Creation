package com.sheepxj.assets.auth;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.Credentials;
import java.nio.charset.StandardCharsets;
import java.util.LinkedHashMap;
import java.util.Locale;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class CredentialValidator {
    public Credentials normalize(Credentials input) {
        var errors = new LinkedHashMap<String, String>();
        String username = input == null || input.username() == null ? "" : input.username().strip().toLowerCase(Locale.ROOT);
        String password = input == null ? null : input.password();
        if (!username.matches("[a-z0-9_]{3,32}")) errors.put("username", "用户名需为 3～32 位英文字母、数字或下划线");
        if (password == null || password.codePointCount(0, password.length()) < 8) {
            errors.put("password", "密码至少需要 8 个字符");
        } else if (password.getBytes(StandardCharsets.UTF_8).length > 72) {
            errors.put("password", "密码的 UTF-8 长度不能超过 72 字节");
        }
        if (!errors.isEmpty()) throw new ApiException(HttpStatus.BAD_REQUEST, "VALIDATION_ERROR", "请检查输入内容", errors);
        return new Credentials(username, password);
    }
}
