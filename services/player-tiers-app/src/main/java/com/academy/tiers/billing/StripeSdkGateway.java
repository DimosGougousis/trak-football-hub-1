package com.academy.tiers.billing;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.checkout.Session;
import com.stripe.net.RequestOptions;
import com.stripe.net.Webhook;
import com.stripe.param.checkout.SessionCreateParams;

/**
 * Production Stripe gateway. Refuses a live key unless a deployment explicitly sets
 * {@code tiers.billing.stripe.allow-live-keys=true} (ADR-005: test mode only while
 * the AI-built billing is in its first release).
 */
public class StripeSdkGateway implements StripeGateway {

    private static final long SIGNATURE_TOLERANCE_SECONDS = 300;

    private final StripeProperties props;
    private final ObjectMapper json = new ObjectMapper();

    public StripeSdkGateway(StripeProperties props) {
        String key = props.secretKey() == null ? "" : props.secretKey();
        boolean testKey = key.startsWith("sk_test_") || key.startsWith("rk_test_");
        if (!testKey && !props.allowLiveKeys()) {
            throw new IllegalStateException("Stripe is limited to test mode (ADR-005): use an sk_test_ key, "
                + "or set tiers.billing.stripe.allow-live-keys=true in a reviewed deployment");
        }
        this.props = props;
    }

    @Override
    public String createCheckout(CheckoutRequest req) {
        String price = "premium".equals(req.tier()) ? props.premiumPriceId() : props.basicPriceId();
        if (price == null || price.isBlank()) throw new NotConfiguredException();
        var metadata = java.util.Map.of(
            "player_id", req.playerId().toString(), "parent_id", req.parentId().toString(), "tier", req.tier());
        SessionCreateParams params = SessionCreateParams.builder()
            .setMode(SessionCreateParams.Mode.SUBSCRIPTION)
            .addLineItem(SessionCreateParams.LineItem.builder().setPrice(price).setQuantity(1L).build())
            .setCustomerEmail(req.parentEmail())
            .setClientReferenceId(req.playerId().toString())
            .setSuccessUrl(props.successUrl())
            .setCancelUrl(props.cancelUrl())
            .setSubscriptionData(SessionCreateParams.SubscriptionData.builder().putAllMetadata(metadata).build())
            .putAllMetadata(metadata)
            .build();
        try {
            return Session.create(params, RequestOptions.builder().setApiKey(props.secretKey()).build()).getUrl();
        } catch (StripeException e) {
            throw new BillingUnavailableException(e);
        }
    }

    @Override
    public WebhookEvent parseWebhook(String payload, String signatureHeader) {
        if (props.webhookSecret() == null || props.webhookSecret().isBlank()) throw new NotConfiguredException();
        try {
            Webhook.Signature.verifyHeader(payload, signatureHeader, props.webhookSecret(), SIGNATURE_TOLERANCE_SECONDS);
        } catch (SignatureVerificationException | RuntimeException e) {
            throw new InvalidSignatureException();
        }
        return WebhookEvent.fromStripeJson(payload, json);
    }
}
