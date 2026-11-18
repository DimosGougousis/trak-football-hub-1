package com.academy.tiers.messaging;

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
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Tasks 3.1-3.2: the server decides recipients; parents are copied on everything (REQ-003, GR-08). */
class MessagingTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;
    @Autowired FakeMailer mailer;

    private static String msg(UUID player, String body) {
        return "{\"to_player_id\":\"" + player + "\",\"body\":\"" + body + "\"}";
    }

    @Test
    void coachMessageCopiesEveryLinkedParent() throws Exception {
        var link = accounts.activeLink(mvc);
        String secondEmail = uniqueEmail("second");
        UUID second = accounts.secondParent(mvc, link, secondEmail);

        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content(msg(link.playerId(), "Great first touch today")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.recipients", containsInAnyOrder(
                link.playerId().toString(), link.parentId().toString(), second.toString())));

        assertThat(mailer.sentTo(link.parentEmail(), "coach_message")).hasSize(1);
        assertThat(mailer.sentTo(secondEmail, "coach_message")).hasSize(1);
    }

    @Test
    void messageWithNoParentRecipientIsRejectedWith422() throws Exception {
        var link = accounts.activeLink(mvc);
        jdbc.update("delete from player_guardian where player_id = ?", link.playerId());   // corrupt state: no parent linked
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content(msg(link.playerId(), "hi")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("no_parent_recipient"));
        assertThat(jdbc.queryForObject("select count(*) from message where player_id = ?", Integer.class, link.playerId())).isZero();
    }

    @Test
    void playerReplyIsAlsoCopiedToParents() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/messages").with(accounts.as(link.playerId())).contentType("application/json")
                .content(msg(link.playerId(), "thanks coach")))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.recipients", hasItems(link.coachId().toString(), link.parentId().toString())))
            .andExpect(jsonPath("$.recipients", not(hasItem(link.playerId().toString()))));
    }

    @Test
    void aClientCannotAddressASinglePerson() throws Exception {
        var link = accounts.activeLink(mvc);
        // An attempt at a private thread: the extra "to" field is ignored; the rule still copies the parent.
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content("{\"to_player_id\":\"" + link.playerId() + "\",\"to\":\"" + link.playerId() + "\",\"body\":\"just us\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.recipients", hasItem(link.parentId().toString())));
    }

    @Test
    void unverifiedCoachCannotMessage() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.verify(mvc, link.academy(), link.coachId(), -1);
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content(msg(link.playerId(), "hi")))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("coach_unverified"));
    }

    @Test
    void unlinkedCoachAndOtherPlayersCannotMessageAboutThePlayer() throws Exception {
        var link = accounts.activeLink(mvc);
        var stranger = accounts.coach(mvc, link.academy());
        accounts.verify(mvc, link.academy(), stranger, 365);
        var otherPlayer = accounts.extraPlayer(mvc, link, "Nikos");
        mvc.perform(post("/messages").with(accounts.as(stranger)).contentType("application/json")
                .content(msg(link.playerId(), "hi"))).andExpect(status().isForbidden());
        mvc.perform(post("/messages").with(accounts.as(otherPlayer)).contentType("application/json")
                .content(msg(link.playerId(), "hi"))).andExpect(status().isForbidden());
    }

    @Test
    void emptyOrOverlongBodyIsRejected() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content(msg(link.playerId(), "  "))).andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("invalid_message"));
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content(msg(link.playerId(), "x".repeat(2001)))).andExpect(status().isUnprocessableEntity());
    }

    @Test
    void everyoneInTheThreadSeesTheSameMessages() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/messages").with(accounts.as(link.coachId())).contentType("application/json")
                .content(msg(link.playerId(), "Session moved to 18:00"))).andExpect(status().isCreated());
        for (UUID reader : new UUID[]{link.playerId(), link.parentId(), link.coachId()}) {
            mvc.perform(get("/players/{p}/messages", link.playerId()).with(accounts.as(reader)))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$[0].body").value("Session moved to 18:00"));
        }
    }
}
