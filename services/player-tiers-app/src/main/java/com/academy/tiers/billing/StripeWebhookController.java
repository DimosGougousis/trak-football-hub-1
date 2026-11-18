package com.academy.tiers.billing;

import com.academy.tiers.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.Map;

/** Stripe calls this without a user token; the Stripe-Signature header is the authentication. */
@RestController
public class StripeWebhookController {

    private final StripeGateway stripe;
    private final SubscriptionService subscriptions;

    public StripeWebhookController(StripeGateway stripe, SubscriptionService subscriptions) {
        this.stripe = stripe;
        this.subscriptions = subscriptions;
    }

    @PostMapping("/webhooks/stripe")
    Map<String, Object> receive(@RequestBody String payload,
                                @RequestHeader(value = "Stripe-Signature", required = false) String signature) {
        WebhookEvent event;
        try {
            event = stripe.parseWebhook(payload, signature == null ? "" : signature);
        } catch (StripeGateway.InvalidSignatureException | IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "invalid_signature");
        } catch (StripeGateway.NotConfiguredException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "billing_not_configured");
        }
        subscriptions.apply(event);
        return Map.of("received", true);
    }
}
