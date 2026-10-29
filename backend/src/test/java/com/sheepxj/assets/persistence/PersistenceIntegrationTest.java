package com.sheepxj.assets.persistence;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.contract.ApiContracts.StepStatus;
import com.sheepxj.assets.contract.ApiContracts.TaskStage;
import com.sheepxj.assets.contract.ApiContracts.TaskStatus;
import com.sheepxj.assets.persistence.mapper.*;
import com.sheepxj.assets.persistence.model.*;
import com.sheepxj.assets.storage.DemoAssetCatalog;
import java.time.Instant;
import java.sql.SQLException;
import java.util.List;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;
import javax.sql.DataSource;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.annotation.DirtiesContext;
import org.springframework.core.io.ClassPathResource;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.dao.DataAccessException;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DataSourceUtils;
import org.springframework.jdbc.datasource.init.ScriptUtils;
import org.springframework.security.crypto.bcrypt.BCryptPasswordEncoder;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;

@SpringBootTest
@DirtiesContext(classMode = DirtiesContext.ClassMode.AFTER_CLASS)
@EnabledIfEnvironmentVariable(named = "RUN_DATABASE_TESTS", matches = "true")
@Transactional
class PersistenceIntegrationTest {
    private static final String A = "10000000-0000-4000-8000-000000000001";
    private static final String B = "10000000-0000-4000-8000-000000000002";
    private static final Instant TIME = Instant.parse("2026-10-28T09:00:00.123456Z");
    private static final String CONFIG = "{\"checkDelayMs\":2000,\"generateDelayMs\":8000,\"finalizeDelayMs\":2000,\"failStage\":\"NONE\"}";
    @Autowired private UserMapper users;
    @Autowired private TemplateMapper templates;
    @Autowired private AssetMapper assets;
    @Autowired private TaskMapper tasks;
    @Autowired private TaskAssetMapper links;
    @Autowired private TaskStepMapper steps;
    @Autowired private JdbcTemplate jdbc;
    @Autowired private DataSource dataSource;
    @Autowired private ObjectMapper json;
    @Autowired private DemoAssetCatalog catalog;

    @Test
    void seedsProvideSixTemplatesThreeCategoriesAndAllImageCounts() throws Exception {
        var items = templates.findAll(null);
        assertEquals(6, items.size());
        assertEquals(3, templates.findCategories().size());
        assertEquals(Set.of(1, 2, 3), items.stream().map(TemplateRecord::requiredImageCount).collect(Collectors.toSet()));
        for (var item : items) {
            assertEquals(List.of("image/jpeg", "image/png"), item.acceptedMimeTypes());
            assertEquals(5242880L, item.maxFileSizeBytes());
            assertNotNull(templates.findById(item.id()));
            catalog.verifyImage(item.coverPath());
            catalog.verifyImage(item.resultPath());
        }
        for (var category : templates.findCategories()) assertEquals(2, templates.findAll(category.id()).size());
        assertTrue(templates.findAll("missing-category").isEmpty());
        assertNull(templates.findById("missing-template"));
    }

    @Test
    void bothDemoHashesMatchTheDocumentedLocalPassword() {
        var encoder = new BCryptPasswordEncoder();
        for (String username : List.of("demo_a", "demo_b")) {
            var user = users.findByUsername(username);
            assertNotNull(user);
            assertEquals(60, user.passwordHash().length());
            assertNotEquals("Demo123456!", user.passwordHash());
            assertTrue(encoder.matches("Demo123456!", user.passwordHash()));
            assertFalse(encoder.matches("incorrect", user.passwordHash()));
        }
        assertNotEquals(users.findById(A).passwordHash(), users.findById(B).passwordHash());
    }

    @Test
    void usersRoundTripUtcAndEnforceUniqueNames() {
        var user = new UserRecord(id(), "p1_unique_user", users.findById(A).passwordHash(), TIME);
        assertEquals(1, users.insert(user));
        assertEquals(user, users.findById(user.id()));
        assertEquals(user, users.findByUsername(user.username()));
        assertThrows(DuplicateKeyException.class, () -> users.insert(new UserRecord(id(), user.username(), user.passwordHash(), TIME)));
        assertEquals(0, jdbc.queryForObject("SELECT TIMESTAMPDIFF(SECOND, UTC_TIMESTAMP(), NOW())", Integer.class));
    }

