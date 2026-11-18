package com.academy.tiers.roster;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;
import java.util.UUID;

import static com.academy.tiers.TestAccounts.onboardBody;
import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 1.7 (and Milestone 6's Greece cases): consent age 15 with the academy's consent reference. */
class ConsentAgeTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    private record Setup(UUID coach, UUID roster, String parentEmail, TestAccounts.Academy academy) {}

    private Setup setup() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, 365);
        String parentEmail = uniqueEmail("parent");
        accounts.parent(mvc, academy, parentEmail);
        return new Setup(coach, accounts.rosterOf(coach), parentEmail, academy);
    }

    private int players(Setup s) {
        return jdbc.queryForObject("select count(*) from account where academy_id = ? and role = 'player'", Integer.class, s.academy().id());
    }

    @Test
    void fourteenYearOldWithoutConsentReferenceIsRejectedAndNothingStored() throws Exception {
        var s = setup();
        LocalDate dob = LocalDate.now().minusYears(15).plusDays(1);   // turns 15 tomorrow
        mvc.perform(post("/rosters/{r}/players", s.roster()).with(accounts.as(s.coach()))
                .contentType("application/json").content(onboardBody(s.parentEmail(), "Eleni", dob, null)))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("consent_required"));
        assertThat(players(s)).isZero();
    }

    @Test
    void fourteenYearOldWithConsentReferenceIsOnboardedAndTheReferenceIsStored() throws Exception {
        var s = setup();
        LocalDate dob = LocalDate.now().minusYears(15).plusDays(1);
        mvc.perform(post("/rosters/{r}/players", s.roster()).with(accounts.as(s.coach()))
                .contentType("application/json").content(onboardBody(s.parentEmail(), "Eleni", dob, "REG-2027-0042")))
            .andExpect(status().isCreated());
        assertThat(jdbc.queryForObject("select academy_consent_ref from roster_link where coach_id = ?", String.class, s.coach()))
            .isEqualTo("REG-2027-0042");
    }

    @Test
    void playerWhoTurnsFifteenTodayNeedsNoReference() throws Exception {
        var s = setup();
        LocalDate dob = LocalDate.now().minusYears(15);
        mvc.perform(post("/rosters/{r}/players", s.roster()).with(accounts.as(s.coach()))
                .contentType("application/json").content(onboardBody(s.parentEmail(), "Giorgos", dob, null)))
            .andExpect(status().isCreated());
    }

    @Test
    void blankConsentReferenceCountsAsMissing() throws Exception {
        var s = setup();
        LocalDate dob = LocalDate.now().minusYears(14);
        mvc.perform(post("/rosters/{r}/players", s.roster()).with(accounts.as(s.coach()))
                .contentType("application/json").content(onboardBody(s.parentEmail(), "Eleni", dob, "  ")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("consent_required"));
    }
}
