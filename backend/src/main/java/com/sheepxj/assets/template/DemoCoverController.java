package com.sheepxj.assets.template;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.storage.DemoAssetCatalog;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

@RestController
public class DemoCoverController {
    private final DemoAssetCatalog catalog;
    public DemoCoverController(DemoAssetCatalog catalog) { this.catalog = catalog; }

    @GetMapping("/api/demo/covers/{filename}")
    public ResponseEntity<Resource> cover(@PathVariable String filename) {
        if (!filename.matches("[a-z0-9-]+\\.(?:jpg|png)")) throw missing();
        var resource = catalog.resource("covers/" + filename);
        if (!resource.exists() || !resource.isReadable()) throw missing();
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(filename.endsWith(".png") ? MediaType.IMAGE_PNG : MediaType.IMAGE_JPEG).body(resource);
    }

    private static ApiException missing() { return new ApiException(HttpStatus.NOT_FOUND, "RESOURCE_NOT_FOUND", "资源不存在"); }
}
