package com.sheepxj.assets.auth;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.Credentials;
import java.util.Arrays;
import org.junit.jupiter.api.Test;

import static org.junit.jupiter.api.Assertions.*;

class CredentialValidatorTest {
    private final CredentialValidator validator = new CredentialValidator();

    @Test
    void normalizationUsesOneUsernameRuleAndDoesNotTrimPasswords() {
        var input = validator.normalize(new Credentials("  DeMo_A　", "  password!  "));
        assertEquals("demo_a", input.username());
        assertEquals("  password!  ", input.password());
    }

    @Test
    void invalidNamesProduceFieldErrors() {
        for (String username : Arrays.asList(null, "", "ab", "a".repeat(33), "中文账号", "bad-name", "test@example.com")) {
            var exception = assertThrows(ApiException.class, () -> validator.normalize(new Credentials(username, "password!")));
            assertEquals(400, exception.status().value());
            assertTrue(exception.fieldErrors().containsKey("username"));
        }
    }

    @Test
    void passwordsUseCodePointsAndUtf8ByteLimitWithoutTruncation() {
        for (String password : new String[]{"12345678", "p".repeat(72), "密".repeat(24), "😀".repeat(18)}) {
            assertEquals(password, validator.normalize(new Credentials("valid_user", password)).password());
        }
        for (String password : new String[]{"1234567", "p".repeat(73), "密".repeat(25), "😀".repeat(19), "😀".repeat(7)}) {
            var exception = assertThrows(ApiException.class, () -> validator.normalize(new Credentials("valid_user", password)));
            assertTrue(exception.fieldErrors().containsKey("password"));
        }
    }

    @Test
    void missingCredentialsReportBothRequiredFields() {
        for (Credentials input : Arrays.asList(null, new Credentials(null, null))) {
            assertEquals(2, assertThrows(ApiException.class, () -> validator.normalize(input)).fieldErrors().size());
        }
    }

    @Test
    void credentialDiagnosticTextRedactsThePassword() {
        assertFalse(new Credentials("demo_a", "private-password").toString().contains("private-password"));
    }
}
