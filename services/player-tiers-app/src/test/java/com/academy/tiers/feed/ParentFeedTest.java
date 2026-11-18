package com.academy.tiers.feed;

import com.academy.tiers.FakeMailer;
import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.time.temporal.IsoFields;

import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Tasks 3.4-3.5: the weekly parent feed of drills, XP, tests and coach notes (CP-12). */
class ParentFeedTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;
    @Autowired FakeMailer mailer;
    @Autowired WeeklyFeedJob job;

    private static String thisWeek() {
        LocalDate d = LocalDate.now();
        return d.get(IsoFields.WEEK_BASED_YEAR) + "-W" + String.format("%02d", d.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));
    }

    @Test
    void feedHoldsTheWeeksDrillsXpTestsAndCoachNotesAndNoPrices() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant justNow = Instant.now().minus(1, ChronoUnit.MINUTES);
        for (String drill : new String[]{"rondo", "weak-foot", "sprints"}) {
            mvc.perform(post("/players/{p}/drills", link.playerId()).with(accounts.as(link.playerId()))
                    .contentType("application/json").content("{\"drill_id\":\"" + drill + "\",\"completed_at\":\"" + justNow + "\"}"))
                .andExpect(status().isCreated());
        }
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId()))
                .contentType("application/json")
                .content("{\"test_type\":\"sprint_20m\",\"results\":{\"pace\":72},\"signed_at\":\"" + justNow + "\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content("{\"to_player_id\":\"" + link.playerId() + "\",\"body\":\"Strong week, keep the weak foot work going\"}"))
            .andExpect(status().isCreated());

        String body = mvc.perform(get("/parents/me/feed").param("week", thisWeek()).with(accounts.as(link.parentId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.players", hasSize(1)))
            .andExpect(jsonPath("$.players[0].player_id").value(link.playerId().toString()))
            .andExpect(jsonPath("$.players[0].drills").value(3))
            .andExpect(jsonPath("$.players[0].xp").value(90))
            .andExpect(jsonPath("$.players[0].tests", hasSize(1)))
            .andExpect(jsonPath("$.players[0].tests[0].results.pace").value(72))
            .andExpect(jsonPath("$.players[0].coach_notes", hasSize(1)))
            .andReturn().getResponse().getContentAsString();
        assertThat(body).doesNotContain("price").doesNotContain("checkout").doesNotContain("upgrade");

        job.run(thisWeek());
        assertThat(mailer.sentTo(link.parentEmail(), "weekly_feed")).hasSize(1);
    }

    @Test
    void aParentSeesOnlyTheirOwnChildren() throws Exception {
        var link = accounts.activeLink(mvc);
        var otherParent = accounts.parent(mvc, link.academy(), uniqueEmail("other"));
        mvc.perform(get("/parents/me/feed").param("week", thisWeek()).with(accounts.as(otherParent)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("no_linked_player"));
    }

    @Test
    void onlyParentsHaveAFeed() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(get("/parents/me/feed").with(accounts.as(link.coachId()))).andExpect(status().isForbidden());
        mvc.perform(get("/parents/me/feed").with(accounts.as(link.playerId()))).andExpect(status().isForbidden());
    }

    @Test
    void malformedWeekIsRejected() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(get("/parents/me/feed").param("week", "last-week").with(accounts.as(link.parentId())))
            .andExpect(status().isBadRequest());
    }
}
