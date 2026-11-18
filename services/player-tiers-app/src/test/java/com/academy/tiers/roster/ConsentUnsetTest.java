package com.academy.tiers.roster;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static com.academy.tiers.TestAccounts.onboardBody;
import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 1.7: an environment that never set the consent age refuses every onboarding. */
@TestPropertySource(properties = "tiers.consent.min-age-without-verified-consent=")
class ConsentUnsetTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    @Test
    void onboardingFailsClosedEvenForAnAdultWithAConsentReference() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, 365);
        String parentEmail = uniqueEmail("parent");
        accounts.parent(mvc, academy, parentEmail);
        mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coach)).with(accounts.as(coach))
                .contentType("application/json")
                .content(onboardBody(parentEmail, "Alex", LocalDate.now().minusYears(17), "REG-1")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("consent_required"));
        assertThat(jdbc.queryForObject("select count(*) from account where academy_id = ? and role = 'player'", Integer.class, academy.id())).isZero();
    }
}
