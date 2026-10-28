SELECT 'probe_counts' AS check_name,
  (SELECT COUNT(*) FROM users WHERE id='20000000-0000-4000-8000-000000000001') AS users,
  (SELECT COUNT(*) FROM assets WHERE id='20000000-0000-4000-8000-000000000002') AS assets,
  (SELECT COUNT(*) FROM tasks WHERE id='20000000-0000-4000-8000-000000000003') AS tasks,
  (SELECT COUNT(*) FROM task_assets WHERE task_id='20000000-0000-4000-8000-000000000003') AS links,
  (SELECT COUNT(*) FROM task_steps WHERE task_id='20000000-0000-4000-8000-000000000003') AS steps;
SELECT username, SHA2(password_hash, 256) AS hash_fingerprint, created_at FROM users WHERE id='20000000-0000-4000-8000-000000000001';
SELECT original_filename, mime_type, size_bytes, storage_path, created_at FROM assets WHERE id='20000000-0000-4000-8000-000000000002';
SELECT template_title, status, current_stage, simulation_config_json, created_at, started_at, finished_at, result_path FROM tasks WHERE id='20000000-0000-4000-8000-000000000003';
SELECT stage, status, started_at, finished_at FROM task_steps WHERE task_id='20000000-0000-4000-8000-000000000003' ORDER BY stage;
SELECT COUNT(*) AS seed_templates FROM templates;
