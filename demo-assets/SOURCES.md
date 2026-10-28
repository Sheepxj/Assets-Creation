# 示例素材来源

本目录的 15 张 JPEG／PNG 全部由本项目 `scripts/GenerateDemoAssets.java` 使用 Java 2D 几何绘图原创生成，不使用外部照片、参考截图、付费服务、系统字体或第三方品牌素材。可随本项目源代码分发并用于本题演示；非真实 AI 输出。

| 目录 | 文件 | 规格与用途 |
| --- | --- | --- |
| covers/ | 六个模板 ID 对应的 .jpg | 600×800，真实 JPEG 封面 |
| results/ | 同六个 ID 对应的 .png | 960×720，真实 PNG 模拟结果 |
| samples/landscape.jpg | 风景输入示例 | 960×640，供上传操作使用 |
| samples/portrait.png | 肖像输入示例 | 640×800，供上传操作使用 |
| samples/collage.png | 拼贴输入示例 | 800×640，供第三个上传位使用 |

六个模板 ID 为 travel-postcard、coastal-memory、studio-portrait、double-portrait、creative-collage、seasonal-card。数据库种子通过相对路径引用，实际文件随 Java 构建资源进入 JAR，运行不再下载。

`manifest.sha256` 记录每张图的 SHA-256，P1 测试同时校验字节、实际格式和可解码性。封面与结果是独立尺寸的原始文件，不把 SVG、HTML 或空文件更改扩展名冒充图片。

在仓库根目录使用固定 Java 21 容器重新生成（以下为 POSIX shell，Windows 将挂载源改为项目绝对路径）：

```sh
docker run --rm --mount "type=bind,source=$PWD,target=/workspace" --workdir /workspace maven:3.9.16-eclipse-temurin-21 java -Djava.awt.headless=true scripts/GenerateDemoAssets.java demo-assets
```

生成算法固定，不读取随机数、时间或网络。结果为模拟图片，不根据上传内容真实合成。后续若替换素材，应同步本文件、种子路径及哈希清单。
