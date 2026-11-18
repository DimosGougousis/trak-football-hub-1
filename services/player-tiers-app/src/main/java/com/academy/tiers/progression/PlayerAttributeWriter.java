package com.academy.tiers.progression;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.sql.Timestamp;
import java.time.Instant;
import java.util.UUID;

/**
 * The single place that writes Player Card attributes (ADR-002). Only
 * {@link TestResultService} may use it; ArchitectureTest fails the build otherwise.
 */
@Component
public class PlayerAttributeWriter {

    private final JdbcTemplate jdbc;

    PlayerAttributeWriter(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    /**
     * Sets the attribute from a test measured at {@code measuredAt}, unless a newer
     * test already set it. Returns true when the value was applied.
     */
    boolean upsert(UUID playerId, String name, int value, Instant measuredAt) {
        return jdbc.update("""
            insert into player_attribute(player_id, name, value, measured_at) values (?, ?, ?, ?)
            on conflict (player_id, name) do update
              set value = excluded.value, measured_at = excluded.measured_at, updated_at = now()
              where player_attribute.measured_at <= excluded.measured_at
            """, playerId, name, value, Timestamp.from(measuredAt)) == 1;
    }
}
