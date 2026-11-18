package com.academy.tiers.progression;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;
import java.util.UUID;
import java.util.stream.Collectors;

/** Read side of progression: attributes, XP and the week-based streak. */
@Service
public class ProgressService {

    public record Progress(Map<String, Integer> attributes, int xpTotal, int xpToday, int streakWeeks, java.util.List<String> skillTree) {}

    private final JdbcTemplate jdbc;
    private final DrillService drills;
    private final Clock clock;

    public ProgressService(JdbcTemplate jdbc, DrillService drills, Clock clock) {
        this.jdbc = jdbc;
        this.drills = drills;
        this.clock = clock;
    }

    public Progress of(UUID playerId) {
        Map<String, Integer> attributes = new TreeMap<>();
        jdbc.query("select name, value from player_attribute where player_id = ?",
            rs -> { attributes.put(rs.getString("name"), rs.getInt("value")); }, playerId);
        Integer total = jdbc.queryForObject("select coalesce(sum(xp), 0) from drill_log where player_id = ?", Integer.class, playerId);
        LocalDate today = LocalDate.now(clock);
        java.util.List<String> nodes = jdbc.queryForList(
            "select node from skill_tree_completion where player_id = ? order by completed_at, node", String.class, playerId);
        return new Progress(attributes, total == null ? 0 : total, drills.xpOn(playerId, today), streakWeeks(playerId, today), nodes);
    }

    /**
     * Consecutive ISO weeks with at least one drill, ending at the current week. A
     * week that has not had a drill yet does not break the streak until it is over,
     * and rest days inside a week never break it (spec D6, GR-03).
     */
    int streakWeeks(UUID playerId, LocalDate today) {
        Set<LocalDate> weeks = jdbc.queryForList("select distinct day from drill_log where player_id = ?", LocalDate.class, playerId)
            .stream().map(ProgressService::mondayOf).collect(Collectors.toCollection(TreeSet::new));
        LocalDate week = mondayOf(today);
        if (!weeks.contains(week)) week = week.minusWeeks(1);
        int streak = 0;
        while (weeks.contains(week)) {
            streak++;
            week = week.minusWeeks(1);
        }
        return streak;
    }

    private static LocalDate mondayOf(LocalDate d) {
        return d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
    }
}
