package com.academy.tiers;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.authority.SimpleGrantedAuthority;
import org.springframework.stereotype.Component;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.RequestPostProcessor;

import java.time.LocalDate;
import java.util.UUID;
import java.util.concurrent.atomic.AtomicInteger;

import static org.springframework.security.test.web.servlet.request.SecurityMockMvcRequestPostProcessors.jwt;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Test fixtures. Each call to {@link #academy()} creates an isolated academy with
 * its own admin, so tests never see each other's data.
 *
 * Setup goes through the real HTTP API wherever a test depends on that behaviour
 * (coach creation, parent onboarding, player onboarding), so fixtures cannot drift
 * from production rules.
 */
@Component
public class TestAccounts {

    public record Academy(UUID id, UUID adminId) {}

    public record Link(Academy academy, UUID coachId, UUID rosterId, UUID playerId, UUID parentId, String parentEmail) {}

    private static final AtomicInteger SEQ = new AtomicInteger();

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public TestAccounts(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public static String uniqueEmail(String prefix) {
        return prefix + "+" + SEQ.incrementAndGet() + "@example.test";
    }

    /** A fresh academy with one admin account. Academies are created by platform ops, not by an API. */
    public Academy academy() {
        UUID academyId = UUID.randomUUID();
        UUID adminId = UUID.randomUUID();
        jdbc.update("insert into academy(id, name) values (?, ?)", academyId, "Test Academy " + SEQ.incrementAndGet());
        jdbc.update("insert into account(id, academy_id, role, email, display_name) values (?, ?, 'admin', ?, 'Admin')",
            adminId, academyId, uniqueEmail("admin"));
        return new Academy(academyId, adminId);
    }

    /** A token for any account, with the role and academy read from the database. */
    public RequestPostProcessor as(UUID accountId) {
        var row = jdbc.queryForMap("select role, academy_id from account where id = ?", accountId);
        String role = (String) row.get("role");
        UUID academyId = (UUID) row.get("academy_id");
        return jwt()
            .jwt(j -> j.subject(accountId.toString()).claim("role", role).claim("academy", academyId.toString()))
            .authorities(new SimpleGrantedAuthority("ROLE_" + role.toUpperCase()));
    }

    /** Adds a coach through the admin API. Returns the coach id; the coach's roster is {@link #rosterOf}. */
    public UUID coach(MockMvc mvc, Academy academy) throws Exception {
        String body = "{\"email\":\"" + uniqueEmail("coach") + "\",\"name\":\"Coach\"}";
        String res = mvc.perform(post("/academies/{a}/coaches", academy.id()).with(as(academy.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(res).get("coach_id").asText());
    }

    public UUID rosterOf(UUID coachId) {
        return jdbc.queryForObject("select id from roster where coach_id = ?", UUID.class, coachId);
    }

    /** Records a coach check through the admin API, valid for the given number of days (negative = expired). */
    public void verify(MockMvc mvc, Academy academy, UUID coachId, int validDays) throws Exception {
        String body = "{\"type\":\"GR_CRIMINAL_RECORD\",\"reference\":\"PM-" + SEQ.incrementAndGet()
            + "\",\"expires_on\":\"" + LocalDate.now().plusDays(validDays) + "\"}";
        mvc.perform(post("/coaches/{c}/verification", coachId).with(as(academy.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isCreated());
    }

    /** Onboards one parent through the academy's bulk endpoint and returns the parent id. */
    public UUID parent(MockMvc mvc, Academy academy, String email) throws Exception {
        String body = "{\"parents\":[{\"email\":\"" + email + "\",\"name\":\"Parent\"}]}";
        mvc.perform(post("/academies/{a}/parents", academy.id()).with(as(academy.adminId()))
                .contentType("application/json").content(body))
            .andExpect(status().isCreated());
        return jdbc.queryForObject("select id from account where academy_id = ? and lower(email) = lower(?)",
            UUID.class, academy.id(), email);
    }

    public static String onboardBody(String parentEmail, String firstName, LocalDate dob, String consentRef) {
        String ref = consentRef == null ? "null" : "\"" + consentRef + "\"";
        return "{\"player_first_name\":\"" + firstName + "\",\"dob\":\"" + dob + "\",\"parent_email\":\""
            + parentEmail + "\",\"academy_consent_ref\":" + ref + "}";
    }

    /**
     * Seeds a historical drill directly. The API refuses drills older than the
     * backdating window, so tests that need past weeks (streaks, the weekly metric)
     * write history here instead.
     */
    public void seedDrill(UUID playerId, String drillId, LocalDate day, int xp) {
        jdbc.update("insert into drill_log(player_id, drill_id, day, completed_at, xp) values (?, ?, ?, ?, ?)",
            playerId, drillId, day, java.sql.Timestamp.valueOf(day.atTime(17, 0)), xp);
    }

    /** Sets a player's subscription directly, as a processed Stripe webhook would, valid for 30 days. */
    public void setTier(UUID playerId, UUID parentId, String tier) {
        setTier(playerId, parentId, tier, java.time.Instant.now().plusSeconds(30L * 86400));
    }

    public void setTier(UUID playerId, UUID parentId, String tier, java.time.Instant periodEnd) {
        jdbc.update("""
            insert into player_subscription(player_id, payer_parent_id, tier, status, current_period_end)
            values (?, ?, ?, 'active', ?)
            on conflict (player_id) do update set tier = excluded.tier, status = 'active', current_period_end = excluded.current_period_end
            """, playerId, parentId, tier, java.sql.Timestamp.from(periodEnd));
    }

    /** Onboards a second parent and links them to the player through the admin API. Returns the parent id. */
    public UUID secondParent(MockMvc mvc, Link link, String email) throws Exception {
        UUID parentId = parent(mvc, link.academy(), email);
        mvc.perform(post("/academies/{a}/players/{p}/guardians", link.academy().id(), link.playerId())
                .with(as(link.academy().adminId())).contentType("application/json").content("{\"email\":\"" + email + "\"}"))
            .andExpect(status().isCreated());
        return parentId;
    }

    /** Onboards one more 15-year-old player onto an existing link's roster, with the same parent. */
    public UUID extraPlayer(MockMvc mvc, Link link, String firstName) throws Exception {
        String res = mvc.perform(post("/rosters/{r}/players", link.rosterId()).with(as(link.coachId()))
                .contentType("application/json")
                .content(onboardBody(link.parentEmail(), firstName, LocalDate.now().minusYears(15).minusDays(20), "REG-X")))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        return UUID.fromString(json.readTree(res).get("player_id").asText());
    }

    /** A complete, active coach-player link: verified coach, onboarded parent, 15-year-old player. */
    public Link activeLink(MockMvc mvc) throws Exception {
        Academy academy = academy();
        UUID coach = coach(mvc, academy);
        verify(mvc, academy, coach, 365);
        String parentEmail = uniqueEmail("parent");
        UUID parent = parent(mvc, academy, parentEmail);
        UUID roster = rosterOf(coach);
        String res = mvc.perform(post("/rosters/{r}/players", roster).with(as(coach))
                .contentType("application/json")
                .content(onboardBody(parentEmail, "Alex", LocalDate.now().minusYears(15).minusDays(10), "REG-2027-0042")))
            .andExpect(status().isCreated()).andReturn().getResponse().getContentAsString();
        JsonNode node = json.readTree(res);
        return new Link(academy, coach, roster, UUID.fromString(node.get("player_id").asText()), parent, parentEmail);
    }
}
