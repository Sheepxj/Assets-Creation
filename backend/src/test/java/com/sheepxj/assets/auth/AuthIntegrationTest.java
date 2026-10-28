package com.sheepxj.assets.auth;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.contract.ApiContracts.Credentials;
import com.sheepxj.assets.contract.ApiContracts.TaskStatus;
import com.sheepxj.assets.persistence.mapper.AssetMapper;
import com.sheepxj.assets.persistence.mapper.TaskMapper;
import com.sheepxj.assets.persistence.mapper.UserMapper;
import com.sheepxj.assets.persistence.model.AssetRecord;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.security.OwnedResources;
import com.sheepxj.assets.security.UserIdentity;
import java.time.Instant;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.TimeUnit;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestComponent;
import org.springframework.context.annotation.Import;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.core.context.SecurityContext;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.web.context.HttpSessionSecurityContextRepository;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@ActiveProfiles("smoke")
@Import(AuthIntegrationTest.OwnershipProbe.class)
@EnabledIfEnvironmentVariable(named = "RUN_DATABASE_TESTS", matches = "true")
class AuthIntegrationTest {
    private static final String A = "10000000-0000-4000-8000-000000000001";
    private static final String B = "10000000-0000-4000-8000-000000000002";
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private UserMapper users;
    @Autowired private AssetMapper assets;
    @Autowired private TaskMapper tasks;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private PasswordEncoder encoder;
    private final Set<String> createdNames = ConcurrentHashMap.newKeySet();
    private final Set<String> assetIds = ConcurrentHashMap.newKeySet();
    private final Set<String> taskIds = ConcurrentHashMap.newKeySet();

    @AfterEach
    void cleanCommittedTestRows() {
        taskIds.forEach(id -> jdbc.update("DELETE FROM tasks WHERE id=?", id));
        assetIds.forEach(id -> jdbc.update("DELETE FROM assets WHERE id=?", id));
        createdNames.forEach(name -> jdbc.update("DELETE FROM users WHERE username=?", name));
    }

    @Test
    void registrationCommitsHashAutoLogsInAndIgnoresClientIdentity() throws Exception {
        String name = name();
        var client = new Client().csrf();
        String anonymousId = client.session.getId();
        var result = client.write("/api/auth/register", Map.of("username", "  " + name.toUpperCase() + "  ",
                "password", "Register123!", "userId", B, "id", B));
        assertEquals(201, result.getResponse().getStatus());
        var body = json.readTree(result.getResponse().getContentAsString());
        assertEquals(2, body.size());
        assertEquals(name, body.get("username").asText());
        assertNotEquals(B, body.get("id").asText());
        assertNotEquals(anonymousId, client.session.getId());
        var stored = users.findByUsername(name);
        assertTrue(encoder.matches("Register123!", stored.passwordHash()));
        assertNotEquals("Register123!", stored.passwordHash());
        assertEquals(stored.id(), body.get("id").asText());
        mvc.perform(get("/api/auth/me").session(client.session).param("userId", B))
                .andExpect(status().isOk()).andExpect(jsonPath("$.id").value(stored.id()))
                .andExpect(jsonPath("$.passwordHash").doesNotExist());
    }

    @Test
    void seededAccountLoginNormalizesUsernameAndPersistsAcrossRequests() throws Exception {
        var client = login("  DEMO_A  ");
        mvc.perform(get("/api/auth/me").session(client.session)).andExpect(status().isOk())
                .andExpect(jsonPath("$.id").value(A)).andExpect(jsonPath("$.username").value("demo_a"));
        var context = (SecurityContext) client.session.getAttribute(HttpSessionSecurityContextRepository.SPRING_SECURITY_CONTEXT_KEY);
        assertInstanceOf(UserIdentity.class, context.getAuthentication().getPrincipal());
        assertNull(context.getAuthentication().getCredentials());
    }

    @Test
    void nonexistentUserAndWrongPasswordUseTheSameError() throws Exception {
        var client = new Client().csrf();
        var first = client.write("/api/auth/login", new Credentials("demo_a", "Incorrect123!"));
        var second = client.write("/api/auth/login", new Credentials("missing_" + UUID.randomUUID().toString().replace("-", "").substring(0, 12), "Incorrect123!"));
        assertEquals(401, first.getResponse().getStatus());
        assertEquals(401, second.getResponse().getStatus());
        assertEquals(first.getResponse().getContentAsString(), second.getResponse().getContentAsString());
        assertEquals("BAD_CREDENTIALS", json.readTree(first.getResponse().getContentAsString()).get("code").asText());
    }

