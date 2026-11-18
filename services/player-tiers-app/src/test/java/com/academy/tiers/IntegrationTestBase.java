package com.academy.tiers;

import org.springframework.boot.test.autoconfigure.web.servlet.AutoConfigureMockMvc;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.testcontainers.service.connection.ServiceConnection;
import org.testcontainers.containers.PostgreSQLContainer;

/**
 * Every integration test extends this. One Postgres container is shared by the
 * whole test run (singleton pattern); tests isolate themselves by creating a
 * fresh academy each time instead of truncating tables.
 *
 * The consent age is Greece's (15) for the suite. ConsentUnsetTest overrides it
 * to prove onboarding fails closed when an environment forgets to set it.
 */
@SpringBootTest(properties = {
    "tiers.consent.min-age-without-verified-consent=15",
    "tiers.jwt.secret=test-only-hs256-secret-at-least-32-bytes-long",
    "tiers.billing.stripe.basic-price-id=price_basic_test",
    "tiers.billing.stripe.premium-price-id=price_premium_test"
})
@AutoConfigureMockMvc
public abstract class IntegrationTestBase {

    @ServiceConnection
    static final PostgreSQLContainer<?> DB = new PostgreSQLContainer<>("postgres:16");

    static {
        DB.start();
    }
}
