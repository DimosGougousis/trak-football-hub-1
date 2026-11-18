package com.academy.tiers.entitlements;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import java.util.Map;

@Configuration
public class EntitlementsConfig {

    /** {@code tiers.flags.<feature>=true|false} overrides the flag in entitlements.yaml. */
    @ConfigurationProperties("tiers")
    public record FlagProperties(Map<String, Boolean> flags) {
        public FlagProperties {
            flags = flags == null ? Map.of() : Map.copyOf(flags);
        }
    }

    @Bean
    Entitlements entitlements(FlagProperties props) {
        return Entitlements.load("entitlements.yaml", props.flags());
    }
}
