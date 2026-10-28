package com.sheepxj.assets.task;

import com.sheepxj.assets.asset.ImageValidator;
import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.persistence.mapper.AssetMapper;
import com.sheepxj.assets.persistence.mapper.TaskAssetMapper;
import com.sheepxj.assets.persistence.mapper.TemplateMapper;
import com.sheepxj.assets.persistence.model.TaskRecord;
import com.sheepxj.assets.persistence.model.TemplateRecord;
import com.sheepxj.assets.storage.FileStorage;
import java.io.IOException;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class TaskMaterials {
    private final TemplateMapper templates;
    private final AssetMapper assets;
    private final TaskAssetMapper links;
    private final FileStorage storage;
    private final ImageValidator images;

    public TaskMaterials(TemplateMapper templates, AssetMapper assets, TaskAssetMapper links, FileStorage storage, ImageValidator images) {
        this.templates = templates; this.assets = assets; this.links = links; this.storage = storage; this.images = images;
    }

    public TemplateRecord template(String id) {
        var template = templates.findById(id);
        if (template == null) throw new ApiException(HttpStatus.NOT_FOUND, "TEMPLATE_NOT_FOUND", "模板不存在或已不可用");
        return template;
    }

    public TemplateRecord validate(String userId, String templateId, List<String> assetIds) {
        var template = template(templateId);
        if (assetIds.size() != template.requiredImageCount()) throw invalid("图片数量必须为 " + template.requiredImageCount() + " 张");
        if (new HashSet<>(assetIds).size() != assetIds.size()) throw invalid("同一张素材不能重复占据多个上传位");
        for (String id : assetIds) {
            var asset = assets.findByIdAndUserId(id, userId);
            if (asset == null) throw new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在");
            if (!template.acceptedMimeTypes().contains(asset.mimeType()) || asset.sizeBytes() > template.maxFileSizeBytes()) throw invalid("素材格式或大小不符合所选模板要求");
            var path = storage.readable(asset.storagePath());
            try {
                var image = images.validateStored(path, asset.mimeType(), asset.originalFilename());
                if (image.bytes().length != asset.sizeBytes()) throw invalid("素材文件已变化，请重新上传");
            } catch (IOException exception) { throw invalid("素材无法读取，请重新上传"); }
        }
        return template;
    }

    public void validate(TaskRecord task) {
        var materialLinks = links.findByTaskIdAndUserId(task.id(), task.userId());
        for (int i = 0; i < materialLinks.size(); i++) if (materialLinks.get(i).slotIndex() != i) throw invalid("素材位置不完整");
        validate(task.userId(), task.templateId(), materialLinks.stream().map(link -> link.assetId()).toList());
    }

    private static ApiException invalid(String message) {
        return new ApiException(HttpStatus.BAD_REQUEST, "INVALID_ASSETS", message, Map.of("assetIds", message));
    }
}
