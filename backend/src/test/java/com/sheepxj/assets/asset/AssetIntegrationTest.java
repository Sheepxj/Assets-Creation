package com.sheepxj.assets.asset;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.sheepxj.assets.persistence.mapper.AssetMapper;
import com.sheepxj.assets.storage.FileStorage;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.Set;
import java.util.UUID;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpSession;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.transaction.annotation.Transactional;

import static org.junit.jupiter.api.Assertions.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

@SpringBootTest
@AutoConfigureMockMvc
@Transactional
@EnabledIfEnvironmentVariable(named = "RUN_DATABASE_TESTS", matches = "true")
class AssetIntegrationTest {
    private static final String A = "10000000-0000-4000-8000-000000000001";
    private static Path root;
    @DynamicPropertySource static void storage(DynamicPropertyRegistry registry) throws Exception {
        root = Files.createTempDirectory("assets-p3-it-");
        registry.add("app.storage-root", root::toString);
    }
    @Autowired private MockMvc mvc;
    @Autowired private ObjectMapper json;
    @Autowired private AssetMapper assets;
    @Autowired private FileStorage storage;
    @Autowired private JdbcTemplate jdbc;
    private final Set<String> createdIds = new HashSet<>();

    @AfterEach void cleanFiles() {
        for (String id : createdIds) {
            var asset = assets.findByIdAndUserId(id, A);
            if (asset != null) storage.removeAfterFailure(asset.storagePath());
        }
    }
    @AfterAll static void cleanOwnedTemporaryDirectory() throws Exception {
        if (root != null) try (var files = Files.walk(root)) {
            for (Path path : files.sorted(Comparator.reverseOrder()).toList()) Files.deleteIfExists(path);
        }
    }

