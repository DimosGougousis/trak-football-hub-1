package com.academy.tiers.verification;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.LocalDate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Tasks 1.2-1.3: coach verification with expiry (GR-07). */
class CoachVerificationTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;
    @Autowired CoachVerificationService service;

    @Test
    void verificationIsActiveUntilExpiry() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        accounts.verify(mvc, academy, coach, 1);
        assertThat(service.isActive(coach, LocalDate.now())).isTrue();
        assertThat(service.isActive(coach, LocalDate.now().plusDays(1))).isTrue();
        assertThat(service.isActive(coach, LocalDate.now().plusDays(2))).isFalse();
    }

    @Test
    void coachWithNoRecordIsNotActive() throws Exception {
        var academy = accounts.academy();
        assertThat(service.isActive(accounts.coach(mvc, academy), LocalDate.now())).isFalse();
    }

    @Test
    void adminRecordsVerificationAndSeesItActive() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        mvc.perform(post("/coaches/{c}/verification", coach).with(accounts.as(academy.adminId()))
                .contentType("application/json")
                .content("{\"type\":\"GR_CRIMINAL_RECORD\",\"reference\":\"PM-1\",\"expires_on\":\"" + LocalDate.now().plusYears(1) + "\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.status").value("active"));
    }

    @Test
    void onlyTheCoachsOwnAcademyAdminCanRecordVerification() throws Exception {
        var academy = accounts.academy();
        var other = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        String body = "{\"type\":\"GR_CRIMINAL_RECORD\",\"reference\":\"PM-2\",\"expires_on\":\"" + LocalDate.now().plusYears(1) + "\"}";
        mvc.perform(post("/coaches/{c}/verification", coach).with(accounts.as(other.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isForbidden());
        mvc.perform(post("/coaches/{c}/verification", coach).with(accounts.as(coach))
                .contentType("application/json").content(body))
            .andExpect(status().isForbidden());
    }

    @Test
    void unknownVerificationTypeIsRejected() throws Exception {
        var academy = accounts.academy();
        var coach = accounts.coach(mvc, academy);
        mvc.perform(post("/coaches/{c}/verification", coach).with(accounts.as(academy.adminId()))
                .contentType("application/json")
                .content("{\"type\":\"SELF_DECLARED\",\"reference\":\"x\",\"expires_on\":\"" + LocalDate.now().plusYears(1) + "\"}"))
            .andExpect(status().isBadRequest());
    }

    @Test
    void requestsWithoutATokenAreRejected() throws Exception {
        mvc.perform(post("/coaches/{c}/verification", java.util.UUID.randomUUID())
                .contentType("application/json").content("{}"))
            .andExpect(status().isUnauthorized());
    }
}
