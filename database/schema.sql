-- MySQL 8.4. Initial schema only: IF NOT EXISTS never migrates an existing table.
CREATE TABLE IF NOT EXISTS users (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    username VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    password_hash VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_users_username (username),
    CONSTRAINT ck_users_username_length CHECK (CHAR_LENGTH(username) BETWEEN 3 AND 32)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS templates (
    id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    title VARCHAR(128) NOT NULL,
    category VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    category_title VARCHAR(64) NOT NULL,
    description VARCHAR(1000) NOT NULL,
    cover_path VARCHAR(255) NOT NULL,
    required_image_count INT NOT NULL,
    accepted_mime_types JSON NOT NULL,
    max_file_size_bytes BIGINT NOT NULL,
    result_path VARCHAR(255) NOT NULL,
    PRIMARY KEY (id),
    KEY idx_templates_category (category, id),
    CONSTRAINT ck_templates_image_count CHECK (required_image_count > 0),
    CONSTRAINT ck_templates_file_size CHECK (max_file_size_bytes BETWEEN 1 AND 5242880),
    CONSTRAINT ck_templates_mime_array CHECK (JSON_TYPE(accepted_mime_types) = 'ARRAY' AND JSON_LENGTH(accepted_mime_types) > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS assets (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_filename VARCHAR(255) NOT NULL,
    mime_type VARCHAR(32) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    size_bytes BIGINT NOT NULL,
    storage_path VARCHAR(512) NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uq_assets_id_user (id, user_id),
    KEY idx_assets_user_created (user_id, created_at, id),
    CONSTRAINT fk_assets_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT ck_assets_mime CHECK (mime_type IN ('image/jpeg', 'image/png')),
    CONSTRAINT ck_assets_size CHECK (size_bytes BETWEEN 1 AND 5242880)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS tasks (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    template_id VARCHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    template_title VARCHAR(128) NOT NULL,
    request_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    request_fingerprint CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    current_stage VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NULL,
    simulation_config_json JSON NOT NULL,
    created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    started_at DATETIME(6) NULL,
    finished_at DATETIME(6) NULL,
    result_path VARCHAR(512) NULL,
    error_code VARCHAR(64) NULL,
    error_message VARCHAR(512) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uq_tasks_user_request (user_id, request_id),
    UNIQUE KEY uq_tasks_id_user (id, user_id),
    KEY idx_tasks_queue (status, created_at, id),
    KEY idx_tasks_user_history (user_id, created_at, id),
    KEY idx_tasks_user_status (user_id, status, created_at, id),
    CONSTRAINT fk_tasks_user FOREIGN KEY (user_id) REFERENCES users (id),
    CONSTRAINT fk_tasks_template FOREIGN KEY (template_id) REFERENCES templates (id),
    CONSTRAINT ck_tasks_status CHECK (status IN ('QUEUED', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_tasks_stage CHECK (current_stage IS NULL OR current_stage IN ('MATERIAL_CHECK', 'GENERATE', 'FINALIZE')),
    CONSTRAINT ck_tasks_lifecycle CHECK (
        (status = 'QUEUED' AND current_stage IS NULL AND started_at IS NULL AND finished_at IS NULL AND result_path IS NULL AND error_code IS NULL AND error_message IS NULL)
        OR (status = 'RUNNING' AND current_stage IS NOT NULL AND started_at IS NOT NULL AND finished_at IS NULL AND result_path IS NULL AND error_code IS NULL AND error_message IS NULL)
        OR (status = 'SUCCEEDED' AND current_stage IS NOT NULL AND current_stage = 'FINALIZE' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND result_path IS NOT NULL AND error_code IS NULL AND error_message IS NULL)
        OR (status = 'FAILED' AND current_stage IS NOT NULL AND started_at IS NOT NULL AND finished_at IS NOT NULL AND result_path IS NULL AND error_code IS NOT NULL AND error_message IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS task_assets (
    task_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    asset_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    user_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    slot_index INT NOT NULL,
    PRIMARY KEY (task_id, slot_index),
    UNIQUE KEY uq_task_assets_task_asset (task_id, asset_id),
    CONSTRAINT fk_task_assets_task_owner FOREIGN KEY (task_id, user_id) REFERENCES tasks (id, user_id),
    CONSTRAINT fk_task_assets_asset_owner FOREIGN KEY (asset_id, user_id) REFERENCES assets (id, user_id),
    CONSTRAINT ck_task_assets_slot CHECK (slot_index >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS task_steps (
    task_id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    stage VARCHAR(24) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    status VARCHAR(16) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    started_at DATETIME(6) NULL,
    finished_at DATETIME(6) NULL,
    error_code VARCHAR(64) NULL,
    error_message VARCHAR(512) NULL,
    PRIMARY KEY (task_id, stage),
    CONSTRAINT fk_task_steps_task FOREIGN KEY (task_id) REFERENCES tasks (id),
    CONSTRAINT ck_task_steps_stage CHECK (stage IN ('MATERIAL_CHECK', 'GENERATE', 'FINALIZE')),
    CONSTRAINT ck_task_steps_status CHECK (status IN ('PENDING', 'RUNNING', 'SUCCEEDED', 'FAILED')),
    CONSTRAINT ck_task_steps_lifecycle CHECK (
        (status = 'PENDING' AND started_at IS NULL AND finished_at IS NULL AND error_code IS NULL AND error_message IS NULL)
        OR (status = 'RUNNING' AND started_at IS NOT NULL AND finished_at IS NULL AND error_code IS NULL AND error_message IS NULL)
        OR (status = 'SUCCEEDED' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NULL AND error_message IS NULL)
        OR (status = 'FAILED' AND started_at IS NOT NULL AND finished_at IS NOT NULL AND error_code IS NOT NULL AND error_message IS NOT NULL)
    )
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
