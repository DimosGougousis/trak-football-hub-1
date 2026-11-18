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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Regression tests for the Milestone 4 review findings. */
class BillingReviewFixesTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;
    @Autowired FakeStripeGateway stripe;

    static final String BASIC_PRICE = "price_basic_test";
    static final String PREMIUM_PRICE = "price_premium_test";

    /** A subscription event: Stripe's created time, the item's price id, and the paid period end. */
    static String event(String type, String status, String subId, UUID player, UUID parent, String metadataTier,
                        String priceId, Instant created, Instant periodEnd, boolean livemode) {
        String end = periodEnd == null ? "" : ",\"current_period_end\":" + periodEnd.getEpochSecond();
        return """
            {"id":"evt_%s","type":"%s","created":%d,"livemode":%s,"data":{"object":{"id":"%s","customer":"cus_1","status":"%s",
             "metadata":{"player_id":"%s","parent_id":"%s","tier":"%s"},
             "items":{"data":[{"price":{"id":"%s"}%s}]}}}}
            """.formatted(UUID.randomUUID(), type, created.getEpochSecond(), livemode, subId, status,
            player, parent, metadataTier, priceId, end);
    }

    private void deliver(String payload) throws Exception {
        mvc.perform(post("/webhooks/stripe").header("Stripe-Signature", FakeStripeGateway.VALID_SIGNATURE)
            .contentType("application/json").content(payload)).andExpect(status().isOk());
    }

    private String tier(UUID player) {
        return jdbc.queryForObject("select tier from player_subscription where player_id = ?", String.class, player);
    }

    private static Instant month() { return Instant.now().plusSeconds(30L * 86400); }

    // Blocker 1: an older 'updated' delivered after 'deleted' must not re-grant Premium.
    @Test
    void anOlderUpdateArrivingAfterTheCancellationIsIgnored() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant t0 = Instant.now().minusSeconds(600);
        deliver(event("customer.subscription.deleted", "canceled", "sub_a", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0.plusSeconds(60), Instant.now(), false));
        deliver(event("customer.subscription.updated", "active", "sub_a", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0, month(), false));
        assertThat(tier(link.playerId())).isEqualTo("basic");
    }

    // Blocker 1, reverse: a late 'incomplete' must not downgrade a paying player.
    @Test
    void anOlderIncompleteEventDoesNotDowngradeAPayingPlayer() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant t0 = Instant.now().minusSeconds(600);
        deliver(event("customer.subscription.updated", "active", "sub_b", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0.plusSeconds(60), month(), false));
        deliver(event("customer.subscription.created", "incomplete", "sub_b", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0, month(), false));
        assertThat(tier(link.playerId())).isEqualTo("premium");
    }

    // Blocker 2: a paid subscription cannot be bought twice for one child.
    @Test
    void checkoutForAChildWhoAlreadyHasAPaidSubscriptionIs409() throws Exception {
        var link = accounts.activeLink(mvc);
        String second = TestAccounts.uniqueEmail("second");
        UUID secondParent = accounts.secondParent(mvc, link, second);
        accounts.setTier(link.playerId(), link.parentId(), "premium");
        for (UUID parent : new UUID[]{link.parentId(), secondParent}) {
            mvc.perform(post("/billing/checkout").with(accounts.as(parent)).contentType("application/json")
                    .content("{\"player_id\":\"" + link.playerId() + "\",\"tier\":\"premium\"}"))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error").value("already_subscribed"));
        }
    }

    // Blocker 2: an event for a different subscription cannot overwrite the paid one.
    @Test
    void aSecondSubscriptionsCancellationDoesNotDowngradeTheChild() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant t0 = Instant.now().minusSeconds(600);
        deliver(event("customer.subscription.updated", "active", "sub_first", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0, month(), false));
        deliver(event("customer.subscription.deleted", "canceled", "sub_other", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0.plusSeconds(60), Instant.now(), false));
        assertThat(tier(link.playerId())).isEqualTo("premium");
    }

    // Finding 3: a failed payment keeps the paid tier until the period ends (edge case 8).
    @Test
    void pastDueKeepsPremiumUntilThePeriodEnds() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(event("customer.subscription.updated", "past_due", "sub_c", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, Instant.now().minusSeconds(5), month(), false));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/players/{p}/premium-probe", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isOk());
    }

    // Finding 4: no period end means no paid tier.
    @Test
    void aSubscriptionWithoutAPeriodEndIsNotPremium() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(event("customer.subscription.updated", "active", "sub_d", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, Instant.now().minusSeconds(5), null, false));
        mvc.perform(org.springframework.test.web.servlet.request.MockMvcRequestBuilders
                .get("/players/{p}/premium-probe", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isPaymentRequired());
    }

    // Finding 5: the tier follows the price being charged, not the checkout metadata.
    @Test
    void theTierFollowsThePriceIdNotTheMetadata() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(event("customer.subscription.updated", "active", "sub_e", link.playerId(), link.parentId(), "premium",
            BASIC_PRICE, Instant.now().minusSeconds(5), month(), false));
        assertThat(tier(link.playerId())).isEqualTo("basic");
    }

    @Test
    void anEventForAnUnknownPriceIsIgnored() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(event("customer.subscription.updated", "active", "sub_f", link.playerId(), link.parentId(), "premium",
            "price_someone_elses", Instant.now().minusSeconds(5), month(), false));
        assertThat(jdbc.queryForObject("select count(*) from player_subscription where player_id = ?", Integer.class, link.playerId()))
            .isZero();
    }

    // Finding 6: live-mode events are refused while billing is test mode only (ADR-005).
    @Test
    void aLiveModeEventIsIgnored() throws Exception {
        var link = accounts.activeLink(mvc);
        deliver(event("customer.subscription.updated", "active", "sub_g", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, Instant.now().minusSeconds(5), month(), true));
        assertThat(jdbc.queryForObject("select count(*) from player_subscription where player_id = ?", Integer.class, link.playerId()))
            .isZero();
    }

    // Finding 7: a Stripe outage at checkout is a 502, not a 500.
    @Test
    void aStripeFailureAtCheckoutIs502() throws Exception {
        var link = accounts.activeLink(mvc);
        stripe.failNextCheckout();
        mvc.perform(post("/billing/checkout").with(accounts.as(link.parentId())).contentType("application/json")
                .content("{\"player_id\":\"" + link.playerId() + "\",\"tier\":\"premium\"}"))
            .andExpect(status().isBadGateway())
            .andExpect(jsonPath("$.error").value("billing_unavailable"));
    }

    // Finding 10: a cancellation applies even if the payer is no longer linked as a guardian.
    @Test
    void aCancellationAppliesEvenAfterTheGuardianLinkIsRemoved() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant t0 = Instant.now().minusSeconds(600);
        deliver(event("customer.subscription.updated", "active", "sub_h", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0, month(), false));
        jdbc.update("delete from player_guardian where player_id = ? and parent_id = ?", link.playerId(), link.parentId());
        deliver(event("customer.subscription.deleted", "canceled", "sub_h", link.playerId(), link.parentId(), "premium",
            PREMIUM_PRICE, t0.plusSeconds(60), Instant.now(), false));
        assertThat(tier(link.playerId())).isEqualTo("basic");
    }

    // Upgrade-prompt nit: the prompt is for the first milestone ever, not the first one while on Basic.
    @Test
    void aPlayerWhoWasPremiumAtTheirFirstMilestoneIsNotPromptedLater() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.setTier(link.playerId(), link.parentId(), "premium");
        mvc.perform(post("/players/{p}/skill-tree/{n}/complete", link.playerId(), "fundamentals-1").with(accounts.as(link.coachId())))
            .andExpect(status().isCreated());
        jdbc.update("delete from player_subscription where player_id = ?", link.playerId());   // back to Basic
        mvc.perform(post("/players/{p}/skill-tree/{n}/complete", link.playerId(), "fundamentals-2").with(accounts.as(link.coachId())))
            .andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("select count(*) from upgrade_prompt where player_id = ?", Integer.class, link.playerId())).isZero();
    }
}
