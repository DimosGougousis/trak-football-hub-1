package com.academy.tiers;

import com.academy.tiers.billing.StripeGateway;
import com.academy.tiers.billing.WebhookEvent;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.context.annotation.Primary;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

/**
 * Stands in for Stripe in tests: no network calls (ADR-005). The webhook is
 * "signed" when the signature header is exactly {@link #VALID_SIGNATURE}; the real
 * HMAC check is covered by StripeSdkGatewayTest.
 */
@Component
@Primary
public class FakeStripeGateway implements StripeGateway {

    public static final String VALID_SIGNATURE = "fake-valid-signature";

    public final List<CheckoutRequest> checkouts = new CopyOnWriteArrayList<>();
    private final ObjectMapper json = new ObjectMapper();

    private volatile boolean failNext;

    public void failNextCheckout() { failNext = true; }

    @Override
    public String createCheckout(CheckoutRequest req) {
        if (failNext) { failNext = false; throw new BillingUnavailableException(); }
        checkouts.add(req);
        return "https://checkout.stripe.test/session/" + checkouts.size();
    }

    @Override
    public WebhookEvent parseWebhook(String payload, String signatureHeader) {
        if (!VALID_SIGNATURE.equals(signatureHeader)) throw new InvalidSignatureException();
        return WebhookEvent.fromStripeJson(payload, json);
    }
}
