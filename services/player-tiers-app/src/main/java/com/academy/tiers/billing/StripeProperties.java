package com.academy.tiers.billing;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Stripe settings, all from the environment; none are committed (ADR-005). */
@ConfigurationProperties("tiers.billing.stripe")
public record StripeProperties(String secretKey, String webhookSecret, String basicPriceId, String premiumPriceId,
                               String successUrl, String cancelUrl, boolean allowLiveKeys) {

    public boolean configured() {
        return secretKey != null && !secretKey.isBlank();
    }
}
