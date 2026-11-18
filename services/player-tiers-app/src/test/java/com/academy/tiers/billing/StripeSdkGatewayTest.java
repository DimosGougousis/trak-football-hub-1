package com.academy.tiers.billing;

import org.junit.jupiter.api.Test;

import javax.crypto.Mac;
import javax.crypto.spec.SecretKeySpec;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.util.HexFormat;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** The real Stripe gateway: signature verification and the test-mode-only rule (ADR-005). No network calls. */
class StripeSdkGatewayTest {

    private static final String WEBHOOK_SECRET = "whsec_test_secret_for_unit_tests";

    private static StripeProperties props(String key, boolean allowLive) {
        return new StripeProperties(key, WEBHOOK_SECRET, "price_basic_test", "price_premium_test",
            "https://app.example.test/billing/done", "https://app.example.test/billing/cancelled", allowLive);
    }

    private static String sign(String payload, long timestamp) throws Exception {
        Mac mac = Mac.getInstance("HmacSHA256");
        mac.init(new SecretKeySpec(WEBHOOK_SECRET.getBytes(StandardCharsets.UTF_8), "HmacSHA256"));
        String sig = HexFormat.of().formatHex(mac.doFinal((timestamp + "." + payload).getBytes(StandardCharsets.UTF_8)));
        return "t=" + timestamp + ",v1=" + sig;
    }

    @Test
    void aLiveSecretKeyIsRefusedUnlessExplicitlyAllowed() {
        assertThatThrownBy(() -> new StripeSdkGateway(props("sk_live_abc", false)))
            .isInstanceOf(IllegalStateException.class).hasMessageContaining("test mode");
        assertThatThrownBy(() -> new StripeSdkGateway(props("rk_live_abc", false)))
            .isInstanceOf(IllegalStateException.class);
        new StripeSdkGateway(props("sk_test_abc", false));
        new StripeSdkGateway(props("sk_live_abc", true));
    }

    @Test
    void aCorrectlySignedEventIsParsed() throws Exception {
        var gateway = new StripeSdkGateway(props("sk_test_abc", false));
        String payload = """
            {"id":"evt_1","type":"customer.subscription.updated","created":1893000000,"livemode":false,"data":{"object":{"id":"sub_1","customer":"cus_1","status":"active",
             "metadata":{"player_id":"00000000-0000-0000-0000-000000000001","parent_id":"00000000-0000-0000-0000-000000000002","tier":"premium"},
             "items":{"data":[{"price":{"id":"price_premium_test"},"current_period_end":1893456000}]}}}}""";
        WebhookEvent e = gateway.parseWebhook(payload, sign(payload, Instant.now().getEpochSecond()));
        assertThat(e.id()).isEqualTo("evt_1");
        assertThat(e.type()).isEqualTo("customer.subscription.updated");
        assertThat(e.status()).isEqualTo("active");
        assertThat(e.priceId()).isEqualTo("price_premium_test");
        assertThat(e.created()).isEqualTo(Instant.ofEpochSecond(1893000000));
        assertThat(e.livemode()).isFalse();
        assertThat(e.currentPeriodEnd()).isEqualTo(Instant.ofEpochSecond(1893456000));
    }

    @Test
    void aTamperedPayloadOrStaleSignatureIsRejected() throws Exception {
        var gateway = new StripeSdkGateway(props("sk_test_abc", false));
        String payload = "{\"id\":\"evt_2\",\"type\":\"customer.subscription.updated\",\"data\":{\"object\":{}}}";
        String header = sign(payload, Instant.now().getEpochSecond());
        assertThatThrownBy(() -> gateway.parseWebhook(payload.replace("evt_2", "evt_3"), header))
            .isInstanceOf(StripeGateway.InvalidSignatureException.class);
        String stale = sign(payload, Instant.now().minusSeconds(3600).getEpochSecond());
        assertThatThrownBy(() -> gateway.parseWebhook(payload, stale))
            .isInstanceOf(StripeGateway.InvalidSignatureException.class);
    }
}
