package com.sheepxj.assets.task;

import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
@EnableConfigurationProperties(SimulationSettings.class)
public class TaskConfiguration {
    @FunctionalInterface
    public interface Delay { void pause(long milliseconds) throws InterruptedException; }

    @Bean
    Delay taskDelay() { return Thread::sleep; }
}
