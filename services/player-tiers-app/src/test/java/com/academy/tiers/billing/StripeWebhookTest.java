package com.academy.tiers.billing;

import com.academy.tiers.FakeStripeGateway;
import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Task 4.4: the Stripe webhook sets the tier, idempotently, and only with a valid signature. */
class StripeWebhookTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    private static final java.util.concurrent.atomic.AtomicLong SEQ = new java.util.concurrent.atomic.AtomicLong();

    static String subscriptionEvent(String eventId, String type, String status, UUID player, UUID parent, String tier, Instant periodEnd) {
        String price = "premium".equals(tier) ? "price_premium_test" : "price_basic_test";
        return """
            {"id":"%s","type":"%s","created":%d,"livemode":false,"data":{"object":{"id":"sub_%s","customer":"cus_1","status":"%s",
             "metadata":{"player_id":"%s","parent_id":"%s","tier":"%s"},
             "items":{"data":[{"price":{"id":"%s"},"current_period_end":%d}]}}}}
            """.formatted(eventId, type, Instant.now().getEpochSecond() + SEQ.incrementAndGet(), player.toString().substring(0, 8),
                status, player, parent, tier, price, periodEnd.getEpochSecond());
    }

    private String tierOf(UUID player) {
        return jdbc.queryForList("select tier from player_subscription where player_id = ?", String.class, player)
            .stream().findFirst().orElse("basic");
    }

    private org.springframework.test.web.servlet.ResultActions deliver(String payload, String signature) throws Exception {
        return mvc.perform(post("/webhooks/stripe").header("Stripe-Signature", signature)
            .contentType("application/json").content(payload));
    }

    @Test
    void activeSubscriptionMovesThePlayerToPremiumAndEmitsTierChanged() throws Exception {
        var link = accounts.activeLink(mvc);
        String evt = "evt_" + UUID.randomUUID();
        deliver(subscriptionEvent(evt, "customer.subscription.updated", "active", link.playerId(), link.parentId(), "premium",
                Instant.now().plusSeconds(30 * 86400)), FakeStripeGateway.VALID_SIGNATURE)
            .andExpect(status().isOk());
        assertThat(tierOf(link.playerId())).isEqualTo("premium");
        assertThat(jdbc.queryForObject("select count(*) from analytics_event where type = 'tier_changed' and player_id = ?",
            Integer.class, link.playerId())).isEqualTo(1);
    }

    @Test
    void replayingTheSameEventChangesNothing() throws Exception {
        var link = accounts.activeLink(mvc);
        String payload = subscriptionEvent("evt_" + UUID.randomUUID(), "customer.subscription.updated", "active",
            link.playerId(), link.parentId(), "premium", Instant.now().plusSeconds(86400));
        deliver(payload, FakeStripeGateway.VALID_SIGNATURE).andExpect(status().isOk());
        deliver(payload, FakeStripeGateway.VALID_SIGNATURE).andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from analytics_event where type = 'tier_changed' and player_id = ?",
            Integer.class, link.playerId())).isEqualTo(1);
    }

    @Test
    void aBadSignatureIsRejectedAndChangesNothing() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(subscriptionEvent("evt_" + UUID.randomUUID(), "customer.subscription.updated", "active",
                link.playerId(), link.parentId(), "premium", Instant.now().plusSeconds(86400)), "t=1,v1=forged")
            .andExpect(status().isBadRequest());
        assertThat(tierOf(link.playerId())).isEqualTo("basic");
    }

    @Test
    void cancelledSubscriptionFallsBackToBasicAndKeepsProgress() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(subscriptionEvent("evt_" + UUID.randomUUID(), "customer.subscription.updated", "active",
            link.playerId(), link.parentId(), "premium", Instant.now().plusSeconds(86400)), FakeStripeGateway.VALID_SIGNATURE);
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId())).contentType("application/json")
            .content("{\"test_type\":\"sprint_20m\",\"results\":{\"pace\":66},\"signed_at\":\"" + Instant.now().minusSeconds(60) + "\"}"))
            .andExpect(status().isCreated());

        deliver(subscriptionEvent("evt_" + UUID.randomUUID(), "customer.subscription.deleted", "canceled",
            link.playerId(), link.parentId(), "premium", Instant.now()), FakeStripeGateway.VALID_SIGNATURE)
            .andExpect(status().isOk());
        assertThat(tierOf(link.playerId())).isEqualTo("basic");
        assertThat(jdbc.queryForObject("select value from player_attribute where player_id = ? and name = 'pace'",
            Integer.class, link.playerId())).isEqualTo(66);
    }

    @Test
    void anEventForAPlayerTheParentDoesNotGuardIsIgnored() throws Exception {
        var a = accounts.activeLink(mvc);
        var b = accounts.activeLink(mvc);
        deliver(subscriptionEvent("evt_" + UUID.randomUUID(), "customer.subscription.updated", "active",
            a.playerId(), b.parentId(), "premium", Instant.now().plusSeconds(86400)), FakeStripeGateway.VALID_SIGNATURE)
            .andExpect(status().isOk());
        assertThat(tierOf(a.playerId())).isEqualTo("basic");
    }

    @Test
    void unrelatedEventTypesAreAcknowledged() throws Exception {
        deliver("{\"id\":\"evt_" + UUID.randomUUID() + "\",\"type\":\"invoice.created\",\"data\":{\"object\":{}}}",
            FakeStripeGateway.VALID_SIGNATURE).andExpect(status().isOk());
    }
}
