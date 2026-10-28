package com.sheepxj.assets.persistence.model;

import java.time.Instant;

public record AssetRecord(String id, String userId, String originalFilename, String mimeType,
        long sizeBytes, String storagePath, Instant createdAt) { }
