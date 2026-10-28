package com.sheepxj.assets.storage;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.util.HashSet;
import java.util.HexFormat;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;

import static org.junit.jupiter.api.Assertions.*;

class DemoAssetsTest {
    private final DemoAssetCatalog catalog = new DemoAssetCatalog();

    @Test
    void packagedImagesMatchManifestAndDecodeAsTheirDeclaredFormats() throws Exception {
        String manifest;
        try (var input = new ClassPathResource("demo-assets/manifest.sha256").getInputStream()) {
            manifest = new String(input.readAllBytes(), StandardCharsets.UTF_8);
        }
        var entries = manifest.lines().toList();
        assertEquals(15, entries.size());
        var paths = new HashSet<String>();
        for (String entry : entries) {
            String[] parts = entry.split("  ", 2);
            assertEquals(2, parts.length);
            assertTrue(paths.add(parts[1]), "Manifest paths must be unique");
            try (var input = catalog.resource(parts[1]).getInputStream()) {
                assertEquals(parts[0], HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(input.readAllBytes())));
            }
            catalog.verifyImage(parts[1]);
        }
        assertEquals(6, paths.stream().filter(path -> path.startsWith("covers/")).count());
        assertEquals(6, paths.stream().filter(path -> path.startsWith("results/")).count());
        assertEquals(3, paths.stream().filter(path -> path.startsWith("samples/")).count());
    }

    @Test
    void catalogRejectsPathsOutsideTheDemoDirectories() {
        for (String path : new String[]{"../application.yaml", "/etc/passwd", "covers/../../secret.png", "covers/fake.svg"}) {
            assertThrows(IllegalArgumentException.class, () -> catalog.resource(path));
        }
    }
}