    @Test
    void assetReadsAreScopedAndEmptyIdListsCannotReadAllAssets() {
        var first = asset(A);
        var second = asset(B);
        assets.insert(first); assets.insert(second);
        assertEquals(first, assets.findByIdAndUserId(first.id(), A));
        assertNull(assets.findByIdAndUserId(first.id(), B));
        assertEquals(List.of(first), assets.findByIdsAndUserId(List.of(first.id(), second.id()), A));
        assertTrue(assets.findByIdsAndUserId(List.of(), A).isEmpty());
        assertTrue(assets.findByIdsAndUserId(null, A).isEmpty());
    }

    @Test
    void tasksRoundTripEnumsJsonAndOwnerScope() throws Exception {
        var task = queued(A, TIME);
        tasks.insert(task);
        var found = tasks.findByIdAndUserId(task.id(), A);
        assertEquals(TaskStatus.QUEUED, found.status());
        assertNull(found.currentStage());
        assertEquals(TIME, found.createdAt());
        assertEquals(TIME.toString(), json.valueToTree(found).get("createdAt").textValue());
        assertEquals(json.readTree(CONFIG), json.readTree(found.simulationConfigJson()));
        assertEquals(task.id(), tasks.findByRequestId(A, task.requestId()).id());
        assertNull(tasks.findByIdAndUserId(task.id(), B));
        assertNull(tasks.findByRequestId(B, task.requestId()));
    }

    @Test
    void idempotencyKeysAreUniquePerUserRatherThanGlobally() {
        var first = queued(A, TIME);
        tasks.insert(first);
        assertThrows(DuplicateKeyException.class, () -> tasks.insert(withIdentity(queued(A, TIME), A, first.requestId())));
        assertEquals(1, tasks.insert(withIdentity(queued(B, TIME), B, first.requestId())));
    }

    @Test
    void taskHistoryPaginationAndQueueOrderingAreStable() {
        var oldest = queued(A, TIME.minusSeconds(10));
        var middle = queued(A, TIME);
        var newest = queued(A, TIME.plusSeconds(10));
        tasks.insert(middle); tasks.insert(newest); tasks.insert(oldest);
        tasks.insert(queued(B, TIME.plusSeconds(20)));
        assertEquals(List.of(newest.id(), middle.id()), tasks.findByUserId(A, null, 2, 0).stream().map(TaskRecord::id).toList());
        assertEquals(List.of(middle.id(), oldest.id()), tasks.findByUserId(A, TaskStatus.QUEUED, 2, 1).stream().map(TaskRecord::id).toList());
        assertEquals(3L, tasks.countByUserId(A, null));
        assertEquals(0L, tasks.countByUserId(A, TaskStatus.FAILED));
        assertEquals(oldest.id(), tasks.findOldestQueued().id());
        assertEquals(List.of(oldest.id(), middle.id(), newest.id()), tasks.findActiveByUserId(A).stream().map(TaskRecord::id).toList());
    }

    @Test
    void taskTransitionChecksExpectedStatusAndStageAndPreservesTerminalState() {
        var original = queued(A, TIME); tasks.insert(original);
        var running = state(original, TaskStatus.RUNNING, TaskStage.MATERIAL_CHECK, TIME, null, null, null, null);
        assertEquals(1, tasks.transition(running, TaskStatus.QUEUED, null));
        assertEquals(0, tasks.transition(running, TaskStatus.QUEUED, null));
        var finalizing = state(original, TaskStatus.RUNNING, TaskStage.FINALIZE, TIME, null, null, null, null);
        assertEquals(0, tasks.transition(finalizing, TaskStatus.RUNNING, TaskStage.GENERATE));
        assertEquals(1, tasks.transition(finalizing, TaskStatus.RUNNING, TaskStage.MATERIAL_CHECK));
        var success = state(original, TaskStatus.SUCCEEDED, TaskStage.FINALIZE, TIME, TIME.plusSeconds(12), "results/test.png", null, null);
        assertEquals(1, tasks.transition(success, TaskStatus.RUNNING, TaskStage.FINALIZE));
        assertEquals(0, tasks.transition(running, TaskStatus.RUNNING, TaskStage.FINALIZE));
        assertEquals(0, tasks.transition(running, TaskStatus.SUCCEEDED, TaskStage.FINALIZE));
        assertEquals(TaskStatus.SUCCEEDED, tasks.findById(original.id()).status());
        assertTrue(tasks.findActiveByUserId(A).isEmpty());
    }

