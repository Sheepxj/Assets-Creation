package com.sheepxj.assets.task;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.contract.ApiContracts.*;
import com.sheepxj.assets.persistence.mapper.TaskStepMapper;
import com.sheepxj.assets.persistence.mapper.TaskMapper;
import com.sheepxj.assets.persistence.model.TaskStepRecord;
import com.sheepxj.assets.storage.FileStorage;
import java.nio.file.*;
import java.util.*;
import java.util.concurrent.*;
import org.junit.jupiter.api.*;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.EnumSource;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.*;
import org.springframework.test.context.*;
import org.springframework.test.context.bean.override.mockito.*;
import org.springframework.test.web.servlet.*;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;
import static org.mockito.ArgumentMatchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "RUN_DATABASE_TESTS", matches = "true")
class TaskIntegrationTest {
    private static Path root;
    @DynamicPropertySource static void storage(DynamicPropertyRegistry registry) throws Exception {
        root = Files.createTempDirectory("assets-p4-it-"); registry.add("app.storage-root", root::toString);
    }
    @Autowired MockMvc mvc;
    @Autowired ObjectMapper json;
    @Autowired JdbcTemplate jdbc;
    @Autowired TaskExecutionService execution;
    @Autowired TaskStateStore state;
    @Autowired FileStorage files;
    @MockitoBean TaskConfiguration.Delay delay;
    @MockitoSpyBean TaskStepMapper stepMapper;
    @MockitoSpyBean TaskMapper taskMapper;
    private Session user;
    private String userId;
    private record Session(MockHttpSession cookie, String token, String header) { }

    @BeforeEach void register() throws Exception {
        var anonymous = csrf(null);
        var result = mvc.perform(post("/api/auth/register").session(anonymous.cookie).header(anonymous.header, anonymous.token).contentType("application/json")
                .content(json.writeValueAsString(Map.of("username", "p4_" + UUID.randomUUID().toString().replace("-", "").substring(0, 20), "password", "TaskDemo123!"))))
                .andExpect(status().isCreated()).andReturn();
        userId = body(result).get("id").asText(); user = csrf(anonymous.cookie);
    }
    @AfterEach void removeOnlyThisTestsUser() {
        if (userId == null) return;
        jdbc.update("DELETE s FROM task_steps s JOIN tasks t ON t.id=s.task_id WHERE t.user_id=?", userId);
        jdbc.update("DELETE FROM task_assets WHERE user_id=?", userId);
        jdbc.update("DELETE FROM tasks WHERE user_id=?", userId);
        jdbc.update("DELETE FROM assets WHERE user_id=?", userId);
        jdbc.update("DELETE FROM users WHERE id=?", userId);
    }
    @AfterAll static void cleanTemporaryFiles() throws Exception {
        if (root != null) try (var paths = Files.walk(root)) { for (var path : paths.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path); }
    }

    @Test void acceptanceIsAtomicQueuedAndQueriesNeverDriveExecution() throws Exception {
        var task = create("coastal-memory", List.of(asset()), UUID.randomUUID().toString());
        assertEquals("QUEUED", task.get("status").asText()); assertTrue(task.get("currentStage").isNull());
        for (var step : task.get("steps")) assertEquals("PENDING", step.get("status").asText());
        assertEquals(3, task.get("steps").size());
        assertEquals(1, jdbc.queryForObject("SELECT COUNT(*) FROM task_assets WHERE task_id=?", Integer.class, id(task)));
        var snapshot = json.readTree(jdbc.queryForObject("SELECT simulation_config_json FROM tasks WHERE id=?", String.class, id(task)));
        assertEquals(2000, snapshot.get("checkDelayMs").asInt()); assertEquals("NONE", snapshot.get("failStage").asText());
        for (int i = 0; i < 5; i++) { assertEquals(task, detail(id(task))); getJson("/api/tasks/active"); getJson("/api/tasks"); }
        assertEquals("QUEUED", detail(id(task)).get("status").asText());
        mvc.perform(get("/api/tasks/" + id(task) + "/result").session(user.cookie)).andExpect(status().isNotFound());
        verifyNoInteractions(delay);
    }

