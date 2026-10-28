package com.sheepxj.assets;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.boot.autoconfigure.security.servlet.UserDetailsServiceAutoConfiguration;

@SpringBootApplication(exclude = UserDetailsServiceAutoConfiguration.class)
public class AssetsCreationApplication {
    public static void main(String[] args) {
        SpringApplication.run(AssetsCreationApplication.class, args);
    }
}
