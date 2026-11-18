package com.academy.tiers.feed;

import com.academy.tiers.common.IsoWeek;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * CP-12: what a parent sees each week for each of their children. It holds no
 * prices, billing or upgrade content (ADR-003); those live only in the parent
 * account's billing screens.
 */
@Service
public class FeedService {

    public record TestEntry(String testType, Map<String, Integer> results, OffsetDateTime signedAt) {}

    public record Note(String body, OffsetDateTime at) {}

    public record PlayerWeek(UUID playerId, String displayName, int drills, int xp, List<TestEntry> tests, List<Note> coachNotes) {}

    public record Feed(String week, List<PlayerWeek> players) {}

    private static final TypeReference<Map<String, Integer>> RESULTS = new TypeReference<>() {};

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;
    private final Clock clock;

    public FeedService(JdbcTemplate jdbc, ObjectMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.json = json;
        this.clock = clock;
    }

    public Feed forParent(UUID parentId, IsoWeek week) {
        Timestamp from = Timestamp.from(week.monday().atStartOfDay(clock.getZone()).toInstant());
        Timestamp to = Timestamp.from(week.monday().plusWeeks(1).atStartOfDay(clock.getZone()).toInstant());

        List<PlayerWeek> players = jdbc.query("""
                select a.id, a.display_name from player_guardian g join account a on a.id = g.player_id
                where g.parent_id = ? order by a.display_name, a.id
                """,
            (rs, i) -> {
                UUID playerId = rs.getObject("id", UUID.class);
                var drills = jdbc.queryForMap(
                    "select count(*) as n, coalesce(sum(xp), 0) as xp from drill_log where player_id = ? and day between ? and ?",
                    playerId, week.monday(), week.sunday());
                List<TestEntry> tests = jdbc.query(
                    "select test_type, results::text as results, signed_at from test_result where player_id = ? and signed_at >= ? and signed_at < ? order by signed_at",
                    (r, j) -> new TestEntry(r.getString("test_type"), readResults(r.getString("results")), r.getObject("signed_at", OffsetDateTime.class)),
                    playerId, from, to);
                List<Note> notes = jdbc.query("""
                        select m.body, m.at from message m join account a on a.id = m.author_id
                        where m.player_id = ? and a.role = 'coach' and m.at >= ? and m.at < ? order by m.at
                        """,
                    (r, j) -> new Note(r.getString("body"), r.getObject("at", OffsetDateTime.class)), playerId, from, to);
                return new PlayerWeek(playerId, rs.getString("display_name"),
                    ((Number) drills.get("n")).intValue(), ((Number) drills.get("xp")).intValue(), tests, notes);
            }, parentId);
        return new Feed(week.toString(), players);
    }

    public IsoWeek currentWeek() {
        return IsoWeek.containing(Instant.now(clock).atZone(clock.getZone()).toLocalDate());
    }

    private Map<String, Integer> readResults(String text) {
        try {
            return json.readValue(text, RESULTS);
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
    }
}
