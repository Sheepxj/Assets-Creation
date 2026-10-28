package com.sheepxj.assets.asset;

import com.sheepxj.assets.contract.ApiContracts.AssetDto;
import com.sheepxj.assets.persistence.mapper.AssetMapper;
import com.sheepxj.assets.persistence.model.AssetRecord;
import com.sheepxj.assets.security.CurrentUser;
import com.sheepxj.assets.security.OwnedResources;
import com.sheepxj.assets.storage.FileStorage;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;
import org.springframework.web.multipart.MultipartFile;

@Service
public class AssetService {
    private final CurrentUser currentUser;
    private final ImageValidator images;
    private final FileStorage storage;
    private final AssetMapper assets;
    private final OwnedResources owned;
    private final TransactionTemplate transactions;

    public AssetService(CurrentUser currentUser, ImageValidator images, FileStorage storage,
            AssetMapper assets, OwnedResources owned, PlatformTransactionManager transactionManager) {
        this.currentUser = currentUser; this.images = images; this.storage = storage;
        this.assets = assets; this.owned = owned; this.transactions = new TransactionTemplate(transactionManager);
    }

    public AssetDto upload(MultipartFile file) {
        String userId = currentUser.require().id();
        var image = images.validate(file);
        String id = UUID.randomUUID().toString();
        String path = storage.store(userId, id, image.extension(), image.bytes());
        var asset = new AssetRecord(id, userId, image.originalFilename(), image.mimeType(), image.bytes().length,
                path, Instant.now().truncatedTo(ChronoUnit.MICROS));
        try {
            return transactions.execute(status -> {
                assets.insert(asset);
                return new AssetDto(id, asset.originalFilename(), asset.mimeType(), asset.sizeBytes(), "/api/assets/" + id + "/content");
            });
        } catch (RuntimeException exception) {
            storage.removeAfterFailure(path);
            throw exception;
        }
    }

    public record Preview(AssetRecord asset, java.nio.file.Path path) { }
    public Preview preview(String id) {
        var asset = owned.requireAsset(id);
        return new Preview(asset, storage.readable(asset.storagePath()));
    }
}
