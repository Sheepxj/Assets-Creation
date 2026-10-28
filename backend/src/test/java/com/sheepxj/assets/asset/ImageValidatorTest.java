package com.sheepxj.assets.asset;

import com.sheepxj.assets.common.ApiException;
import java.nio.ByteBuffer;
import java.util.Arrays;
import java.util.zip.CRC32;
import org.junit.jupiter.api.Test;
import org.springframework.core.io.ClassPathResource;
import org.springframework.mock.web.MockMultipartFile;

import static org.junit.jupiter.api.Assertions.*;

class ImageValidatorTest {
    private final ImageValidator validator = new ImageValidator();

    @Test
    void realJpegAndPngKeepTheirBytesAndCanonicalTypes() throws Exception {
        for (String[] sample : new String[][]{{"portrait.png", "image/png", "png"}, {"landscape.jpg", "image/jpeg", "jpg"}}) {
            byte[] bytes = sample(sample[0]);
            var result = validator.validate(new MockMultipartFile("file", "../../" + sample[0], sample[1], bytes));
            assertArrayEquals(bytes, result.bytes());
            assertEquals(sample[1], result.mimeType()); assertEquals(sample[2], result.extension());
            assertEquals(sample[0], result.originalFilename());
        }
    }

    @Test
    void emptyAndOversizedInputsAreRejectedBeforeDecoding() {
        assertEquals("FILE_EMPTY", failure(new byte[0], "image/png").code());
        var error = failure(new byte[ImageValidator.MAX_FILE_SIZE + 1], "image/png");
        assertEquals(413, error.status().value()); assertEquals("FILE_TOO_LARGE", error.code());
    }

    @Test
    void headersCannotDisguiseHtmlSvgOrAnotherImageFormat() throws Exception {
        assertEquals(415, failure("<html>not an image</html>".getBytes(), "image/png").status().value());
        assertEquals(415, failure("<svg></svg>".getBytes(), "image/png").status().value());
        assertEquals(415, failure(sample("portrait.png"), "image/gif").status().value());
        assertEquals("IMAGE_TYPE_MISMATCH", failure(sample("portrait.png"), "image/jpeg").code());
        assertEquals(415, failure(sample("portrait.png"), null).status().value());
    }

    @Test
    void supportedMagicAloneDoesNotMakeDamagedImagesValid() throws Exception {
        assertEquals("INVALID_IMAGE", failure(Arrays.copyOf(sample("portrait.png"), 20), "image/png").code());
        assertEquals("INVALID_IMAGE", failure(new byte[]{(byte) 255, (byte) 216, (byte) 255}, "image/jpeg").code());
    }

    @Test
    void unreasonableDimensionsAreRejectedBeforePixelAllocation() throws Exception {
        byte[] bytes = sample("portrait.png");
        ByteBuffer.wrap(bytes).putInt(16, 50000).putInt(20, 50000);
        var crc = new CRC32(); crc.update(bytes, 12, 17);
        ByteBuffer.wrap(bytes).putInt(29, (int) crc.getValue());
        assertEquals("IMAGE_DIMENSIONS_TOO_LARGE", failure(bytes, "image/png").code());
    }

    @Test
    void originalNamesHaveClearLengthAndControlCharacterRules() throws Exception {
        for (String name : new String[]{"a".repeat(256) + ".png", "line\nbreak.png"}) {
            var error = assertThrows(ApiException.class, () -> validator.validate(new MockMultipartFile("file", name, "image/png", sample("portrait.png"))));
            assertEquals("INVALID_FILENAME", error.code());
        }
    }

    private ApiException failure(byte[] bytes, String mime) {
        return assertThrows(ApiException.class, () -> validator.validate(new MockMultipartFile("file", "probe.png", mime, bytes)));
    }
    static byte[] sample(String name) throws Exception {
        try (var input = new ClassPathResource("demo-assets/samples/" + name).getInputStream()) { return input.readAllBytes(); }
    }
}