    @Test
    void invalidInputsHaveFieldFeedbackAndNeverEchoPasswords() throws Exception {
        var client = new Client().csrf();
        String secret = "密".repeat(25);
        var result = client.write("/api/auth/register", new Credentials("ab", secret));
        assertEquals(400, result.getResponse().getStatus());
        var body = json.readTree(result.getResponse().getContentAsString());
        assertTrue(body.get("fieldErrors").has("username"));
        assertTrue(body.get("fieldErrors").has("password"));
        assertFalse(result.getResponse().getContentAsString().contains(secret));
        mvc.perform(post("/api/auth/login").session(client.session).header(client.header, client.token)
                .contentType("application/json").content("{bad-json"))
                .andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("INVALID_JSON"));
    }

    @Test
    void utf8PasswordBoundariesAreAcceptedByTheRealEncoderWithoutTruncation() throws Exception {
        for (String password : new String[]{"p".repeat(72), "密".repeat(24), "😀".repeat(18)}) {
            String name = name();
            var client = new Client().csrf();
            assertEquals(201, client.write("/api/auth/register", new Credentials(name, password)).getResponse().getStatus());
            assertTrue(encoder.matches(password, users.findByUsername(name).passwordHash()));
            assertEquals(200, new Client().csrf().write("/api/auth/login", new Credentials(name, password)).getResponse().getStatus());
        }
        for (String password : new String[]{"p".repeat(73), "密".repeat(25), "😀".repeat(19)}) {
            String name = name();
            assertEquals(400, new Client().csrf().write("/api/auth/register", new Credentials(name, password)).getResponse().getStatus());
            assertNull(users.findByUsername(name));
        }
    }

    @Test
    void duplicateNormalizedUsernameReturnsConflictWithoutReplacingTheUser() throws Exception {
        String name = name();
        var first = new Client().csrf();
        assertEquals(201, first.write("/api/auth/register", new Credentials(name, "Register123!")).getResponse().getStatus());
        String hash = users.findByUsername(name).passwordHash();
        var result = new Client().csrf().write("/api/auth/register", new Credentials(" " + name.toUpperCase() + " ", "Different123!"));
        assertEquals(409, result.getResponse().getStatus());
        assertEquals("USERNAME_TAKEN", json.readTree(result.getResponse().getContentAsString()).get("code").asText());
        assertEquals(hash, users.findByUsername(name).passwordHash());
    }

    @Test
    void concurrentRegistrationCreatesExactlyOneCommittedUser() throws Exception {
        String name = name();
        var first = new Client().csrf(); var second = new Client().csrf();
        var start = new CountDownLatch(1);
        try (var executor = Executors.newFixedThreadPool(2)) {
            var one = executor.submit(() -> { start.await(); return first.write("/api/auth/register", new Credentials(name, "Register123!")).getResponse().getStatus(); });
            var two = executor.submit(() -> { start.await(); return second.write("/api/auth/register", new Credentials(name.toUpperCase(), "Register123!")).getResponse().getStatus(); });
            start.countDown();
            assertEquals(Set.of(201, 409), Set.of(one.get(20, TimeUnit.SECONDS), two.get(20, TimeUnit.SECONDS)));
        }
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE username=?", Integer.class, name));
    }

    @Test
    void authenticationClearsOldCsrfAndRefreshAllowsTheNextWrite() throws Exception {
        var client = new Client().csrf();
        String oldToken = client.token;
        assertEquals(200, client.write("/api/auth/login", new Credentials("demo_a", "Demo123456!")).getResponse().getStatus());
        assertEquals(403, client.write("/api/auth/logout", Map.of()).getResponse().getStatus());
        client.csrf();
        assertNotEquals(oldToken, client.token);
        assertEquals(204, client.write("/api/auth/logout", Map.of()).getResponse().getStatus());
    }

    @Test
    void logoutInvalidatesContextSessionCookieAndAllowsFreshLogin() throws Exception {
        var client = login("demo_a");
        var old = client.session;
        var result = client.write("/api/auth/logout", Map.of());
        assertEquals(204, result.getResponse().getStatus());
        assertEquals("", result.getResponse().getContentAsString());
        assertTrue(old.isInvalid());
        assertTrue(result.getResponse().getHeaders("Set-Cookie").stream().anyMatch(value -> value.startsWith("JSESSIONID=") && value.contains("Max-Age=0")));
        mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
        client.csrf();
        assertNotEquals(old.getId(), client.session.getId());
        assertEquals(200, client.write("/api/auth/login", new Credentials("demo_b", "Demo123456!")).getResponse().getStatus());
    }

    @Test
    void switchingAccountsRotatesSessionAndReplacesOnlyTheCurrentIdentity() throws Exception {
        var client = login("demo_a");
        String oldId = client.session.getId();
        assertEquals(200, client.write("/api/auth/login", new Credentials("demo_b", "Demo123456!")).getResponse().getStatus());
        assertNotEquals(oldId, client.session.getId());
        mvc.perform(get("/api/auth/me").session(client.session)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(B));
    }

    @Test
    void failedReauthenticationDoesNotOverwriteAnExistingLogin() throws Exception {
        var client = login("demo_a");
        String id = client.session.getId();
        assertEquals(401, client.write("/api/auth/login", new Credentials("demo_b", "Incorrect123!")).getResponse().getStatus());
        assertEquals(id, client.session.getId());
        mvc.perform(get("/api/auth/me").session(client.session)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(A));
    }

    @Test
    void csrfIsRequiredForRegistrationLoginLogoutAndMultipart() throws Exception {
        var client = new Client().csrf();
        for (String path : new String[]{"/api/auth/register", "/api/auth/login"}) {
            mvc.perform(post(path).session(client.session).contentType("application/json").content("{}"))
                    .andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("FORBIDDEN"));
        }
        var logged = login("demo_a");
        mvc.perform(post("/api/auth/logout").session(logged.session)).andExpect(status().isForbidden());
        var file = new MockMultipartFile("file", "probe.png", "image/png", new byte[]{1, 2, 3});
        mvc.perform(multipart("/api/_smoke/upload").file(file).session(logged.session)).andExpect(status().isForbidden());
        mvc.perform(multipart("/api/_smoke/upload").file(file).session(logged.session).header(logged.header, logged.token))
                .andExpect(status().isOk()).andExpect(jsonPath("$.sizeBytes").value(3));
        mvc.perform(get("/api/auth/me").session(logged.session)).andExpect(status().isOk());
    }

    @Test
    void assetsAndTasksUseAuthenticatedOwnerRatherThanRequestUserId() throws Exception {
        String assetId = UUID.randomUUID().toString(); assetIds.add(assetId);
        assets.insert(new AssetRecord(assetId, A, "probe.png", "image/png", 3, "uploads/probe.png", Instant.now()));
        String taskId = UUID.randomUUID().toString(); taskIds.add(taskId);
        tasks.insert(new TaskRecord(taskId, A, "coastal-memory", "海岸假日", UUID.randomUUID().toString(), "f".repeat(64),
                TaskStatus.QUEUED, null, "{}", Instant.now(), null, null, null, null, null));
        var a = login("demo_a"); var b = login("demo_b");
        for (String path : new String[]{"/api/_test/ownership/assets/" + assetId, "/api/_test/ownership/tasks/" + taskId}) {
            mvc.perform(get(path).session(a.session)).andExpect(status().isOk());
            mvc.perform(get(path).session(b.session).param("userId", A))
                    .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        }
        mvc.perform(get("/api/_test/ownership/assets/" + UUID.randomUUID()).session(a.session))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test
    void independentUsersAndLogoutDoNotAffectEachOthersSessions() throws Exception {
        var a = login("demo_a"); var b = login("demo_b");
        assertEquals(204, a.write("/api/auth/logout", Map.of()).getResponse().getStatus());
        mvc.perform(get("/api/auth/me").session(b.session)).andExpect(status().isOk()).andExpect(jsonPath("$.id").value(B));
    }

    @Test
    void publicReadsAndProtectedResourcesHaveCorrectJsonBoundaries() throws Exception {
        for (String path : new String[]{"/api/auth/me", "/api/assets/unknown/content", "/api/tasks/unknown/result"}) {
            mvc.perform(get(path)).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHENTICATED"));
        }
        for (String path : new String[]{"/api/templates", "/api/demo/covers/unknown.jpg"}) mvc.perform(get(path)).andExpect(status().isNotFound());
        var anonymous = new Client().csrf();
        assertEquals(401, anonymous.write("/api/auth/logout", Map.of()).getResponse().getStatus());
    }

    private String name() {
        String name = "p2_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20);
        createdNames.add(name);
        return name;
    }

    private Client login(String username) throws Exception {
        var client = new Client().csrf();
        assertEquals(200, client.write("/api/auth/login", new Credentials(username, "Demo123456!")).getResponse().getStatus());
        return client.csrf();
    }

    private class Client {
        MockHttpSession session;
        String token;
        String header;

        Client csrf() throws Exception {
            var request = get("/api/auth/csrf");
            if (session != null && !session.isInvalid()) request.session(session);
            var result = mvc.perform(request).andExpect(status().isOk()).andReturn();
            session = (MockHttpSession) result.getRequest().getSession(false);
            var body = json.readTree(result.getResponse().getContentAsString());
            token = body.get("token").asText(); header = body.get("headerName").asText();
            return this;
        }

        MvcResult write(String path, Object body) throws Exception {
            return mvc.perform(post(path).session(session).header(header, token).contentType("application/json")
                    .content(json.writeValueAsString(body))).andReturn();
        }
    }

    @TestComponent
    @RestController
    static class OwnershipProbe {
        private final OwnedResources resources;
        OwnershipProbe(OwnedResources resources) { this.resources = resources; }
        @GetMapping("/api/_test/ownership/assets/{id}")
        Map<String, String> asset(@PathVariable String id) { return Map.of("id", resources.requireAsset(id).id()); }
        @GetMapping("/api/_test/ownership/tasks/{id}")
        Map<String, String> task(@PathVariable String id) { return Map.of("id", resources.requireTask(id).id()); }
    }
}
