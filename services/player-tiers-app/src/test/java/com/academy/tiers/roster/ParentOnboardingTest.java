package com.academy.tiers.roster;

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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 1.4: the academy onboards every parent itself (OQ-8). */
class ParentOnboardingTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    private int parentsIn(TestAccounts.Academy a) {
        return jdbc.queryForObject("select count(*) from account where academy_id = ? and role = 'parent'", Integer.class, a.id());
    }

    @Test
    void adminBulkOnboardsParentsIdempotentlyByEmail() throws Exception {
        var academy = accounts.academy();
        String body = "{\"parents\":[{\"email\":\"" + uniqueEmail("maria") + "\",\"name\":\"Maria\"},"
            + "{\"email\":\"" + uniqueEmail("nikos") + "\",\"name\":\"Nikos\"}]}";
        mvc.perform(post("/academies/{a}/parents", academy.id()).with(accounts.as(academy.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.created").value(2))
            .andExpect(jsonPath("$.existing").value(0));
        mvc.perform(post("/academies/{a}/parents", academy.id()).with(accounts.as(academy.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.created").value(0))
            .andExpect(jsonPath("$.existing").value(2));
        assertThat(parentsIn(academy)).isEqualTo(2);
    }

    @Test
    void oneMalformedEmailRejectsTheWholeBatch() throws Exception {
        var academy = accounts.academy();
        String body = "{\"parents\":[{\"email\":\"" + uniqueEmail("ok") + "\",\"name\":\"Ok\"},{\"email\":\"not-an-email\",\"name\":\"Bad\"}]}";
        mvc.perform(post("/academies/{a}/parents", academy.id()).with(accounts.as(academy.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("invalid_email"));
        assertThat(parentsIn(academy)).isZero();
    }

    @Test
    void coachCannotOnboardParents() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        mvc.perform(post("/academies/{a}/parents", academy.id()).with(accounts.as(coach))
                .contentType("application/json").content("{\"parents\":[{\"email\":\"" + uniqueEmail("x") + "\",\"name\":\"X\"}]}"))
            .andExpect(status().isForbidden());
    }

    @Test
    void playerOnboardingWithAnUnknownParentEmailIsRejectedAndStoresNothing() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, 365);
        mvc.perform(post("/rosters/{r}/players", accounts.rosterOf(coach)).with(accounts.as(coach))
                .contentType("application/json")
                .content(onboardBody("unknown@example.test", "Sam", LocalDate.now().minusYears(15).minusDays(3), "REG-1")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("parent_not_onboarded"));
        assertThat(jdbc.queryForObject("select count(*) from account where academy_id = ? and role = 'player'", Integer.class, academy.id())).isZero();
    }
}