    @Test void successfulStepsAreObservableOutsideTransactionsAndResultIsPrivate() throws Exception {
        var task = create("coastal-memory", List.of(asset()), UUID.randomUUID().toString());
        var observed = new ArrayList<String>();
        doAnswer(call -> {
            assertFalse(TransactionSynchronizationManager.isActualTransactionActive());
            var current = detail(id(task));
            assertEquals("RUNNING", current.get("status").asText());
            String stage = current.get("currentStage").asText(); observed.add(stage);
            int position = TaskStage.valueOf(stage).ordinal();
            for (int i = 0; i < 3; i++) assertEquals(i < position ? "SUCCEEDED" : i == position ? "RUNNING" : "PENDING", current.get("steps").get(i).get("status").asText());
            return null;
        }).when(delay).pause(anyLong());
        assertTrue(execution.runNextTask());
        assertEquals(List.of("MATERIAL_CHECK", "GENERATE", "FINALIZE"), observed);
        var done = detail(id(task)); assertEquals("SUCCEEDED", done.get("status").asText());
        assertEquals("FINALIZE", done.get("currentStage").asText()); assertFalse(done.get("finishedAt").isNull());
        for (var step : done.get("steps")) { assertEquals("SUCCEEDED", step.get("status").asText()); assertFalse(step.get("startedAt").isNull()); assertFalse(step.get("finishedAt").isNull()); }
        var result = mvc.perform(get(done.get("resultUrl").asText()).session(user.cookie)).andExpect(status().isOk())
                .andExpect(content().contentType("image/png")).andExpect(header().string("X-Content-Type-Options", "nosniff")).andReturn();
        assertArrayEquals(sample("results/coastal-memory.png"), result.getResponse().getContentAsByteArray());
        assertTrue(getJson("/api/tasks/active").isEmpty());
        for (int i = 0; i < 4; i++) assertEquals(done, detail(id(task)));
        assertFalse(execution.runNextTask());
        var other = loginDemoB();
        mvc.perform(post("/api/tasks").session(other.cookie).header(other.header, other.token).contentType("application/json")
                .content(json.writeValueAsString(new CreateTaskRequest("coastal-memory", List.of(jdbc.queryForObject("SELECT asset_id FROM task_assets WHERE task_id=?", String.class, id(task))), UUID.randomUUID().toString()))))
                .andExpect(status().isNotFound());
        for (String path : List.of("/api/tasks/" + id(task), done.get("resultUrl").asText())) {
            mvc.perform(get(path).session(other.cookie).param("userId", userId)).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        }
    }

    @ParameterizedTest @EnumSource(TaskStage.class)
    void everySpecifiedFailureStopsLaterStepsAndAllowsTheNextTask(TaskStage failedStage) throws Exception {
        String asset = asset(); var task = create("coastal-memory", List.of(asset), UUID.randomUUID().toString());
        snapshot(id(task), failedStage.name());
        execution.runNextTask(); var failed = detail(id(task));
        assertEquals("FAILED", failed.get("status").asText()); assertEquals(failedStage.name(), failed.get("currentStage").asText());
        assertEquals("SIMULATED_FAILURE", failed.get("errorCode").asText()); assertTrue(failed.get("resultUrl").isNull());
        for (int i = 0; i < 3; i++) assertEquals(i < failedStage.ordinal() ? "SUCCEEDED" : i == failedStage.ordinal() ? "FAILED" : "PENDING", failed.get("steps").get(i).get("status").asText());
        assertEquals(failed, detail(id(task)));
        var next = create("coastal-memory", List.of(asset), UUID.randomUUID().toString()); execution.runNextTask();
        assertEquals("SUCCEEDED", detail(id(next)).get("status").asText());
    }

