package com.sheepxj.assets.asset;

import com.sheepxj.assets.common.ApiException;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.Arrays;
import java.util.Locale;
import java.util.Map;
import javax.imageio.ImageIO;
import javax.imageio.stream.MemoryCacheImageInputStream;
import org.springframework.http.HttpStatus;
import org.springframework.core.io.InputStreamSource;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.StringUtils;
import org.springframework.web.multipart.MultipartFile;

@Component
public class ImageValidator {
    public static final int MAX_FILE_SIZE = 5 * 1024 * 1024;
    public static final long MAX_PIXELS = 40_000_000L;
    private static final byte[] PNG_MAGIC = {(byte) 137, 80, 78, 71, 13, 10, 26, 10};

    public record ValidatedImage(byte[] bytes, String mimeType, String extension, String originalFilename) { }

    public ValidatedImage validate(MultipartFile file) {
        if (file == null || file.isEmpty()) throw invalid(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "请选择一张非空图片");
        return validate(file.getSize(), file.getContentType(), file.getOriginalFilename(), file::getInputStream);
    }

    public ValidatedImage validateStored(Path path, String mimeType, String filename) throws IOException {
        return validate(Files.size(path), mimeType, filename, () -> Files.newInputStream(path));
    }

    private ValidatedImage validate(long size, String contentType, String filename, InputStreamSource source) {
        if (size == 0) throw invalid(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "请选择一张非空图片");
        if (size > MAX_FILE_SIZE) throw tooLarge();
        String claimed;
        try {
            var type = MediaType.parseMediaType(contentType == null ? "application/octet-stream" : contentType);
            claimed = (type.getType() + "/" + type.getSubtype()).toLowerCase(Locale.ROOT);
        } catch (IllegalArgumentException exception) {
            throw unsupported();
        }
        if (!claimed.equals("image/jpeg") && !claimed.equals("image/png")) throw unsupported();
        byte[] bytes;
        try (var input = source.getInputStream()) { bytes = input.readNBytes(MAX_FILE_SIZE + 1); }
        catch (IOException exception) { throw invalid(HttpStatus.BAD_REQUEST, "UPLOAD_UNREADABLE", "无法读取上传文件，请重新上传"); }
        if (bytes.length > MAX_FILE_SIZE) throw tooLarge();
        if (bytes.length == 0) throw invalid(HttpStatus.BAD_REQUEST, "FILE_EMPTY", "请选择一张非空图片");
        String actual = bytes.length >= 8 && Arrays.equals(Arrays.copyOf(bytes, 8), PNG_MAGIC) ? "image/png"
                : bytes.length >= 3 && (bytes[0] & 255) == 255 && (bytes[1] & 255) == 216 && (bytes[2] & 255) == 255 ? "image/jpeg" : null;
        if (actual == null) throw unsupported();
        if (!actual.equals(claimed)) throw invalid(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "IMAGE_TYPE_MISMATCH", "文件声明类型与实际图片格式不一致");
        try (var input = new MemoryCacheImageInputStream(new ByteArrayInputStream(bytes))) {
            var readers = ImageIO.getImageReaders(input);
            if (!readers.hasNext()) throw damaged();
            var reader = readers.next();
            try {
                reader.setInput(input);
                int width = reader.getWidth(0), height = reader.getHeight(0);
                if (width < 1 || height < 1) throw damaged();
                if ((long) width * height > MAX_PIXELS) throw invalid(HttpStatus.BAD_REQUEST, "IMAGE_DIMENSIONS_TOO_LARGE", "图片分辨率超过 4000 万像素，请压缩后重试");
                var decoded = reader.read(0);
                if (decoded == null) throw damaged();
                decoded.flush();
            } finally { reader.dispose(); }
        } catch (IOException | IllegalArgumentException exception) { throw damaged(); }
        String extension = actual.equals("image/png") ? "png" : "jpg";
        String original = StringUtils.getFilename(filename == null ? "" : filename.replace('\\', '/'));
        if (original == null || original.isBlank()) original = "image." + extension;
        if (original.codePointCount(0, original.length()) > 255 || original.codePoints().anyMatch(Character::isISOControl)) {
            throw invalid(HttpStatus.BAD_REQUEST, "INVALID_FILENAME", "文件名不合法或超过 255 个字符，请重命名后上传");
        }
        return new ValidatedImage(bytes, actual, extension, original);
    }

    private static ApiException unsupported() { return invalid(HttpStatus.UNSUPPORTED_MEDIA_TYPE, "UNSUPPORTED_IMAGE_TYPE", "仅支持真实的 JPEG 或 PNG 图片"); }
    private static ApiException damaged() { return invalid(HttpStatus.BAD_REQUEST, "INVALID_IMAGE", "图片已损坏或无法解码，请更换图片"); }
    private static ApiException tooLarge() { return invalid(HttpStatus.PAYLOAD_TOO_LARGE, "FILE_TOO_LARGE", "单张图片不能超过 5 MiB"); }
    private static ApiException invalid(HttpStatus status, String code, String message) { return new ApiException(status, code, message, Map.of("file", message)); }
}
