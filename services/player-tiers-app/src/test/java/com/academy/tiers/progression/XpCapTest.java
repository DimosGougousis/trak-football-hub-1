package com.academy.tiers.progression;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.TemporalAdjusters;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 2.4: daily XP cap (GR-02) and a streak that counts active weeks, not days (GR-03, spec D6). */
class XpCapTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    private static Instant at(LocalDate day, int minute) {
        return day.atTime(10, 0).plusMinutes(minute).atZone(ZoneId.systemDefault()).toInstant();
    }

    private org.springframework.test.web.servlet.ResultActions log(UUID player, String drill, Instant when) throws Exception {
        return mvc.perform(post("/players/{p}/drills", player).with(accounts.as(player))
            .contentType("application/json").content("{\"drill_id\":\"" + drill + "\",\"completed_at\":\"" + when + "\"}"));
    }

    @Test
    void eleventhDrillOfTheDayEarnsNoXpButStillCountsAsActivity() throws Exception {
        var link = accounts.activeLink(mvc);
        LocalDate yesterday = LocalDate.now().minusDays(1);
        for (int i = 0; i < 10; i++) {
            log(link.playerId(), "drill-" + i, at(yesterday, i)).andExpect(status().isCreated())
                .andExpect(jsonPath("$.xp_awarded").value(30));
        }
        log(link.playerId(), "drill-10", at(yesterday, 10))
            .andExpect(status().isTooManyRequests())
            .andExpect(jsonPath("$.error").value("daily_xp_cap"))
            .andExpect(jsonPath("$.xp_awarded").value(0));

        assertThat(jdbc.queryForObject("select count(*) from drill_log where player_id = ?", Integer.class, link.playerId())).isEqualTo(11);
        assertThat(jdbc.queryForObject("select sum(xp) from drill_log where player_id = ?", Integer.class, link.playerId())).isEqualTo(300);
    }

    @Test
    void sameDrillTwiceOnTheSameDayIsIdempotent() throws Exception {
        var link = accounts.activeLink(mvc);
        LocalDate yesterday = LocalDate.now().minusDays(1);
        log(link.playerId(), "rondo", at(yesterday, 0)).andExpect(status().isCreated());
        log(link.playerId(), "rondo", at(yesterday, 5))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.xp_awarded").value(0))
            .andExpect(jsonPath("$.duplicate").value(true));
        assertThat(jdbc.queryForObject("select sum(xp) from drill_log where player_id = ?", Integer.class, link.playerId())).isEqualTo(30);
    }

    @Test
    void futureDrillIsRejected() throws Exception {
        var link = accounts.activeLink(mvc);
        log(link.playerId(), "d", Instant.now().plusSeconds(3600))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("future_date"));
    }

    @Test
    void restDaysDoNotBreakTheStreakButAMissedWeekDoes() throws Exception {
        var link = accounts.activeLink(mvc);
        LocalDate thisMonday = LocalDate.now().with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        // Three consecutive past weeks, with rest days in between; nothing yet this week.
        accounts.seedDrill(link.playerId(), "a", thisMonday.minusWeeks(3), 30);
        accounts.seedDrill(link.playerId(), "b", thisMonday.minusWeeks(2).plusDays(3), 30);
        accounts.seedDrill(link.playerId(), "c", thisMonday.minusWeeks(1).plusDays(5), 30);
        mvc.perform(get("/players/{p}/progress", link.playerId()).with(accounts.as(link.playerId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.streak_weeks").value(3))
            .andExpect(jsonPath("$.xp_total").value(90));

        var gap = accounts.extraPlayer(mvc, link, "Petros");
        accounts.seedDrill(gap, "a", thisMonday.minusWeeks(3), 30);
        accounts.seedDrill(gap, "c", thisMonday.minusWeeks(1), 30);
        mvc.perform(get("/players/{p}/progress", gap).with(accounts.as(gap)))
            .andExpect(jsonPath("$.streak_weeks").value(1));
    }
}
