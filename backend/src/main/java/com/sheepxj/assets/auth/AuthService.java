package com.sheepxj.assets.auth;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.Credentials;
import com.sheepxj.assets.persistence.mapper.UserMapper;
import com.sheepxj.assets.persistence.model.UserRecord;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
public class AuthService {
    private final UserMapper users;
    private final CredentialValidator validator;
    private final PasswordEncoder encoder;
    private final String dummyHash;

    public AuthService(UserMapper users, CredentialValidator validator, PasswordEncoder encoder) {
        this.users = users;
        this.validator = validator;
        this.encoder = encoder;
        this.dummyHash = encoder.encode(UUID.randomUUID().toString());
    }

    @Transactional
    public UserRecord register(Credentials input) {
        var credentials = validator.normalize(input);
        var user = new UserRecord(UUID.randomUUID().toString(), credentials.username(),
                encoder.encode(credentials.password()), Instant.now().truncatedTo(ChronoUnit.MICROS));
        try { users.insert(user); }
        catch (DuplicateKeyException exception) {
            throw new ApiException(HttpStatus.CONFLICT, "USERNAME_TAKEN", "该用户名已被使用", Map.of("username", "该用户名已被使用"));
        }
        return user;
    }

    public UserRecord authenticate(Credentials input) {
        var credentials = validator.normalize(input);
        var user = users.findByUsername(credentials.username());
        boolean matches = encoder.matches(credentials.password(), user == null ? dummyHash : user.passwordHash());
        if (user == null || !matches) throw new ApiException(HttpStatus.UNAUTHORIZED, "BAD_CREDENTIALS", "用户名或密码不正确");
        return user;
    }
}