    @Test
    void taskAssetConstraintsKeepOrderUniquenessAndOwnership() {
        var task = queued(A, TIME); tasks.insert(task);
        var first = asset(A); var second = asset(A); var foreign = asset(B);
        assets.insert(first); assets.insert(second); assets.insert(foreign);
        var third = asset(A); assets.insert(third);
        links.insert(new TaskAssetRecord(task.id(), second.id(), A, 1));
        links.insert(new TaskAssetRecord(task.id(), first.id(), A, 0));
        assertEquals(List.of(first.id(), second.id()), links.findByTaskIdAndUserId(task.id(), A).stream().map(TaskAssetRecord::assetId).toList());
        assertTrue(links.findByTaskIdAndUserId(task.id(), B).isEmpty());
        assertThrows(DuplicateKeyException.class, () -> links.insert(new TaskAssetRecord(task.id(), first.id(), A, 2)));
        assertThrows(DuplicateKeyException.class, () -> links.insert(new TaskAssetRecord(task.id(), third.id(), A, 0)));
        assertThrows(DataIntegrityViolationException.class, () -> links.insert(new TaskAssetRecord(task.id(), foreign.id(), A, 2)));
        assertThrows(DataIntegrityViolationException.class, () -> links.insert(new TaskAssetRecord(task.id(), foreign.id(), B, 2)));
    }

    @Test
    void stepsHaveUniqueStagesOrderedReadsAndConditionalUpdates() {
        var task = queued(A, TIME); tasks.insert(task);
        for (var stage : List.of(TaskStage.FINALIZE, TaskStage.GENERATE, TaskStage.MATERIAL_CHECK)) steps.insert(pending(task.id(), stage));
        assertEquals(List.of(TaskStage.MATERIAL_CHECK, TaskStage.GENERATE, TaskStage.FINALIZE), steps.findByTaskId(task.id()).stream().map(TaskStepRecord::stage).toList());
        assertThrows(DuplicateKeyException.class, () -> steps.insert(pending(task.id(), TaskStage.GENERATE)));
        var running = new TaskStepRecord(task.id(), TaskStage.MATERIAL_CHECK, StepStatus.RUNNING, TIME, null, null, null);
        assertEquals(1, steps.transition(running, StepStatus.PENDING));
        assertEquals(0, steps.transition(running, StepStatus.PENDING));
        var done = new TaskStepRecord(task.id(), TaskStage.MATERIAL_CHECK, StepStatus.SUCCEEDED, TIME, TIME.plusSeconds(2), null, null);
        assertEquals(1, steps.transition(done, StepStatus.RUNNING));
        assertEquals(done, steps.findByTaskId(task.id()).getFirst());
        assertEquals(0, steps.transition(running, StepStatus.SUCCEEDED));
    }

