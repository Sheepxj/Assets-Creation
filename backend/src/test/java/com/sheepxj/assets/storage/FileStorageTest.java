package com.sheepxj.assets.storage;

import com.sheepxj.assets.common.ApiException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.UUID;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import static org.junit.jupiter.api.Assertions.*;

class FileStorageTest {
    @TempDir Path temporary;

    @Test
    void writesACompleteControlledFileAndRemovesItAfterFailure() throws Exception {
        var storage = new FileStorage(temporary.toString());
        String user = UUID.randomUUID().toString(), asset = UUID.randomUUID().toString();
        String relative = storage.store(user, asset, "png", new byte[]{1, 2, 3});
        assertEquals("uploads/" + user + "/" + asset + ".png", relative);
        assertArrayEquals(new byte[]{1, 2, 3}, Files.readAllBytes(storage.readable(relative)));
        try (var files = Files.list(temporary.resolve(".tmp"))) { assertEquals(0, files.count()); }
        storage.removeAfterFailure(relative);
        assertEquals(404, assertThrows(ApiException.class, () -> storage.readable(relative)).status().value());
    }

    @Test
    void readsCannotEscapeTheConfiguredRootByPathOrSymbolicLink() throws Exception {
        Path root = temporary.resolve("storage");
        var storage = new FileStorage(root.toString());
        Path outside = Files.write(temporary.resolve("outside.png"), new byte[]{1});
        Files.createSymbolicLink(root.resolve("uploads/link.png"), outside);
        for (String path : new String[]{"../outside.png", outside.toString(), "uploads/link.png"}) {
            assertEquals(404, assertThrows(ApiException.class, () -> storage.readable(path)).status().value());
        }
    }

    @Test
    void failedMoveAfterWritingDoesNotLeaveTemporaryUploadFiles() throws Exception {
        var storage = new FileStorage(temporary.toString());
        String user = UUID.randomUUID().toString(), asset = UUID.randomUUID().toString();
        // An existing directory at the final file path makes the move fail after a temporary file was written.
        Files.createDirectories(temporary.resolve("uploads").resolve(user).resolve(asset + ".png"));
        var error = assertThrows(ApiException.class, () -> storage.store(user, asset, "png", new byte[]{1}));
        assertEquals(503, error.status().value());
        try (var files = Files.list(temporary.resolve(".tmp"))) { assertEquals(0, files.count()); }
    }
}
