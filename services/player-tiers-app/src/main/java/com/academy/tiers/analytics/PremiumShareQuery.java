package com.academy.tiers.analytics;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * Guardrail metric (Product Office analytics/metrics.md#premium-share): the share
 * of an academy's actively rostered players whose subscription is Premium and paid
 * for the current period.
 */
@Component
public class PremiumShareQuery {

    private final JdbcTemplate jdbc;

    public PremiumShareQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** Null for an academy with no actively rostered players. */
    public BigDecimal share(UUID academyId) {
        var row = jdbc.queryForMap("""
            select count(*) as players,
                   count(*) filter (where s.tier = 'premium' and s.status in ('active', 'trialing', 'past_due')
                                      and s.current_period_end > now()) as premium
            from (select distinct rl.player_id from roster_link rl join roster r on r.id = rl.roster_id
                  where r.academy_id = ? and rl.status = 'active') p
            left join player_subscription s on s.player_id = p.player_id
            """, academyId);
        long players = ((Number) row.get("players")).longValue();
        if (players == 0) return null;
        long premium = ((Number) row.get("premium")).longValue();
        return BigDecimal.valueOf(premium).divide(BigDecimal.valueOf(players), 2, RoundingMode.HALF_UP);
    }
}