    @Test
    void foreignKeysChecksAndIndexesExistInRealMysql() {
        assertThrows(DataIntegrityViolationException.class, () -> assets.insert(asset(id())));
        var task = queued(A, TIME); tasks.insert(task);
        assertCheckViolation(() -> tasks.transition(
                state(task, TaskStatus.SUCCEEDED, TaskStage.FINALIZE, TIME, TIME.plusSeconds(1), null, null, null), TaskStatus.QUEUED, null));
        assertCheckViolation(() -> jdbc.update("UPDATE tasks SET status='INVALID' WHERE id=?", task.id()));
        assertEquals(TaskStatus.QUEUED, tasks.findById(task.id()).status());
        assertThrows(DataIntegrityViolationException.class, () -> steps.insert(pending(id(), TaskStage.GENERATE)));
        var indexes = Set.copyOf(jdbc.queryForList("SELECT DISTINCT index_name FROM information_schema.statistics WHERE table_schema=DATABASE() AND table_name='tasks'", String.class));
        assertTrue(indexes.containsAll(Set.of("uq_tasks_user_request", "idx_tasks_queue", "idx_tasks_user_history", "idx_tasks_user_status")));
        assertEquals(6, jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.tables WHERE table_schema=DATABASE()", Integer.class));
    }

    @Test
    void replayingSeedDataPreservesChangedHashesTemplatesAndPersonalRecords() throws Exception {
        String hash = new BCryptPasswordEncoder().encode("ChangedDemo123!");
        jdbc.update("UPDATE users SET password_hash=? WHERE id=?", hash, A);
        jdbc.update("UPDATE templates SET title=? WHERE id='travel-postcard'", "用户保留的标题");
        var user = new UserRecord(id(), "p1_seed_preserve", hash, TIME); users.insert(user);
        var task = queued(user.id(), TIME); tasks.insert(task);
        executeScript("database/seed.sql"); executeScript("database/seed.sql");
        assertEquals(hash, users.findById(A).passwordHash());
        assertEquals("用户保留的标题", templates.findById("travel-postcard").title());
        assertEquals(user, users.findById(user.id()));
        assertNotNull(tasks.findById(task.id()));
        assertEquals(6, templates.findAll(null).size());
        assertEquals(3, jdbc.queryForObject("SELECT COUNT(*) FROM users", Integer.class));
    }

    @Test
    @Transactional(propagation = Propagation.NOT_SUPPORTED)
    void repeatingFullInitializationKeepsCommittedPersonalRows() throws Exception {
        var user = new UserRecord(id(), "p1_committed_preserve", users.findById(A).passwordHash(), TIME);
        users.insert(user);
        var task = queued(user.id(), TIME);
        try {
            tasks.insert(task);
            executeScript("database/schema.sql"); executeScript("database/seed.sql");
            executeScript("database/schema.sql"); executeScript("database/seed.sql");
            assertEquals(user, users.findById(user.id()));
            assertEquals(TaskStatus.QUEUED, tasks.findById(task.id()).status());
            assertEquals(6, templates.findAll(null).size());
        } finally {
            jdbc.update("DELETE FROM tasks WHERE id=?", task.id());
            jdbc.update("DELETE FROM users WHERE id=?", user.id());
        }
    }

    private static void assertCheckViolation(org.junit.jupiter.api.function.Executable action) {
        var exception = assertThrows(DataAccessException.class, action);
        Throwable root = exception;
        while (root.getCause() != null) root = root.getCause();
        var sql = assertInstanceOf(SQLException.class, root);
        assertEquals(3819, sql.getErrorCode(), "Must be a real MySQL CHECK rejection, not a syntax or connection error");
    }

    private void executeScript(String resource) throws Exception {
        var connection = DataSourceUtils.getConnection(dataSource);
        try { ScriptUtils.executeSqlScript(connection, new ClassPathResource(resource)); }
        finally { DataSourceUtils.releaseConnection(connection, dataSource); }
    }

    private static String id() { return UUID.randomUUID().toString(); }
    private static AssetRecord asset(String owner) { return new AssetRecord(id(), owner, "sample.png", "image/png", 120, "uploads/test.png", TIME); }
    private static TaskRecord queued(String owner, Instant time) {
        return new TaskRecord(id(), owner, "travel-postcard", "旅行明信片", id(), "f".repeat(64), TaskStatus.QUEUED, null, CONFIG, time, null, null, null, null, null);
    }
    private static TaskRecord withIdentity(TaskRecord task, String owner, String requestId) {
        return new TaskRecord(task.id(), owner, task.templateId(), task.templateTitle(), requestId, task.requestFingerprint(), task.status(), task.currentStage(), task.simulationConfigJson(), task.createdAt(), task.startedAt(), task.finishedAt(), task.resultPath(), task.errorCode(), task.errorMessage());
    }
    private static TaskRecord state(TaskRecord task, TaskStatus status, TaskStage stage, Instant start, Instant finish, String result, String code, String message) {
        return new TaskRecord(task.id(), task.userId(), task.templateId(), task.templateTitle(), task.requestId(), task.requestFingerprint(), status, stage, task.simulationConfigJson(), task.createdAt(), start, finish, result, code, message);
    }
    private static TaskStepRecord pending(String taskId, TaskStage stage) { return new TaskStepRecord(taskId, stage, StepStatus.PENDING, null, null, null, null); }
}
