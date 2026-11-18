package com.academy.tiers.roster;

import com.academy.tiers.FakeMailer;
import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static com.academy.tiers.TestAccounts.onboardBody;
import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Tasks 1.5-1.6 and 1.8: a verified coach onboards players directly (REQ-001, GR-07). */
class RosterLinkTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;
    @Autowired FakeMailer mailer;

    private static final LocalDate FIFTEEN = LocalDate.now().minusYears(15).minusDays(30);

    @Test
    void verifiedCoachOnboardsPlayerAndParentIsNotified() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, 365);
        String parentEmail = uniqueEmail("parent");
        accounts.parent(mvc, academy, parentEmail);

        String res = mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coach)).with(accounts.as(coach))
                .contentType("application/json").content(onboardBody(parentEmail, "Alex", FIFTEEN, "REG-2027-0042")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.link_status").value("active"))
            .andExpect(jsonPath("$.parent_notified").value(true))
            .andReturn().getResponse().getContentAsString();

        assertThat(jdbc.queryForObject("select count(*) from roster_link where coach_id = ? and status = 'active'", Integer.class, coach)).isEqualTo(1);
        assertThat(mailer.sentTo(parentEmail, "player_onboarded")).hasSize(1);
        String playerId = res.replaceAll(".*\"player_id\":\"([^\"]+)\".*", "$1");
        assertThat(jdbc.queryForObject(
            "select count(*) from audit_log where action = 'player_onboarded' and subject_id = ?::uuid and detail->>'academy_consent_ref' = 'REG-2027-0042'",
            Integer.class, playerId)).isEqualTo(1);
    }

    @Test
    void expiredCoachOnboardingIsRejectedWith403AndNoLink() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, -1);
        String parentEmail = uniqueEmail("parent");
        accounts.parent(mvc, academy, parentEmail);

        mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coach)).with(accounts.as(coach))
                .contentType("application/json").content(onboardBody(parentEmail, "Sam", FIFTEEN, "REG-1")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("coach_unverified"));
        assertThat(jdbc.queryForObject("select count(*) from roster_link where coach_id = ?", Integer.class, coach)).isZero();
        assertThat(mailer.sentTo(parentEmail, "player_onboarded")).isEmpty();
    }

    @Test
    void coachWithNoVerificationAtAllIsRejected() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        String parentEmail = uniqueEmail("parent");
        accounts.parent(mvc, academy, parentEmail);
        mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coach)).with(accounts.as(coach))
                .contentType("application/json").content(onboardBody(parentEmail, "Sam", FIFTEEN, "REG-1")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("coach_unverified"));
    }

    @Test
    void coachCannotOnboardIntoAnotherCoachsRoster() throws Exception {
        var academy = accounts.academy();
        var coachA = accounts.coach(mvc, academy);
        var coachB = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coachB, 365);
        String parentEmail = uniqueEmail("parent");
        accounts.parent(mvc, academy, parentEmail);
        mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coachA)).with(accounts.as(coachB))
                .contentType("application/json").content(onboardBody(parentEmail, "Sam", FIFTEEN, "REG-1")))
            .andExpect(status().isForbidden());
    }

    @Test
    void missingParentEmailIsRejected() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, 365);
        mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coach)).with(accounts.as(coach))
                .contentType("application/json")
                .content("{\"player_first_name\":\"Sam\",\"dob\":\"" + FIFTEEN + "\",\"academy_consent_ref\":\"REG-1\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("parent_email_required"));
    }

    @Test
    void parentRevokeRemovesCoachAccessOnNextRequest() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(get("/players/{p}", link.playerId()).with(accounts.as(link.coachId())))
            .andExpect(status().isOk());

        mvc.perform(delete("/links/{p}/coaches/{c}", link.playerId(), link.coachId()).with(accounts.as(link.parentId())))
            .andExpect(status().isNoContent());

        mvc.perform(get("/players/{p}", link.playerId()).with(accounts.as(link.coachId())))
            .andExpect(status().isForbidden());
        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'link_revoked' and subject_id = ?",
            Integer.class, link.playerId())).isEqualTo(1);
    }

    @Test
    void onlyTheplayersParentCanRevoke() throws Exception {
        var link = accounts.activeLink(mvc);
        var otherParent = accounts.parent(mvc, link.academy(), uniqueEmail("other"));
        mvc.perform(delete("/links/{p}/coaches/{c}", link.playerId(), link.coachId()).with(accounts.as(otherParent)))
            .andExpect(status().isForbidden());
        mvc.perform(delete("/links/{p}/coaches/{c}", link.playerId(), link.coachId()).with(accounts.as(link.coachId())))
            .andExpect(status().isForbidden());
    }

    @Test
    void parentAndPlayerCanReadThePlayerButAnUnlinkedCoachCannot() throws Exception {
        var link = accounts.activeLink(mvc);
        var strangerCoach = accounts.coach(mvc, link.academy());
        mvc.perform(get("/players/{p}", link.playerId()).with(accounts.as(link.parentId()))).andExpect(status().isOk());
        mvc.perform(get("/players/{p}", link.playerId()).with(accounts.as(link.playerId()))).andExpect(status().isOk());
        mvc.perform(get("/players/{p}", link.playerId()).with(accounts.as(strangerCoach))).andExpect(status().isForbidden());
    }
}
