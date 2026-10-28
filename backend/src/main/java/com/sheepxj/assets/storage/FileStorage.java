package com.sheepxj.assets.storage;

import com.sheepxj.assets.common.ApiException;
import java.io.IOException;
import java.nio.file.AtomicMoveNotSupportedException;
import java.nio.file.Files;
import java.nio.file.LinkOption;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.UUID;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class FileStorage {
    private static final Logger log = LoggerFactory.getLogger(FileStorage.class);
    private final Path root;

    public FileStorage(@Value("${app.storage-root}") String configuredRoot) {
        try {
            root = Files.createDirectories(Path.of(configuredRoot).toAbsolutePath().normalize()).toRealPath();
            Files.createDirectories(root.resolve("uploads"));
            Files.createDirectories(root.resolve("results"));
            Files.createDirectories(root.resolve(".tmp"));
            Path probe = Files.createTempFile(root, ".write-probe-", ".tmp");
            Files.delete(probe);
        } catch (IOException exception) { throw new IllegalStateException("Asset storage directory is not writable", exception); }
    }

    public String store(String userId, String assetId, String extension, byte[] bytes) {
        return write("uploads", userId, assetId, extension, bytes);
    }

    public String storeResult(String userId, String taskId, String extension, byte[] bytes) {
        return write("results", userId, taskId, extension, bytes);
    }

    private String write(String directory, String userId, String assetId, String extension, byte[] bytes) {
        UUID.fromString(userId); UUID.fromString(assetId);
        if (!extension.equals("jpg") && !extension.equals("png")) throw new IllegalArgumentException("Unsupported storage extension");
        Path temporary = null;
        try {
            String relative = directory + "/" + userId + "/" + assetId + "." + extension;
            Path destination = resolve(relative);
            Path parent = Files.createDirectories(destination.getParent()).toRealPath();
            if (!parent.startsWith(root)) throw new IOException("Asset directory escaped storage root");
            temporary = Files.createTempFile(root.resolve(".tmp"), "upload-", ".tmp");
            Files.write(temporary, bytes);
            try { Files.move(temporary, destination, StandardCopyOption.ATOMIC_MOVE); }
            catch (AtomicMoveNotSupportedException exception) { Files.move(temporary, destination); }
            return relative;
        } catch (IOException exception) {
            log.warn("Asset file write failed", exception);
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "STORAGE_UNAVAILABLE", "素材存储暂时不可用，请稍后重试");
        } finally {
            if (temporary != null) {
                try { Files.deleteIfExists(temporary); }
                catch (IOException exception) { log.warn("Could not remove temporary upload", exception); }
            }
        }
    }

    public Path readable(String relative) {
        try {
            Path path = resolve(relative).toRealPath();
            if (!path.startsWith(root) || !Files.isRegularFile(path, LinkOption.NOFOLLOW_LINKS) || !Files.isReadable(path)) throw missing();
            return path;
        } catch (IOException | IllegalArgumentException exception) { throw missing(); }
    }

    public void removeAfterFailure(String relative) {
        try { Files.deleteIfExists(resolve(relative)); }
        catch (IOException exception) { log.warn("Could not remove unreferenced upload after database failure", exception); }
    }

    private Path resolve(String relative) {
        if (relative == null || Path.of(relative).isAbsolute()) throw new IllegalArgumentException("Invalid storage path");
        Path path = root.resolve(relative).normalize();
        if (!path.startsWith(root) || path.equals(root)) throw new IllegalArgumentException("Invalid storage path");
        return path;
    }

    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在"); }
}
