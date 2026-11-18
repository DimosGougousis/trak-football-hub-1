package com.academy.tiers.progression;

import com.academy.tiers.analytics.AnalyticsEvents;
import com.academy.tiers.audit.AuditService;
import com.academy.tiers.common.ApiException;
import com.academy.tiers.roster.RosterAccess;
import com.academy.tiers.security.CurrentUser;
import com.academy.tiers.verification.CoachVerificationService;
import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;

/**
 * REQ-002, ADR-002: a verified coach with an active roster link signs an academy
 * test result, and that is the only event that changes Player Card attributes.
 */
@Service
public class TestResultService {

    public static final Set<String> ATTRIBUTES = Set.of("pace", "dribbling", "tactical_awareness");

    public record SignRequest(String testType, Map<String, Integer> results, Instant signedAt) {}

    private final JdbcTemplate jdbc;
    private final PlayerAttributeWriter writer;
    private final RosterAccess access;
    private final CoachVerificationService verification;
    private final AuditService audit;
    private final AnalyticsEvents events;
    private final ObjectMapper json;
    private final Clock clock;

    public TestResultService(JdbcTemplate jdbc, PlayerAttributeWriter writer, RosterAccess access,
                             CoachVerificationService verification, AuditService audit, AnalyticsEvents events,
                             ObjectMapper json, Clock clock) {
        this.jdbc = jdbc;
        this.writer = writer;
        this.access = access;
        this.verification = verification;
        this.audit = audit;
        this.events = events;
        this.json = json;
        this.clock = clock;
    }

    @Transactional
    public List<String> sign(CurrentUser caller, UUID playerId, SignRequest req) {
        if (!caller.is("coach") || !access.hasActiveLink(caller.id(), playerId)) throw ApiException.forbidden();
        if (!verification.isActive(caller.id(), LocalDate.now(clock))) throw new ApiException(HttpStatus.FORBIDDEN, "coach_unverified");

        Map<String, Integer> results = req.results() == null ? Map.of() : new TreeMap<>(req.results());
        boolean valid = !results.isEmpty() && results.entrySet().stream().allMatch(e ->
            ATTRIBUTES.contains(e.getKey()) && e.getValue() != null && e.getValue() >= 0 && e.getValue() <= 99);
        if (!valid || req.testType() == null || req.testType().isBlank()) throw ApiException.unprocessable("invalid_result");
        Instant signedAt = req.signedAt() == null ? Instant.now(clock) : req.signedAt();
        if (signedAt.isAfter(Instant.now(clock))) throw ApiException.unprocessable("future_date");

        try {
            jdbc.update("insert into test_result(id, player_id, coach_id, test_type, results, signed_at) values (?, ?, ?, ?, ?::jsonb, ?)",
                UUID.randomUUID(), playerId, caller.id(), req.testType().trim(), json.writeValueAsString(results),
                java.sql.Timestamp.from(signedAt));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
        List<String> changed = results.entrySet().stream()
            .filter(e -> writer.upsert(playerId, e.getKey(), e.getValue(), signedAt))
            .map(Map.Entry::getKey).toList();
        audit.record(caller.id(), "attribute_changed", playerId,
            Map.of("test_type", req.testType().trim(), "results", results, "applied", changed));
        events.emit("test_signed", playerId, Map.of("coach_id", caller.id().toString(), "test_type", req.testType().trim()));
        return changed;
    }
}
