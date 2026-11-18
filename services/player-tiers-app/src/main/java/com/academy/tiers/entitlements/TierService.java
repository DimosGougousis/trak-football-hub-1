package com.academy.tiers.entitlements;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * A player's plan right now. Every onboarded player is on Basic (OQ-8). A paid tier
 * holds only while Stripe reports the subscription active, trialing or past_due
 * (a failed payment keeps the tier until the period ends, edge case 8) and the paid
 * period has a known end in the future. No end date means no paid tier.
 */
@Service
public class TierService {

    private static final Set<String> PAID = Set.of("active", "trialing", "past_due");

    private final JdbcTemplate jdbc;
    private final Clock clock;

    public TierService(JdbcTemplate jdbc, Clock clock) {
        this.jdbc = jdbc;
        this.clock = clock;
    }

    public String tierOf(UUID playerId) {
        List<Map<String, Object>> rows = jdbc.queryForList(
            "select tier, status, current_period_end from player_subscription where player_id = ?", playerId);
        if (rows.isEmpty()) return "basic";
        var row = rows.get(0);
        Timestamp end = (Timestamp) row.get("current_period_end");
        boolean paid = PAID.contains(String.valueOf(row.get("status")));
        boolean inPeriod = end != null && end.toInstant().isAfter(Instant.now(clock));
        return paid && inPeriod ? (String) row.get("tier") : "basic";
    }

    /** True while a subscription is paid and in period, whatever its tier. Used to refuse a second checkout. */
    public boolean hasPaidSubscription(UUID playerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject("""
            select exists(select 1 from player_subscription where player_id = ?
                          and status in ('active', 'trialing', 'past_due') and current_period_end > ?)
            """, Boolean.class, playerId, Timestamp.from(Instant.now(clock))));
    }
}
