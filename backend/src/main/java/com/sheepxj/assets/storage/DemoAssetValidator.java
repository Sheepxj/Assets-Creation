package com.sheepxj.assets.storage;

import com.sheepxj.assets.persistence.mapper.TemplateMapper;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.stereotype.Component;

@Component
public class DemoAssetValidator implements ApplicationRunner {
    private static final Logger log = LoggerFactory.getLogger(DemoAssetValidator.class);
    private final TemplateMapper templates;
    private final DemoAssetCatalog catalog;

    public DemoAssetValidator(TemplateMapper templates, DemoAssetCatalog catalog) {
        this.templates = templates;
        this.catalog = catalog;
    }

    @Override
    public void run(ApplicationArguments arguments) throws Exception {
        var items = templates.findAll(null);
        for (var item : items) {
            catalog.verifyImage(item.coverPath());
            catalog.verifyImage(item.resultPath());
        }
        for (var sample : List.of("samples/landscape.jpg", "samples/portrait.png", "samples/collage.png")) catalog.verifyImage(sample);
        log.info("Verified demo images for {} templates and 3 upload samples", items.size());
    }
}
