package com.academy.tiers.billing;

import java.math.BigDecimal;
import java.util.UUID;

/** The only way the app talks to Stripe. Production: {@link StripeSdkGateway} (test mode only, ADR-005). */
public interface StripeGateway {

    record CheckoutRequest(UUID parentId, String parentEmail, UUID playerId, String tier, BigDecimal priceEur) {}

    /** Creates a Stripe Checkout session for a subscription and returns its URL. */
    String createCheckout(CheckoutRequest req);

    /** Verifies the Stripe-Signature header and parses the event; throws {@link InvalidSignatureException}. */
    WebhookEvent parseWebhook(String payload, String signatureHeader);

    class InvalidSignatureException extends RuntimeException {
        public InvalidSignatureException() { super("invalid Stripe signature"); }
    }

    /** Stripe could not be reached or refused the request. Mapped to 502 billing_unavailable. */
    class BillingUnavailableException extends RuntimeException {
        public BillingUnavailableException() { super("Stripe is unavailable"); }
        public BillingUnavailableException(Throwable cause) { super("Stripe is unavailable", cause); }
    }

    class NotConfiguredException extends RuntimeException {
        public NotConfiguredException() { super("billing is not configured"); }
    }
}
