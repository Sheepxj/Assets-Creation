package com.sheepxj.assets.security;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.persistence.mapper.AssetMapper;
import com.sheepxj.assets.persistence.mapper.TaskMapper;
import com.sheepxj.assets.persistence.model.AssetRecord;
import com.sheepxj.assets.persistence.model.TaskRecord;
import org.springframework.http.HttpStatus;
import org.springframework.stereotype.Component;

@Component
public class OwnedResources {
    private final CurrentUser currentUser;
    private final AssetMapper assets;
    private final TaskMapper tasks;

    public OwnedResources(CurrentUser currentUser, AssetMapper assets, TaskMapper tasks) {
        this.currentUser = currentUser;
        this.assets = assets;
        this.tasks = tasks;
    }

    public AssetRecord requireAsset(String id) {
        var asset = assets.findByIdAndUserId(id, currentUser.require().id());
        if (asset == null) throw notFound();
        return asset;
    }

    public TaskRecord requireTask(String id) {
        var task = tasks.findByIdAndUserId(id, currentUser.require().id());
        if (task == null) throw notFound();
        return task;
    }

    private static ApiException notFound() { return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在"); }
}
