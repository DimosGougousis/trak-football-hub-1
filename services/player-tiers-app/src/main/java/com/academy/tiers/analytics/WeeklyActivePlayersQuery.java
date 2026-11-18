package com.academy.tiers.analytics;

import com.academy.tiers.common.IsoWeek;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.UUID;

/**
 * Success metric (Product Office analytics/metrics.md#weekly-active-players):
 * the share of a roster's actively linked players who logged at least 2 drills
 * in an ISO week. Target 60% within 60 days of launch; kill threshold 30%.
 */
@Component
public class WeeklyActivePlayersQuery {

    private final JdbcTemplate jdbc;

    public WeeklyActivePlayersQuery(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /** @param isoWeek e.g. {@code 2027-W23}. Returns null for a roster with no active players. */
    public BigDecimal share(UUID rosterId, String isoWeek) {
        IsoWeek week = IsoWeek.parse(isoWeek);
        var row = jdbc.queryForMap("""
            select count(*) as roster_size,
                   count(*) filter (where t.n >= 2) as active
            from (select rl.player_id,
                         (select count(*) from drill_log dl
                           where dl.player_id = rl.player_id and dl.day between ? and ?) as n
                  from roster_link rl
                  where rl.roster_id = ? and rl.status = 'active') t
            """, week.monday(), week.sunday(), rosterId);
        long size = ((Number) row.get("roster_size")).longValue();
        if (size == 0) return null;
        long active = ((Number) row.get("active")).longValue();
        return BigDecimal.valueOf(active).divide(BigDecimal.valueOf(size), 2, RoundingMode.HALF_UP);
    }
}