    @Test void templatesArePublicDatabaseBackedAndFilterable() throws Exception {
        mvc.perform(get("/api/templates/categories")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(3));
        mvc.perform(get("/api/templates")).andExpect(status().isOk()).andExpect(jsonPath("$.length()").value(6));
        mvc.perform(get("/api/templates").param("category", "travel")).andExpect(jsonPath("$.length()").value(2));
        mvc.perform(get("/api/templates").param("category", "missing")).andExpect(jsonPath("$.length()").value(0));
        jdbc.update("UPDATE templates SET title='数据库中的实际标题' WHERE id='travel-postcard'");
        mvc.perform(get("/api/templates/travel-postcard")).andExpect(status().isOk())
                .andExpect(jsonPath("$.title").value("数据库中的实际标题"))
                .andExpect(jsonPath("$.requiredImageCount").value(2))
                .andExpect(jsonPath("$.maxFileSizeBytes").value(ImageValidator.MAX_FILE_SIZE));
        mvc.perform(get("/api/templates/unknown")).andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("TEMPLATE_NOT_FOUND"));
    }

    @Test void everyReturnedCoverIsAReadablePublicJpeg() throws Exception {
        var items = json.readTree(mvc.perform(get("/api/templates")).andReturn().getResponse().getContentAsString());
        for (var item : items) {
            var result = mvc.perform(get(item.get("coverUrl").asText())).andExpect(status().isOk())
                    .andExpect(content().contentTypeCompatibleWith(MediaType.IMAGE_JPEG)).andReturn();
            assertEquals(255, result.getResponse().getContentAsByteArray()[0] & 255);
        }
        mvc.perform(get("/api/demo/covers/not-there.jpg")).andExpect(status().isNotFound());
        mvc.perform(get("/api/demo/covers/manifest.sha256")).andExpect(status().isNotFound());
    }

    @Test void jpegAndPngUploadsPersistAndCanBeReadInANewRequest() throws Exception {
        var client = login("demo_a");
        for (String[] sample : new String[][]{{"portrait.png", "image/png"}, {"landscape.jpg", "image/jpeg"}}) {
            byte[] bytes = ImageValidatorTest.sample(sample[0]);
            var result = upload(client, new MockMultipartFile("file", sample[0], sample[1], bytes));
            assertEquals(201, result.getResponse().getStatus());
            var body = json.readTree(result.getResponse().getContentAsString());
            String id = body.get("id").asText(); createdIds.add(id);
            assertEquals(bytes.length, body.get("sizeBytes").asInt()); assertEquals(sample[1], body.get("mimeType").asText());
            assertFalse(body.has("storagePath")); assertFalse(body.has("userId"));
            var record = assets.findByIdAndUserId(id, A);
            assertArrayEquals(bytes, Files.readAllBytes(storage.readable(record.storagePath())));
            var preview = mvc.perform(get(body.get("previewUrl").asText()).session(client.session))
                    .andExpect(status().isOk()).andExpect(content().contentTypeCompatibleWith(sample[1]))
                    .andExpect(header().string("X-Content-Type-Options", "nosniff")).andReturn();
            assertArrayEquals(bytes, preview.getResponse().getContentAsByteArray());
            assertTrue(preview.getResponse().getHeader("Content-Disposition").startsWith("inline"));
        }
    }

    @Test void ownershipUsesTheSessionEvenWithForgedFormAndQueryUserIds() throws Exception {
        var a = login("demo_a"); var b = login("demo_b");
        var result = mvc.perform(multipart("/api/assets").file(png()).param("userId", "10000000-0000-4000-8000-000000000002")
                .session(a.session).header(a.header, a.token)).andExpect(status().isCreated()).andReturn();
        var body = json.readTree(result.getResponse().getContentAsString());
        String id = body.get("id").asText(); createdIds.add(id);
        assertNotNull(assets.findByIdAndUserId(id, A));
        mvc.perform(get(body.get("previewUrl").asText()).session(b.session).param("userId", A))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        mvc.perform(get("/api/assets/" + UUID.randomUUID() + "/content").session(a.session))
                .andExpect(status().isNotFound()).andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
        mvc.perform(get(body.get("previewUrl").asText())).andExpect(status().isUnauthorized());
    }

    @Test void invalidImagesDoNotCreateMetadataOrStoredFiles() throws Exception {
        var a = login("demo_a");
        long beforeRows = countAssets(), beforeFiles = countFiles();
        var fixtures = new MockMultipartFile[]{
            new MockMultipartFile("file", "empty.png", "image/png", new byte[0]),
            new MockMultipartFile("file", "fake.png", "image/png", "<html>fake</html>".getBytes()),
            new MockMultipartFile("file", "bad.png", "image/png", Arrays.copyOf(ImageValidatorTest.sample("portrait.png"), 20)),
            new MockMultipartFile("file", "mismatch.jpg", "image/jpeg", ImageValidatorTest.sample("portrait.png"))};
        int[] statuses = {400, 415, 400, 415};
        for (int i = 0; i < fixtures.length; i++) assertEquals(statuses[i], upload(a, fixtures[i]).getResponse().getStatus());
        assertEquals(beforeRows, countAssets()); assertEquals(beforeFiles, countFiles());
    }

    @Test void exactlyOneFileFieldIsRequiredAndJsonIsNotAnUpload() throws Exception {
        var a = login("demo_a");
        mvc.perform(multipart("/api/assets").session(a.session).header(a.header, a.token)).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/assets").file(png()).file(png()).session(a.session).header(a.header, a.token)).andExpect(status().isBadRequest());
        mvc.perform(multipart("/api/assets").file(png()).file(new MockMultipartFile("other", "extra.png", "image/png", new byte[]{1}))
                .session(a.session).header(a.header, a.token)).andExpect(status().isBadRequest());
        mvc.perform(post("/api/assets").session(a.session).header(a.header, a.token).contentType("application/json").content("{}"))
                .andExpect(status().isUnsupportedMediaType());
    }

    @Test void realUploadRequiresLoginAndCsrf() throws Exception {
        var a = login("demo_a");
        mvc.perform(multipart("/api/assets").file(png()).session(a.session)).andExpect(status().isForbidden());
        var anonymous = csrf(null);
        mvc.perform(multipart("/api/assets").file(png()).session(anonymous.session).header(anonymous.header, anonymous.token)).andExpect(status().isUnauthorized());
    }

    @Test void fiveMibBoundaryAndTooLargeResponsesMatchTheContract() throws Exception {
        var a = login("demo_a");
        byte[] boundary = Arrays.copyOf(ImageValidatorTest.sample("portrait.png"), ImageValidator.MAX_FILE_SIZE);
        var result = upload(a, new MockMultipartFile("file", "boundary.png", "image/png", boundary));
        assertEquals(201, result.getResponse().getStatus());
        var body = json.readTree(result.getResponse().getContentAsString()); createdIds.add(body.get("id").asText());
        assertEquals(ImageValidator.MAX_FILE_SIZE, body.get("sizeBytes").asInt());
        var excess = upload(a, new MockMultipartFile("file", "excess.png", "image/png", Arrays.copyOf(boundary, boundary.length + 1)));
        assertEquals(413, excess.getResponse().getStatus());
        assertEquals("FILE_TOO_LARGE", json.readTree(excess.getResponse().getContentAsString()).get("code").asText());
    }

    @Test void missingStoredFileIsAReadableNotFoundResponse() throws Exception {
        var a = login("demo_a");
        var body = json.readTree(upload(a, png()).getResponse().getContentAsString());
        String id = body.get("id").asText(); createdIds.add(id);
        storage.removeAfterFailure(assets.findByIdAndUserId(id, A).storagePath());
        mvc.perform(get(body.get("previewUrl").asText()).session(a.session)).andExpect(status().isNotFound())
                .andExpect(jsonPath("$.code").value("RESOURCE_NOT_FOUND"));
    }

    @Test void userFilenamesAreMetadataAndCannotChooseStorageLocations() throws Exception {
        var a = login("demo_a");
        var result = upload(a, new MockMultipartFile("file", "C:\\fakepath\\原图.png", "image/png", ImageValidatorTest.sample("portrait.png")));
        assertEquals(201, result.getResponse().getStatus());
        var body = json.readTree(result.getResponse().getContentAsString());
        String id = body.get("id").asText(); createdIds.add(id);
        assertEquals("原图.png", body.get("originalFilename").asText());
        assertEquals("uploads/" + A + "/" + id + ".png", assets.findByIdAndUserId(id, A).storagePath());
    }

    private record Session(MockHttpSession session, String token, String header) { }
    private Session csrf(MockHttpSession session) throws Exception {
        var request = get("/api/auth/csrf"); if (session != null) request.session(session);
        var result = mvc.perform(request).andExpect(status().isOk()).andReturn();
        var body = json.readTree(result.getResponse().getContentAsString());
        return new Session((MockHttpSession) result.getRequest().getSession(false), body.get("token").asText(), body.get("headerName").asText());
    }
    private Session login(String username) throws Exception {
        var session = csrf(null);
        mvc.perform(post("/api/auth/login").session(session.session).header(session.header, session.token).contentType("application/json")
                .content(json.writeValueAsString(java.util.Map.of("username", username, "password", "Demo123456!"))))
                .andExpect(status().isOk());
        return csrf(session.session);
    }
    private MvcResult upload(Session session, MockMultipartFile file) throws Exception {
        return mvc.perform(multipart("/api/assets").file(file).session(session.session).header(session.header, session.token)).andReturn();
    }
    private MockMultipartFile png() throws Exception { return new MockMultipartFile("file", "portrait.png", "image/png", ImageValidatorTest.sample("portrait.png")); }
    private long countAssets() { return jdbc.queryForObject("SELECT COUNT(*) FROM assets", Long.class); }
    private long countFiles() throws Exception { try (var files = Files.walk(root)) { return files.filter(Files::isRegularFile).count(); } }
}
