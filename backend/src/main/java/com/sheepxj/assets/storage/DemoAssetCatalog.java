package com.sheepxj.assets.storage;

import java.io.IOException;
import java.io.InputStream;
import javax.imageio.ImageIO;
import org.springframework.core.io.ClassPathResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Component;

@Component
public class DemoAssetCatalog {
    public Resource resource(String relativePath) {
        if (relativePath == null || !relativePath.matches("(?:covers|results|samples)/[a-z0-9-]+\\.(?:jpg|png)")) {
            throw new IllegalArgumentException("Invalid demo asset path");
        }
        return new ClassPathResource("demo-assets/" + relativePath);
    }

    public void verifyImage(String relativePath) throws IOException {
        try (InputStream input = resource(relativePath).getInputStream(); var imageInput = ImageIO.createImageInputStream(input)) {
            var readers = ImageIO.getImageReaders(imageInput);
            if (!readers.hasNext()) throw new IOException("Demo asset is not an image: " + relativePath);
            var reader = readers.next();
            try {
                String expected = relativePath.endsWith(".jpg") ? "JPEG" : "PNG";
                if (!reader.getFormatName().equalsIgnoreCase(expected)) throw new IOException("Unexpected image format: " + relativePath);
                reader.setInput(imageInput);
                var image = reader.read(0);
                if (image == null || image.getWidth() < 1 || image.getHeight() < 1) throw new IOException("Undecodable demo image: " + relativePath);
            } finally { reader.dispose(); }
        }
    }
}
