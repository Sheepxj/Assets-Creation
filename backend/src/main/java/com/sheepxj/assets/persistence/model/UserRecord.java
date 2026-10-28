package com.sheepxj.assets.persistence.model;

import java.time.Instant;

public record UserRecord(String id, String username, String passwordHash, Instant createdAt) { }
