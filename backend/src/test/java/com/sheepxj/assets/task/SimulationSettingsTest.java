package com.sheepxj.assets.task;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import static org.junit.jupiter.api.Assertions.*;

class SimulationSettingsTest {
    private final ApplicationContextRunner context = new ApplicationContextRunner().withUserConfiguration(TaskConfiguration.class)
            .withPropertyValues("app.simulation.check-delay-ms=0", "app.simulation.generate-delay-ms=1", "app.simulation.finalize-delay-ms=2", "app.simulation.fail-stage=NONE");

    @Test void validConfigurationBindsAndKeepsZeroDelay() {
        context.run(app -> {
            assertNull(app.getStartupFailure());
            var settings = app.getBean(SimulationSettings.class);
            assertEquals(0, settings.checkDelayMs()); assertEquals(1, settings.generateDelayMs()); assertEquals(2, settings.finalizeDelayMs());
        });
    }
    @Test void everyNegativeDelayPreventsStartup() {
        for (String name : new String[]{"check", "generate", "finalize"}) context.withPropertyValues("app.simulation." + name + "-delay-ms=-1")
                .run(app -> assertNotNull(app.getStartupFailure()));
    }
    @Test void invalidFailureStagePreventsStartup() {
        context.withPropertyValues("app.simulation.fail-stage=RANDOM").run(app -> assertNotNull(app.getStartupFailure()));
    }
}
