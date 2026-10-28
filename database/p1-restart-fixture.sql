-- Dedicated P1 verification database ONLY. These rows are never loaded by seed.sql.
INSERT INTO users (id, username, password_hash, created_at)
SELECT '20000000-0000-4000-8000-000000000001', 'p1_restart_probe', password_hash, '2026-10-28 09:00:00.123456'
FROM users WHERE username = 'demo_a';
INSERT INTO assets (id, user_id, original_filename, mime_type, size_bytes, storage_path, created_at) VALUES
('20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 'restart-probe.png', 'image/png', 120, 'uploads/restart-probe.png', '2026-10-28 09:00:00.123456');
INSERT INTO tasks (id, user_id, template_id, template_title, request_id, request_fingerprint, status, simulation_config_json, created_at) VALUES
('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000001', 'coastal-memory', '重启保留验证', '20000000-0000-4000-8000-000000000004', REPEAT('a', 64), 'QUEUED', JSON_OBJECT('checkDelayMs', 2000, 'generateDelayMs', 8000, 'finalizeDelayMs', 2000, 'failStage', 'NONE'), '2026-10-28 09:00:00.123456');
INSERT INTO task_assets (task_id, asset_id, user_id, slot_index) VALUES
('20000000-0000-4000-8000-000000000003', '20000000-0000-4000-8000-000000000002', '20000000-0000-4000-8000-000000000001', 0);
INSERT INTO task_steps (task_id, stage, status) VALUES
('20000000-0000-4000-8000-000000000003', 'MATERIAL_CHECK', 'PENDING'),
('20000000-0000-4000-8000-000000000003', 'GENERATE', 'PENDING'),
('20000000-0000-4000-8000-000000000003', 'FINALIZE', 'PENDING');
