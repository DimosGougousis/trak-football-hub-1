package com.academy.tiers;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.test.web.servlet.MockMvc;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.Callable;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;

import static com.academy.tiers.TestAccounts.onboardBody;
import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Regression tests for the Milestone 1-3 code review findings. */
class ReviewFixesTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired JdbcTemplate jdbc;
    @Autowired TestAccounts accounts;
    @Autowired FakeMailer mailer;

    // Finding 1 (blocker, GR-09): a blocked coach cannot read the thread either.
    @Test
    void coachWhoseContactWasRevokedCannotReadTheThread() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/players/{p}/contact-block", link.playerId()).with(accounts.as(link.parentId()))
                .contentType("application/json").content("{\"coach_id\":\"" + link.coachId() + "\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/messages").with(accounts.as(link.playerId())).contentType("application/json")
                .content("{\"to_player_id\":\"" + link.playerId() + "\",\"body\":\"for my parent only\"}"))
            .andExpect(status().isCreated());
        mvc.perform(get("/players/{p}/messages", link.playerId()).with(accounts.as(link.coachId())))
            .andExpect(status().isForbidden())
            .andExpect(jsonPath("$.error").value("contact_revoked"));
    }

    // Finding 2: onboarding the same child twice onto a roster is a conflict, not a second child record.
    @Test
    void onboardingTheSameChildTwiceReturns409() throws Exception {
        var link = accounts.activeLink(mvc);
        var dob = jdbc.queryForObject("select dob from account where id = ?", LocalDate.class, link.playerId());
        mvc.perform(post("/rosters/{r}/players", link.rosterId()).with(accounts.as(link.coachId()))
                .contentType("application/json").content(onboardBody(link.parentEmail(), "Alex", dob, "REG-2027-0042")))
            .andExpect(status().isConflict())
            .andExpect(jsonPath("$.error").value("already_linked"));
        assertThat(jdbc.queryForObject("select count(*) from account where academy_id = ? and role = 'player'",
            Integer.class, link.academy().id())).isEqualTo(1);
    }

    // Finding 2: the contract says 404 for a parent with no linked player.
    @Test
    void feedForAParentWithNoLinkedPlayerIs404() throws Exception {
        var academy = accounts.academy();
        var parent = accounts.parent(mvc, academy, uniqueEmail("lonely"));
        mvc.perform(get("/parents/me/feed").with(accounts.as(parent)))
            .andExpect(status().isNotFound())
            .andExpect(jsonPath("$.error").value("no_linked_player"));
    }

    // Finding 4: concurrent drills at the edge of the cap cannot exceed it.
    @Test
    void concurrentDrillsCannotExceedTheDailyCap() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant base = Instant.now().minus(1, ChronoUnit.HOURS);
        for (int i = 0; i < 9; i++) {   // 270 XP
            mvc.perform(post("/players/{p}/drills", link.playerId()).with(accounts.as(link.playerId()))
                    .contentType("application/json").content("{\"drill_id\":\"d" + i + "\",\"completed_at\":\"" + base + "\"}"))
                .andExpect(status().isCreated());
        }
        var pool = Executors.newFixedThreadPool(4);
        List<Future<Integer>> results = new ArrayList<>();
        for (int i = 0; i < 4; i++) {
            final int n = i;
            results.add(pool.submit((Callable<Integer>) () -> mvc.perform(post("/players/{p}/drills", link.playerId())
                    .with(accounts.as(link.playerId())).contentType("application/json")
                    .content("{\"drill_id\":\"race" + n + "\",\"completed_at\":\"" + base + "\"}"))
                .andReturn().getResponse().getStatus()));
        }
        for (var f : results) f.get();
        pool.shutdown();
        assertThat(jdbc.queryForObject("select sum(xp) from drill_log where player_id = ?", Integer.class, link.playerId()))
            .isEqualTo(300);
    }

    // Finding 5: drills older than the backdating window are refused.
    @Test
    void drillsOlderThanSeventyTwoHoursAreRefused() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/players/{p}/drills", link.playerId()).with(accounts.as(link.playerId()))
                .contentType("application/json")
                .content("{\"drill_id\":\"old\",\"completed_at\":\"" + Instant.now().minus(73, ChronoUnit.HOURS) + "\"}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("too_old"));
        mvc.perform(post("/players/{p}/drills", link.playerId()).with(accounts.as(link.playerId()))
                .contentType("application/json")
                .content("{\"drill_id\":\"weekend\",\"completed_at\":\"" + Instant.now().minus(60, ChronoUnit.HOURS) + "\"}"))
            .andExpect(status().isCreated());
    }

    // Finding 6: an older test result never overwrites a newer attribute value.
    @Test
    void anOlderTestDoesNotOverwriteANewerAttribute() throws Exception {
        var link = accounts.activeLink(mvc);
        Instant newer = Instant.now().minus(1, ChronoUnit.HOURS);
        Instant older = newer.minus(30, ChronoUnit.DAYS);
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId())).contentType("application/json")
                .content("{\"test_type\":\"sprint_20m\",\"results\":{\"pace\":70},\"signed_at\":\"" + newer + "\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/players/{p}/tests", link.playerId()).with(accounts.as(link.coachId())).contentType("application/json")
                .content("{\"test_type\":\"sprint_20m\",\"results\":{\"pace\":50},\"signed_at\":\"" + older + "\"}"))
            .andExpect(status().isCreated())
            .andExpect(jsonPath("$.attributes_changed").isEmpty());
        assertThat(jdbc.queryForObject("select value from player_attribute where player_id = ? and name = 'pace'",
            Integer.class, link.playerId())).isEqualTo(70);
        assertThat(jdbc.queryForObject("select count(*) from test_result where player_id = ?", Integer.class, link.playerId())).isEqualTo(2);
    }

    // Finding 7: no JWT signing secret is committed as a default.
    @Test
    void applicationConfigHasNoDefaultJwtSecret() throws Exception {
        String yml = Files.readString(Path.of("src/main/resources/application.yml"));
        String secretLine = yml.lines().filter(l -> l.trim().startsWith("secret:")).findFirst().orElseThrow();
        assertThat(secretLine.trim()).isEqualTo("secret: ${TIERS_JWT_SECRET}");
    }

    // Finding 8: one failing email does not stop the run, and a re-run does not resend.
    @Test
    void weeklyFeedJobContinuesPastAFailureAndNeverSendsTwice() throws Exception {
        var a = accounts.activeLink(mvc);
        var b = accounts.activeLink(mvc);
        String week = com.academy.tiers.common.IsoWeek.containing(LocalDate.now()).toString();
        mailer.failFor(a.parentEmail());
        weeklyFeedJob.run(week);
        assertThat(mailer.sentTo(b.parentEmail(), "weekly_feed")).hasSize(1);
        assertThat(mailer.sentTo(a.parentEmail(), "weekly_feed")).isEmpty();

        mailer.recover(a.parentEmail());
        weeklyFeedJob.run(week);
        assertThat(mailer.sentTo(b.parentEmail(), "weekly_feed")).hasSize(1);   // not resent
        assertThat(mailer.sentTo(a.parentEmail(), "weekly_feed")).hasSize(1);   // retried after the failure
    }

    @Autowired com.academy.tiers.feed.WeeklyFeedJob weeklyFeedJob;

    // Finding 9: an email already used by a coach cannot be onboarded as a parent.
    @Test
    void parentOnboardingRefusesAnEmailThatBelongsToACoach() throws Exception {
        var academy = accounts.academy();
        String email = uniqueEmail("coachmail");
        mvc.perform(post("/academies/{a}/coaches", academy.id()).with(accounts.as(academy.adminId()))
                .contentType("application/json").content("{\"email\":\"" + email + "\",\"name\":\"C\"}"))
            .andExpect(status().isCreated());
        mvc.perform(post("/academies/{a}/parents", academy.id()).with(accounts.as(academy.adminId()))
                .contentType("application/json").content("{\"parents\":[{\"email\":\"" + email + "\",\"name\":\"P\"}]}"))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("email_in_use"));
    }

    // Finding 10: an unknown coach id on a contact block is a 404, not a 500.
    @Test
    void contactBlockForAnUnknownCoachIs404() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/players/{p}/contact-block", link.playerId()).with(accounts.as(link.parentId()))
                .contentType("application/json").content("{\"coach_id\":\"" + UUID.randomUUID() + "\"}"))
            .andExpect(status().isNotFound());
    }

    // Finding 10: a token without the academy claim is rejected as unauthenticated, not a 500.
    @Test
    void tokenWithoutAnAcademyClaimIs401() throws Exception {
        mvc.perform(get("/parents/me/feed").with(jwt().jwt(j -> j.subject(UUID.randomUUID().toString()).claim("role", "parent"))
                .authorities(new SimpleGrantedAuthority("ROLE_PARENT"))))
            .andExpect(status().isUnauthorized());
    }

    // Test gap: admins of another academy cannot add coaches or guardians here.
    @Test
    void adminOfAnotherAcademyCannotAddCoachesOrGuardians() throws Exception {
        var link = accounts.activeLink(mvc);
        var other = accounts.academy();
        mvc.perform(post("/academies/{a}/coaches", link.academy().id()).with(accounts.as(other.adminId()))
                .contentType("application/json").content("{\"email\":\"" + uniqueEmail("x") + "\",\"name\":\"X\"}"))
            .andExpect(status().isForbidden());
        mvc.perform(post("/academies/{a}/players/{p}/guardians", link.academy().id(), link.playerId()).with(accounts.as(other.adminId()))
                .contentType("application/json").content("{\"email\":\"" + link.parentEmail() + "\"}"))
            .andExpect(status().isForbidden());
    }
}
