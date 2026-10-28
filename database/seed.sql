-- Public local-demo accounts. Replaying this script never replaces an existing hash.
INSERT INTO users (id, username, password_hash, created_at) VALUES
('10000000-0000-4000-8000-000000000001', 'demo_a', '$2a$10$vFSPf81qskY4RGjgNZDDC.niIWPrw.S2vlR8.SeVWe/M.afqRtjQe', '2026-10-28 00:00:00.000000'),
('10000000-0000-4000-8000-000000000002', 'demo_b', '$2a$10$XhsK2xpkeCRMqCDQ9CseIuZsgRvZZQkX6HPHjXvt2FceTRtI7dwRC', '2026-10-28 00:00:00.000000')
ON DUPLICATE KEY UPDATE id = users.id;

INSERT INTO templates (id, title, category, category_title, description, cover_path, required_image_count, accepted_mime_types, max_file_size_bytes, result_path) VALUES
('travel-postcard', '旅行明信片', 'travel', '旅行风景', '上传两张旅行图片，模拟制作一张明信片。', 'covers/travel-postcard.jpg', 2, JSON_ARRAY('image/jpeg', 'image/png'), 5242880, 'results/travel-postcard.png'),
('coastal-memory', '海岸假日', 'travel', '旅行风景', '上传一张图片，模拟制作海岸主题纪念图。', 'covers/coastal-memory.jpg', 1, JSON_ARRAY('image/jpeg', 'image/png'), 5242880, 'results/coastal-memory.png'),
('studio-portrait', '光影肖像', 'portrait', '人像创意', '上传一张人像，模拟制作光影肖像。', 'covers/studio-portrait.jpg', 1, JSON_ARRAY('image/jpeg', 'image/png'), 5242880, 'results/studio-portrait.png'),
('double-portrait', '双人合影', 'portrait', '人像创意', '上传两张图片，模拟制作双人合影。', 'covers/double-portrait.jpg', 2, JSON_ARRAY('image/jpeg', 'image/png'), 5242880, 'results/double-portrait.png'),
('creative-collage', '创意拼贴', 'creative', '创意图片', '上传三张图片，模拟制作几何拼贴。', 'covers/creative-collage.jpg', 3, JSON_ARRAY('image/jpeg', 'image/png'), 5242880, 'results/creative-collage.png'),
('seasonal-card', '四季贺卡', 'creative', '创意图片', '上传三张图片，模拟制作四季主题贺卡。', 'covers/seasonal-card.jpg', 3, JSON_ARRAY('image/jpeg', 'image/png'), 5242880, 'results/seasonal-card.png')
ON DUPLICATE KEY UPDATE id = templates.id;
