package com.sheepxj.assets.persistence.model;

import java.util.List;

public record TemplateRecord(String id, String title, String category, String categoryTitle,
        String description, String coverPath, int requiredImageCount, List<String> acceptedMimeTypes,
        long maxFileSizeBytes, String resultPath) { }
