import java.awt.Color;
import java.awt.GradientPaint;
import java.awt.Graphics2D;
import java.awt.RenderingHints;
import java.awt.geom.Path2D;
import java.awt.image.BufferedImage;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.util.HexFormat;
import java.util.List;
import javax.imageio.ImageIO;

/** Original geometric demo art: no downloaded imagery, fonts or external libraries. */
public class GenerateDemoAssets {
    private static final String[] IDS = {"travel-postcard", "coastal-memory", "studio-portrait",
            "double-portrait", "creative-collage", "seasonal-card"};
    private static final Color[] TOP = {new Color(45, 91, 137), new Color(38, 133, 164),
            new Color(88, 65, 124), new Color(139, 81, 96), new Color(49, 76, 94), new Color(65, 106, 87)};
    private static final Color[] BOTTOM = {new Color(245, 190, 137), new Color(180, 224, 210),
            new Color(222, 159, 153), new Color(246, 208, 169), new Color(185, 208, 181), new Color(231, 209, 153)};

    public static void main(String[] args) throws Exception {
        Path root = Path.of(args.length == 0 ? "demo-assets" : args[0]);
        for (String directory : List.of("covers", "results", "samples")) Files.createDirectories(root.resolve(directory));
        for (int index = 0; index < IDS.length; index++) {
            write(root.resolve("covers/" + IDS[index] + ".jpg"), render(600, 800, index, false), "jpeg");
            write(root.resolve("results/" + IDS[index] + ".png"), render(960, 720, index, true), "png");
        }
        write(root.resolve("samples/landscape.jpg"), render(960, 640, 0, false), "jpeg");
        write(root.resolve("samples/portrait.png"), render(640, 800, 2, false), "png");
        write(root.resolve("samples/collage.png"), render(800, 640, 4, false), "png");
        StringBuilder manifest = new StringBuilder();
        try (var paths = Files.walk(root)) {
            for (Path path : paths.filter(Files::isRegularFile)
                    .filter(path -> path.toString().endsWith(".jpg") || path.toString().endsWith(".png")).sorted().toList()) {
                String hash = HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(Files.readAllBytes(path)));
                manifest.append(hash).append("  ").append(root.relativize(path).toString().replace('\\', '/')).append('\n');
            }
        }
        Files.writeString(root.resolve("manifest.sha256"), manifest, StandardCharsets.UTF_8);
        System.out.println("Generated 6 JPEG covers, 6 PNG results and 3 JPEG/PNG samples.");
    }

    private static void write(Path path, BufferedImage image, String format) throws Exception {
        if (!ImageIO.write(image, format, path.toFile())) throw new IllegalStateException("Missing image encoder: " + format);
    }

    private static BufferedImage render(int width, int height, int variant, boolean result) {
        BufferedImage image = new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB);
        Graphics2D g = image.createGraphics();
        g.setRenderingHint(RenderingHints.KEY_ANTIALIASING, RenderingHints.VALUE_ANTIALIAS_ON);
        g.scale(width / 600.0, height / 800.0);
        g.setPaint(new GradientPaint(0, 0, TOP[variant], 240, 800, BOTTOM[variant]));
        g.fillRect(0, 0, 600, 800);
        g.setColor(new Color(255, 236, 181, 220));
        g.fillOval(350 - variant * 18, 110 + variant * 13, 125, 125);
        if (variant < 2 || variant == 5) {
            g.setColor(new Color(30, 85 + variant * 8, 103));
            Path2D hills = new Path2D.Double();
            hills.moveTo(0, 505); hills.lineTo(0, 415); hills.lineTo(145, 245);
            hills.lineTo(280, 435); hills.lineTo(390, 330); hills.lineTo(600, 470);
            hills.lineTo(600, 800); hills.lineTo(0, 800); hills.closePath(); g.fill(hills);
            g.setColor(new Color(98, 170, 174));
            g.fillOval(-180, 505, 940, 520);
            g.setColor(new Color(237, 216, 174));
            g.fillOval(150, 680, 650, 310);
            g.setColor(new Color(255, 255, 255, 110));
            for (int i = 0; i < 5; i++) g.fillRoundRect(40 + i * 30, 555 + i * 29, 260 - i * 25, 5, 5, 5);
        } else if (variant < 4) {
            portrait(g, variant == 2 ? 300 : 205, 255, variant == 2 ? 1.2 : 0.85);
            if (variant == 3) portrait(g, 410, 285, 0.82);
            g.setColor(new Color(255, 255, 255, 30));
            g.fillOval(-210, -110, 480, 980);
        } else {
            Color[] colors = {new Color(240, 181, 137), new Color(179, 200, 188), new Color(215, 197, 222)};
            for (int i = 0; i < 3; i++) {
                g.rotate((i - 1) * 0.09, 300, 400);
                g.setColor(new Color(245, 240, 225));
                g.fillRoundRect(65 + i * 105, 240 + i * 78, 265, 330, 16, 16);
                g.setColor(colors[i]); g.fillRect(80 + i * 105, 256 + i * 78, 235, 240);
                g.setColor(TOP[(variant + i) % TOP.length]);
                g.fillOval(110 + i * 105, 320 + i * 78, 120, 120);
                g.rotate(-(i - 1) * 0.09, 300, 400);
            }
        }
        if (result) {
            g.setColor(new Color(255, 248, 231));
            g.fillRect(0, 0, 600, 20); g.fillRect(0, 780, 600, 20);
            g.fillRect(0, 0, 20, 800); g.fillRect(580, 0, 20, 800);
            g.setColor(new Color(255, 255, 255, 150));
            g.fillRoundRect(38, 734, 130, 16, 8, 8);
        }
        g.dispose();
        return image;
    }

    private static void portrait(Graphics2D g, int x, int y, double scale) {
        var old = g.getTransform(); g.translate(x, y); g.scale(scale, scale);
        g.setColor(new Color(33, 30, 50)); g.fillRoundRect(-82, -35, 164, 210, 80, 80);
        g.setColor(new Color(224, 177, 146)); g.fillOval(-63, 0, 126, 155);
        g.fillRect(-27, 120, 54, 70);
        g.setColor(new Color(49, 55, 78)); g.fillRoundRect(-135, 167, 270, 350, 110, 110);
        g.setColor(new Color(244, 231, 210));
        Path2D collar = new Path2D.Double(); collar.moveTo(-45, 167); collar.lineTo(0, 245);
        collar.lineTo(45, 167); collar.closePath(); g.fill(collar);
        g.setTransform(old);
    }
}
