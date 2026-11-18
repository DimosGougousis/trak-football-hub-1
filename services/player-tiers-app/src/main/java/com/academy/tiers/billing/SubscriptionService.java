package com.academy.tiers.billing;

import com.academy.tiers.analytics.AnalyticsEvents;
import com.academy.tiers.entitlements.TierService;
import com.academy.tiers.identity.AccountService;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * Applies Stripe subscription events, one player at a time. Rules:
 * <ul>
 *   <li>Idempotent by event id; an event older than the last one applied is skipped,
 *       because Stripe can deliver retries out of order.</li>
 *   <li>The tier follows the price being charged, never the checkout metadata.</li>
 *   <li>Live-mode events are ignored while billing is test mode only (ADR-005).</li>
 *   <li>A second subscription cannot overwrite the one that is paid and in period.</li>
 *   <li>Upgrades need the payer to be the player's guardian; downgrades always apply.</li>
 *   <li>A failed payment ({@code past_due}) keeps the tier until the period ends.</li>
 * </ul>
 * Progress is never touched (ADR-002).
 */
@Service
public class SubscriptionService {

    private static final Logger log = LoggerFactory.getLogger(SubscriptionService.class);
    public static final Set<String> PAID = Set.of("active", "trialing", "past_due");

    private final JdbcTemplate jdbc;
    private final AccountService accounts;
    private final TierService tiers;
    private final AnalyticsEvents events;
    private final StripeProperties stripe;
    private final Clock clock;

    public SubscriptionService(JdbcTemplate jdbc, AccountService accounts, TierService tiers, AnalyticsEvents events,
                               StripeProperties stripe, Clock clock) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.tiers = tiers;
        this.events = events;
        this.stripe = stripe;
        this.clock = clock;
    }

    @Transactional
    public void apply(WebhookEvent e) {
        if (e.id() == null) throw new IllegalArgumentException("event without id");
        int fresh = jdbc.update("insert into stripe_event(id, type) values (?, ?) on conflict do nothing", e.id(), String.valueOf(e.type()));
        if (fresh == 0 || !e.isSubscriptionEvent()) return;
        if (e.livemode() && !stripe.allowLiveKeys()) { skip(e, "live-mode event while billing is test mode only"); return; }
        if (e.playerId() == null || e.parentId() == null) { skip(e, "missing player or parent metadata"); return; }
        String priceTier = tierForPrice(e.priceId());
        if (priceTier == null) { skip(e, "unknown price " + e.priceId()); return; }

        // One player's events apply one at a time, so 'before' and tier_changed are exact.
        jdbc.query("select pg_advisory_xact_lock(hashtext(?))", rs -> {}, "subscription|" + e.playerId());

        List<Map<String, Object>> rows = jdbc.queryForList(
            "select stripe_subscription_id, status, current_period_end, last_event_created from player_subscription where player_id = ?",
            e.playerId());
        Map<String, Object> current = rows.isEmpty() ? null : rows.get(0);
        if (current != null) {
            Timestamp last = (Timestamp) current.get("last_event_created");
            if (last != null && e.created() != null && e.created().isBefore(last.toInstant())) { skip(e, "older than the last applied event"); return; }
            boolean otherSubscription = current.get("stripe_subscription_id") != null
                && !current.get("stripe_subscription_id").equals(e.subscriptionId());
            if (otherSubscription && paidAndInPeriod(current)) { skip(e, "another subscription is paid for this player"); return; }
        }

        String status = e.type().endsWith(".deleted") ? "canceled" : String.valueOf(e.status());
        boolean paid = PAID.contains(status);
        if (paid && !accounts.isGuardian(e.parentId(), e.playerId())) { skip(e, "payer is not a guardian of the player"); return; }
        String tier = paid ? priceTier : "basic";

        String before = tiers.tierOf(e.playerId());
        jdbc.update("""
            insert into player_subscription(player_id, payer_parent_id, tier, status, stripe_customer_id, stripe_subscription_id,
                                            current_period_end, last_event_created)
            values (?, ?, ?, ?, ?, ?, ?, ?)
            on conflict (player_id) do update set payer_parent_id = excluded.payer_parent_id, tier = excluded.tier,
              status = excluded.status, stripe_customer_id = excluded.stripe_customer_id,
              stripe_subscription_id = excluded.stripe_subscription_id, current_period_end = excluded.current_period_end,
              last_event_created = excluded.last_event_created, updated_at = now()
            """, e.playerId(), e.parentId(), tier, status, e.customerId(), e.subscriptionId(),
            ts(e.currentPeriodEnd()), ts(e.created()));
        String after = tiers.tierOf(e.playerId());
        if (!after.equals(before)) {
            events.emit("tier_changed", e.playerId(), Map.of("from", before, "to", after, "stripe_event", e.id()));
        }
    }

    private String tierForPrice(String priceId) {
        if (priceId == null) return null;
        if (priceId.equals(stripe.premiumPriceId())) return "premium";
        if (priceId.equals(stripe.basicPriceId())) return "basic";
        return null;
    }

    private boolean paidAndInPeriod(Map<String, Object> row) {
        Timestamp end = (Timestamp) row.get("current_period_end");
        return PAID.contains(String.valueOf(row.get("status"))) && end != null && end.toInstant().isAfter(Instant.now(clock));
    }

    private static Timestamp ts(Instant i) {
        return i == null ? null : Timestamp.from(i);
    }

    private static void skip(WebhookEvent e, String why) {
        log.warn("stripe event {} ({}) not applied: {}", e.id(), e.type(), why);
    }
}
