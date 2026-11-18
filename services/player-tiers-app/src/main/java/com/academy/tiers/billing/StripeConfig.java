package com.academy.tiers.billing;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class StripeConfig {

    /** Without a key, billing endpoints answer 503 billing_not_configured; with a live key the app will not start. */
    @Bean
    StripeGateway stripeGateway(StripeProperties props) {
        if (!props.configured()) {
            return new StripeGateway() {
                public String createCheckout(CheckoutRequest req) { throw new NotConfiguredException(); }
                public WebhookEvent parseWebhook(String payload, String header) { throw new NotConfiguredException(); }
            };
        }
        return new StripeSdkGateway(props);
    }
}
