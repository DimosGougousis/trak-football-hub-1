package com.academy.tiers.messaging;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.hasItem;
import static org.hamcrest.Matchers.not;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 3.3: a parent can revoke a coach's electronic contact with their child (GR-09). */
class ContactRevokeTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;

    @Test
    void afterRevokeTheCoachCannotMessageAndIsDroppedFromReplies() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/players/{p}/contact-block", link.playerId()).with(accounts.as(link.parentId()))
                .contentType("application/json").content("{\"coach_id\":\"" + link.coachId() + "\"}"))
            .andExpect(status().isCreated());

        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content("{\"to_player_id\":\"" + link.playerId() + "\",\"body\":\"hi\"}"))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("contact_revoked"));

        mvc.perform(post("/messages").with(accounts.as(link.playerId())).contentType("application/json")
                .content("{\"to_player_id\":\"" + link.playerId() + "\",\"body\":\"see you\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.recipients", not(hasItem(link.coachId().toString()))))
            .andExpect(jsonPath("$.recipients", hasItem(link.parentId().toString())));

        assertThat(jdbc.queryForObject("select count(*) from audit_log where action = 'contact_revoked' and subject_id = ?",
            Integer.class, link.playerId())).isEqualTo(1);
    }

    @Test
    void onlyAGuardianCanRevokeContact() throws Exception {
        var link = accounts.activeLink(mvc);
        var stranger = accounts.parent(mvc, link.academy(), uniqueEmail("stranger"));
        for (var caller : new java.util.UUID[]{stranger, link.coachId(), link.playerId()}) {
            mvc.perform(post("/players/{p}/contact-block", link.playerId()).with(accounts.as(caller))
                    .contentType("application/json").content("{\"coach_id\":\"" + link.coachId() + "\"}"))
                .andExpect(status().isForbidden());
        }
    }

    @Test
    void revokingTwiceIsIdempotent() throws Exception {
        var link = accounts.activeLink(mvc);
        for (int i = 0; i < 2; i++) {
            mvc.perform(post("/players/{p}/contact-block", link.playerId()).with(accounts.as(link.parentId()))
                    .contentType("application/json").content("{\"coach_id\":\"" + link.coachId() + "\"}"))
                .andExpect(status().isCreated());
        }
        assertThat(jdbc.queryForObject("select count(*) from contact_block where player_id = ?", Integer.class, link.playerId())).isEqualTo(1);
    }
}