    @Test void sameRequestReturnsOriginalTerminalTaskAndDifferentOrderConflicts() throws Exception {
        String first = asset(), second = asset(), key = UUID.randomUUID().toString();
        var original = create("travel-postcard", List.of(first, second), key);
        assertEquals(id(original), id(create("travel-postcard", List.of(first, second), key)));
        submit("travel-postcard", List.of(second, first), key).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("IDEMPOTENCY_CONFLICT"));
        execution.runNextTask(); var done = detail(id(original));
        assertEquals(done, create("travel-postcard", List.of(first, second), key));
        assertEquals(1, countTasks());
    }

    @Test void concurrentIdenticalRequestsCreateExactlyOneCommittedTask() throws Exception {
        String asset = asset(), key = UUID.randomUUID().toString(); var start = new CountDownLatch(1);
        try (var pool = Executors.newVirtualThreadPerTaskExecutor()) {
            Callable<String> create = () -> { start.await(); return id(create("coastal-memory", List.of(asset), key)); };
            var one = pool.submit(create); var two = pool.submit(create); start.countDown();
            assertEquals(one.get(5, TimeUnit.SECONDS), two.get(5, TimeUnit.SECONDS)); assertEquals(1, countTasks());
        }
    }

    @Test void invalidSubmissionsNeverCreatePartialTasks() throws Exception {
        String asset = asset();
        submit("missing", List.of(asset), UUID.randomUUID().toString()).andExpect(status().isNotFound());
        submit("travel-postcard", List.of(asset), UUID.randomUUID().toString()).andExpect(status().isBadRequest());
        submit("travel-postcard", List.of(asset, asset), UUID.randomUUID().toString()).andExpect(status().isBadRequest());
        submit("coastal-memory", List.of("missing"), UUID.randomUUID().toString()).andExpect(status().isNotFound());
        submit("coastal-memory", List.of(asset), "invalid").andExpect(status().isBadRequest());
        assertEquals(0, countTasks());
    }

    @Test void stricterTemplateRequirementsAreRecheckedAtSubmission() throws Exception {
        String asset = asset();
        jdbc.update("UPDATE templates SET max_file_size_bytes=1 WHERE id='coastal-memory'");
        try { submit("coastal-memory", List.of(asset), UUID.randomUUID().toString()).andExpect(status().isBadRequest()); }
        finally { jdbc.update("UPDATE templates SET max_file_size_bytes=5242880 WHERE id='coastal-memory'"); }
        assertEquals(0, countTasks());
    }

    @Test void taskTitleIsASnapshotAndBodyCannotChooseAnotherUserOrSimulation() throws Exception {
        String asset = asset();
        var task = body(mvc.perform(post("/api/tasks").session(user.cookie).header(user.header, user.token).contentType("application/json")
                .content(json.writeValueAsString(Map.of("templateId", "coastal-memory", "assetIds", List.of(asset), "requestId", UUID.randomUUID().toString(),
                        "userId", "10000000-0000-4000-8000-000000000002", "simulationConfigJson", "forged"))))
                .andExpect(status().isAccepted()).andReturn());
        assertEquals(userId, jdbc.queryForObject("SELECT user_id FROM tasks WHERE id=?", String.class, id(task)));
        String title = task.get("templateTitle").asText();
        jdbc.update("UPDATE templates SET title='changed after submission' WHERE id='coastal-memory'");
        try { assertEquals(title, detail(id(task)).get("templateTitle").asText()); }
        finally { jdbc.update("UPDATE templates SET title=? WHERE id='coastal-memory'", title); }
        assertEquals("NONE", json.readTree(jdbc.queryForObject("SELECT simulation_config_json FROM tasks WHERE id=?", String.class, id(task))).get("failStage").asText());
    }

    @Test void missingFileAtSubmissionIsNotAccepted() throws Exception {
        String asset = asset(); var path = jdbc.queryForObject("SELECT storage_path FROM assets WHERE id=?", String.class, asset);
        files.removeAfterFailure(path);
        submit("coastal-memory", List.of(asset), UUID.randomUUID().toString()).andExpect(status().isNotFound()); assertEquals(0, countTasks());
    }

    @Test void materialDisappearingAfterAcceptanceFailsOnlyItsTask() throws Exception {
        String asset = asset(); var task = create("coastal-memory", List.of(asset), UUID.randomUUID().toString());
        files.removeAfterFailure(jdbc.queryForObject("SELECT storage_path FROM assets WHERE id=?", String.class, asset));
        execution.runNextTask(); var failed = detail(id(task));
        assertEquals("MATERIAL_CHECK_FAILED", failed.get("errorCode").asText()); assertEquals("PENDING", failed.get("steps").get(1).get("status").asText());
    }

    @Test void corruptStoredContentIsRecheckedDuringExecution() throws Exception {
        String asset = asset(); var task = create("coastal-memory", List.of(asset), UUID.randomUUID().toString());
        var path = files.readable(jdbc.queryForObject("SELECT storage_path FROM assets WHERE id=?", String.class, asset));
        Files.write(path, new byte[(int) Files.size(path)]);
        execution.runNextTask(); assertEquals("MATERIAL_CHECK_FAILED", detail(id(task)).get("errorCode").asText());
    }

    @Test void resultWriteFailureCannotProduceSuccess() throws Exception {
        var task = create("coastal-memory", List.of(asset()), UUID.randomUUID().toString());
        Files.createDirectories(root.resolve("results").resolve(userId).resolve(id(task) + ".png"));
        execution.runNextTask(); var failed = detail(id(task));
        assertEquals("FINALIZE_FAILED", failed.get("errorCode").asText()); assertEquals("FAILED", failed.get("steps").get(2).get("status").asText());
        assertTrue(failed.get("resultUrl").isNull());
    }

    @Test void creationRollsBackTaskLinksAndStepsWhenALateInsertFails() throws Exception {
        doThrow(new DataAccessResourceFailureException("injected insert failure")).when(stepMapper).insert(argThat(step -> step.stage() == TaskStage.FINALIZE));
        submit("coastal-memory", List.of(asset()), UUID.randomUUID().toString()).andExpect(status().isInternalServerError());
        assertEquals(0, countTasks()); assertEquals(0, jdbc.queryForObject("SELECT COUNT(*) FROM task_assets WHERE user_id=?", Integer.class, userId));
    }

    @Test void finalStepAndTaskSuccessRollBackTogetherOnStateWriteFailure() throws Exception {
        var task = create("coastal-memory", List.of(asset()), UUID.randomUUID().toString());
        // The step UPDATE really succeeds first; rejecting the later task UPDATE must roll that step back.
        doReturn(0).when(taskMapper).transition(argThat(taskRecord -> taskRecord.status() == TaskStatus.SUCCEEDED), eq(TaskStatus.RUNNING), eq(TaskStage.FINALIZE));
        execution.runNextTask(); var failed = detail(id(task));
        assertEquals("FAILED", failed.get("status").asText()); assertEquals("STATE_PERSISTENCE_FAILED", failed.get("errorCode").asText());
        assertEquals("FAILED", failed.get("steps").get(2).get("status").asText());
        assertFalse(Files.exists(root.resolve("results").resolve(userId).resolve(id(task) + ".png")));
    }

    @Test void historyIsStableScopedAndActiveIsNotLimitedByHistoryPage() throws Exception {
        String asset = asset(); var ids = new ArrayList<String>();
        for (int i = 0; i < 21; i++) ids.add(id(create("coastal-memory", List.of(asset), UUID.randomUUID().toString())));
        jdbc.update("UPDATE tasks SET created_at='2026-10-28 00:00:00.123456' WHERE user_id=?", userId);
        ids.sort(Comparator.reverseOrder());
        var first = getJson("/api/tasks?page=1&pageSize=1&status=QUEUED");
        assertEquals(21, first.get("total").asInt()); assertEquals(ids.get(0), first.get("items").get(0).get("id").asText());
        assertEquals(ids.get(1), getJson("/api/tasks?page=2&pageSize=1").get("items").get(0).get("id").asText());
        assertEquals(21, getJson("/api/tasks/active").size()); assertTrue(getJson("/api/tasks?status=FAILED").get("items").isEmpty());
        for (String query : List.of("page=0", "pageSize=101", "status=INVALID", "page=not-a-number")) mvc.perform(get("/api/tasks?" + query).session(user.cookie)).andExpect(status().isBadRequest());
    }

    @Test void recoveryFailsRunningOnlyAndQueuedKeepsItsOriginalSnapshot() throws Exception {
        String asset = asset(); var terminal = create("coastal-memory", List.of(asset), UUID.randomUUID().toString()); execution.runNextTask();
        var done = detail(id(terminal));
        var running = create("coastal-memory", List.of(asset), UUID.randomUUID().toString()); state.claimNext();
        var queued = create("coastal-memory", List.of(asset), UUID.randomUUID().toString()); snapshot(id(queued), "GENERATE");
        state.failRunning("SERVICE_RESTARTED", "服务重启导致制作中断");
        var failed = detail(id(running)); assertEquals("FAILED", failed.get("status").asText()); assertEquals("SERVICE_RESTARTED", failed.get("errorCode").asText());
        assertEquals("FAILED", failed.get("steps").get(0).get("status").asText()); assertEquals("PENDING", failed.get("steps").get(1).get("status").asText());
        assertEquals("QUEUED", detail(id(queued)).get("status").asText()); assertEquals(done, detail(id(terminal)));
        state.failRunning("SERVICE_RESTARTED", "服务重启导致制作中断"); assertEquals(failed, detail(id(running)));
        execution.runNextTask(); var later = detail(id(queued));
        assertEquals("SIMULATED_FAILURE", later.get("errorCode").asText()); assertEquals("GENERATE", later.get("currentStage").asText()); assertEquals(done, detail(id(terminal)));
    }

    private Session csrf(MockHttpSession session) throws Exception {
        var request = get("/api/auth/csrf"); if (session != null) request.session(session);
        var result = mvc.perform(request).andExpect(status().isOk()).andReturn(); var body = body(result);
        return new Session((MockHttpSession) result.getRequest().getSession(false), body.get("token").asText(), body.get("headerName").asText());
    }
    private Session loginDemoB() throws Exception {
        var client = csrf(null);
        mvc.perform(post("/api/auth/login").session(client.cookie).header(client.header, client.token).contentType("application/json").content("{\"username\":\"demo_b\",\"password\":\"Demo123456!\"}"))
                .andExpect(status().isOk()); return csrf(client.cookie);
    }
    private String asset() throws Exception {
        return body(mvc.perform(multipart("/api/assets").file(new MockMultipartFile("file", "portrait.png", "image/png", sample("samples/portrait.png")))
                .session(user.cookie).header(user.header, user.token)).andExpect(status().isCreated()).andReturn()).get("id").asText();
    }
    private ResultActions submit(String template, List<String> assets, String key) throws Exception {
        return mvc.perform(post("/api/tasks").session(user.cookie).header(user.header, user.token).contentType("application/json")
                .content(json.writeValueAsString(new CreateTaskRequest(template, assets, key))));
    }
    private JsonNode create(String template, List<String> assets, String key) throws Exception { return body(submit(template, assets, key).andExpect(status().isAccepted()).andReturn()); }
    private JsonNode detail(String id) throws Exception { return getJson("/api/tasks/" + id); }
    private JsonNode getJson(String path) throws Exception { return body(mvc.perform(get(path).session(user.cookie)).andExpect(status().isOk()).andReturn()); }
    private JsonNode body(MvcResult result) throws Exception { return json.readTree(result.getResponse().getContentAsByteArray()); }
    private static String id(JsonNode task) { return task.get("id").asText(); }
    private long countTasks() { return jdbc.queryForObject("SELECT COUNT(*) FROM tasks WHERE user_id=?", Long.class, userId); }
    private void snapshot(String task, String failure) throws Exception { jdbc.update("UPDATE tasks SET simulation_config_json=? WHERE id=?", json.writeValueAsString(new SimulationSettings(0, 0, 0, SimulationSettings.FailStage.valueOf(failure))), task); }
    private static byte[] sample(String relative) throws Exception { try (var input = new ClassPathResource("demo-assets/" + relative).getInputStream()) { return input.readAllBytes(); } }
}
