package com.academy.tiers.progression;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.temporal.ChronoUnit;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Tasks 2.1-2.3: coach-signed tests are the only path that changes attributes (REQ-002, ADR-002, GR-11). */
class ProgressionTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    private static String testBody(String results) {
        return "{\"test_type\":\"sprint_20m\",\"results\":" + results + ",\"signed_at\":\"" + Instant.now().minus(1, ChronoUnit.HOURS) + "\"}";
    }

    @Test
    void coachSignedTestUpdatesAttributesAndAuditLog() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId()))
                .contentType("application/json").content(testBody("{\"pace\":71}")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.attributes_changed[0]").value("pace"));

        assertThat(jdbc.queryForObject("select value from player_attribute where player_id = ? and name = 'pace'",
            Integer.class, link.playerId())).isEqualTo(71);
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'attribute_changed' and subject_id = ?",
            Integer.class, link.playerId())).isEqualTo(1);
        mvc.perform(get("/players/{p}/progress", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.attributes.pace").value(71));
    }

    @Test
    void selfLoggedDrillEarnsXpButChangesNoAttributes() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId()))
                .contentType("application/json").content(testBody("{\"pace\":60,\"dribbling\":55}")))
            .andExpect(status().isCreated());
        var before = jdbc.queryForList("select name, value from player_attribute where player_id = ? order by name", link.playerId());

        mvc.perform(post("/players/{p}/drills", link.playerId()).with(accounts.as(link.playerId()))
                .contentType("application/json")
                .content("{\"drill_id\":\"weak-foot-01\",\"completed_at\":\"" + Instant.now().minus(2, ChronoUnit.HOURS) + "\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.xp_awarded").value(30))
            .andExpect(jsonPath("$.attributes_changed").isEmpty());

        assertThat(jdbc.queryForList("select name, value from player_attribute where player_id = ? order by name", link.playerId()))
            .isEqualTo(before);
    }

    @Test
    void onlyAnActivelyLinkedVerifiedCoachCanSignATest() throws Exception {
        var link = accounts.activeLink(mvc);
        var stranger = accounts.coach(mvc, link.academy());
        accounts.verify(mvc, link.academy(), stranger, 365);
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(stranger))
                .contentType("application/json").content(testBody("{\"pace\":99}")))
            .andExpect(status().isForbidden());
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.playerId()))
                .contentType("application/json").content(testBody("{\"pace\":99}")))
            .andExpect(status().isForbidden());
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.parentId()))
                .contentType("application/json").content(testBody("{\"pace\":99}")))
            .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from player_attribute where player_id = ?", Integer.class, link.playerId())).isZero();
    }

    @Test
    void expiredCoachCannotSignATest() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.verify(mvc, link.academy(), link.coachId(), -1);
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId()))
                .contentType("application/json").content(testBody("{\"pace\":70}")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("coach_unverified"));
    }

    @Test
    void outOfRangeOrUnknownResultsAreRejectedAndNothingIsWritten() throws Exception {
        var link = accounts.activeLink(mvc);
        for (String bad : new String[]{"{\"pace\":100}", "{\"pace\":-1}", "{\"shooting\":50}", "{}"}) {
            mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId()))
                    .contentType("application/json").content(testBody(bad)))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error").value("invalid_result"));
        }
        assertThat(jdbc.queryForObject("select count(*) from player_attribute where player_id = ?", Integer.class, link.playerId())).isZero();
    }

    @Test
    void aPlayerCannotLogDrillsForAnotherPlayer() throws Exception {
        var link = accounts.activeLink(mvc);
        var other = accounts.extraPlayer(mvc, link, "Nikos");
        mvc.perform(post("/players/{p}/drills", link.playerId()).with(accounts.as(other))
                .contentType("application/json")
                .content("{\"drill_id\":\"d1\",\"completed_at\":\"" + Instant.now().minus(1, ChronoUnit.HOURS) + "\"}"))
            .andExpect(status().isForbidden());
    }
}
