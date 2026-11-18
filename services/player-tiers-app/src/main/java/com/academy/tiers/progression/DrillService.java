package com.academy.tiers.progression;

import com.academy.tiers.analytics.AnalyticsEvents;
import com.academy.tiers.common.ApiException;
import com.academy.tiers.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * A player logs their own drills. Drills earn XP under the daily cap (GR-02) and
 * Skill Tree progress, and never change Player Card attributes (ADR-002).
 * A capped drill still counts as activity for weekly-active-players.
 */
@Service
public class DrillService {

    public enum Outcome { AWARDED, CAPPED, DUPLICATE }

    public record DrillRequest(String drillId, Instant completedAt) {}

    public record Logged(Outcome outcome, int xpAwarded, int xpToday) {}

    private final JdbcTemplate jdbc;
    private final XpProperties xp;
    private final AnalyticsEvents events;
    private final Clock clock;

    public DrillService(JdbcTemplate jdbc, XpProperties xp, AnalyticsEvents events, Clock clock) {
        this.jdbc = jdbc;
        this.xp = xp;
        this.events = events;
        this.clock = clock;
    }

    @Transactional
    public Logged log(CurrentUser caller, UUID playerId, DrillRequest req) {
        if (!caller.is("player") || !caller.id().equals(playerId)) throw ApiException.forbidden();
        if (req.drillId() == null || req.drillId().isBlank() || req.completedAt() == null) {
            throw ApiException.unprocessable("invalid_drill");
        }
        Instant now = Instant.now(clock);
        if (req.completedAt().isAfter(now)) throw ApiException.unprocessable("future_date");
        if (req.completedAt().isBefore(now.minus(Duration.ofHours(xp.maxBackdateHours())))) {
            throw ApiException.unprocessable("too_old");
        }
        LocalDate day = req.completedAt().atZone(clock.getZone()).toLocalDate();

        // Serialise drills for one player and day, so concurrent requests cannot both
        // read the same total and push the day past the cap. Released at commit.
        jdbc.query("select pg_advisory_xact_lock(hashtext(?))", rs -> {}, playerId + "|" + day);

        int xpToday = xpOn(playerId, day);
        int award = xpToday + xp.perDrill() <= xp.dailyCap() ? xp.perDrill() : 0;
        int inserted = jdbc.update("""
            insert into drill_log(player_id, drill_id, day, completed_at, xp) values (?, ?, ?, ?, ?)
            on conflict (player_id, drill_id, day) do nothing
            """, playerId, req.drillId().trim(), day, Timestamp.from(req.completedAt()), award);
        if (inserted == 0) return new Logged(Outcome.DUPLICATE, 0, xpToday);

        events.emit("drill_logged", playerId, Map.of("drill_id", req.drillId().trim(), "day", day.toString(), "xp", award));
        return new Logged(award > 0 ? Outcome.AWARDED : Outcome.CAPPED, award, xpToday + award);
    }

    int xpOn(UUID playerId, LocalDate day) {
        Integer sum = jdbc.queryForObject("select coalesce(sum(xp), 0) from drill_log where player_id = ? and day = ?",
            Integer.class, playerId, day);
        return sum == null ? 0 : sum;
    }
}
