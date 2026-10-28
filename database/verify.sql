-- Read-only summary. Execute through the MySQL container, not on the host database.
SELECT table_name FROM information_schema.tables WHERE table_schema = DATABASE() ORDER BY table_name;
SELECT username, CHAR_LENGTH(password_hash) AS bcrypt_length FROM users ORDER BY username;
SELECT category, category_title, COUNT(*) AS template_count FROM templates GROUP BY category, category_title ORDER BY category;
SELECT id, required_image_count, max_file_size_bytes FROM templates ORDER BY id;
SELECT index_name, GROUP_CONCAT(column_name ORDER BY seq_in_index) AS indexed_columns
FROM information_schema.statistics WHERE table_schema = DATABASE() AND table_name = 'tasks' GROUP BY index_name ORDER BY index_name;
SELECT table_name, constraint_name FROM information_schema.table_constraints
WHERE constraint_schema = DATABASE() AND constraint_type = 'FOREIGN KEY' ORDER BY table_name, constraint_name;
