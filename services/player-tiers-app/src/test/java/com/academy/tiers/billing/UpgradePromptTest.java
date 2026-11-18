package com.academy.tiers.billing;

import com.academy.tiers.FakeMailer;
import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Tasks 4.5-4.6: a coach signs off Skill Tree nodes (CP-03). The first milestone of
 * a Basic player sends exactly one upgrade prompt to each parent and nothing to the
 * player (REQ-005, deck S12/S13, ADR-003).
 */
class UpgradePromptTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;
    @Autowired FakeMailer mailer;

    private org.springframework.test.web.servlet.ResultActions complete(UUID coach, UUID player, String node) throws Exception {
        return mvc.perform(post("/players/{p}/skill-tree/{n}/complete", player, node).with(accounts.as(coach)));
    }

    @Test
    void firstMilestoneSendsExactlyOnePromptToEachParent() throws Exception {
        var link = accounts.activeLink(mvc);
        String secondEmail = uniqueEmail("second");
        accounts.secondParent(mvc, link, secondEmail);

        complete(link.coachId(), link.playerId(), "fundamentals-1").andExpect(status().isCreated())
            .andExpect(jsonPath("$.node").value("fundamentals-1"));
        complete(link.coachId(), link.playerId(), "fundamentals-2").andExpect(status().isCreated());

        assertThat(mailer.sentTo(link.parentEmail(), "upgrade_prompt")).hasSize(1);
        assertThat(mailer.sentTo(secondEmail, "upgrade_prompt")).hasSize(1);
        assertThat(jdbc.queryForObject("select count(*) from analytics_event where type = 'upgrade_prompt_sent' and player_id = ?",
            Integer.class, link.playerId())).isEqualTo(2);
    }

    @Test
    void aPlayerAccountCannotHoldAnEmailSoNoPromptCanReachAChild() throws Exception {
        var link = accounts.activeLink(mvc);
        org.assertj.core.api.Assertions.assertThatThrownBy(() ->
                jdbc.update("update account set email = 'child@example.test' where id = ?", link.playerId()))
            .isInstanceOf(org.springframework.dao.DataIntegrityViolationException.class);
    }

    @Test
    void premiumPlayerMilestoneSendsNoPrompt() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.setTier(link.playerId(), link.parentId(), "premium");
        complete(link.coachId(), link.playerId(), "fundamentals-1").andExpect(status().isCreated());
        assertThat(mailer.sentTo(link.parentEmail(), "upgrade_prompt")).isEmpty();
    }

    @Test
    void theMilestoneShowsInTheChildsProgressWithoutAnyUpgradeText() throws Exception {
        var link = accounts.activeLink(mvc);
        complete(link.coachId(), link.playerId(), "weak-foot-wizard").andExpect(status().isCreated());
        String body = mvc.perform(get("/players/{p}/progress", link.playerId()).with(accounts.as(link.playerId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.skill_tree[0]").value("weak-foot-wizard"))
            .andReturn().getResponse().getContentAsString();
        assertThat(body.toLowerCase()).doesNotContain("upgrade").doesNotContain("premium");
    }

    @Test
    void signingOffTheSameNodeTwiceIsIdempotent() throws Exception {
        var link = accounts.activeLink(mvc);
        complete(link.coachId(), link.playerId(), "fundamentals-1").andExpect(status().isCreated());
        complete(link.coachId(), link.playerId(), "fundamentals-1").andExpect(status().isOk());
        assertThat(jdbc.queryForObject("select count(*) from skill_tree_completion where player_id = ?",
            Integer.class, link.playerId())).isEqualTo(1);
    }

    @Test
    void onlyAnActivelyLinkedVerifiedCoachCanSignOff() throws Exception {
        var link = accounts.activeLink(mvc);
        complete(link.playerId(), link.playerId(), "fundamentals-1").andExpect(status().isForbidden());
        complete(link.parentId(), link.playerId(), "fundamentals-1").andExpect(status().isForbidden());
        accounts.verify(mvc, link.academy(), link.coachId(), -1);
        complete(link.coachId(), link.playerId(), "fundamentals-1")
            .andExpect(status().isForbidden()).andExpect(jsonPath("$.error").value("coach_unverified"));
    }

    @Test
    void malformedNodeNameIsRejected() throws Exception {
        var link = accounts.activeLink(mvc);
        complete(link.coachId(), link.playerId(), "Not A Node!").andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("invalid_node"));
    }
}
