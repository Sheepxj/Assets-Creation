package com.sheepxj.assets.asset;

import com.sheepxj.assets.common.ApiException;
import com.sheepxj.assets.contract.ApiContracts.AssetDto;
import java.util.Map;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartHttpServletRequest;

@RestController
@RequestMapping("/api/assets")
public class AssetController {
    private final AssetService assets;
    public AssetController(AssetService assets) { this.assets = assets; }

    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    @ResponseStatus(HttpStatus.CREATED)
    public AssetDto upload(MultipartHttpServletRequest request) {
        var files = request.getMultiFileMap();
        if (files.size() != 1 || !files.containsKey("file") || files.get("file").size() != 1) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "INVALID_FILE_COUNT", "每次需上传一张图片，字段名为 file", Map.of("file", "请选择一张图片"));
        }
        return assets.upload(files.getFirst("file"));
    }

    @GetMapping("/{id}/content")
    public ResponseEntity<Resource> content(@PathVariable String id) {
        var preview = assets.preview(id);
        String extension = preview.asset().mimeType().equals("image/png") ? "png" : "jpg";
        return ResponseEntity.ok().cacheControl(CacheControl.noStore())
                .contentType(MediaType.parseMediaType(preview.asset().mimeType()))
                .header(HttpHeaders.CONTENT_DISPOSITION, ContentDisposition.inline().filename(preview.asset().id() + "." + extension).build().toString())
                .body(new FileSystemResource(preview.path()));
    }
}
