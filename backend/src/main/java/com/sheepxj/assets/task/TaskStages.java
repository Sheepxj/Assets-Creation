package com.sheepxj.assets.task;

import com.sheepxj.assets.asset.ImageValidator;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.storage.DemoAssetCatalog;
import com.sheepxj.assets.storage.FileStorage;
import java.io.IOException;
import org.springframework.stereotype.Component;

@Component
public class TaskStages {
    private final TaskMaterials materials;
    private final DemoAssetCatalog catalog;
    private final FileStorage storage;
    private final ImageValidator images;

    public TaskStages(TaskMaterials materials, DemoAssetCatalog catalog, FileStorage storage, ImageValidator images) {
        this.materials = materials; this.catalog = catalog; this.storage = storage; this.images = images;
    }

    public void checkMaterials(TaskRecord task) { materials.validate(task); }

    public String generate(TaskRecord task) throws IOException {
        String source = materials.template(task.templateId()).resultPath();
        catalog.verifyImage(source);
        return source;
    }

    public String finalizeResult(TaskRecord task, String source) throws IOException {
        String mime = source.endsWith(".png") ? "image/png" : "image/jpeg";
        byte[] bytes;
        try (var input = catalog.resource(source).getInputStream()) { bytes = input.readNBytes(ImageValidator.MAX_FILE_SIZE + 1); }
        String path = storage.storeResult(task.userId(), task.id(), mime.equals("image/png") ? "png" : "jpg", bytes);
        try {
            var verified = images.validateStored(storage.readable(path), mime, "result");
            if (verified.bytes().length != bytes.length) throw new IOException("Incomplete result file");
        } catch (IOException | RuntimeException exception) {
            storage.removeAfterFailure(path);
            throw exception;
        }
        return path;
    }
}
