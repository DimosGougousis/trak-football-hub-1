package com.academy.tiers.verification;

import com.academy.tiers.audit.AuditService;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** GR-07: a coach without an active, unexpired check cannot onboard players or send messages. */
@Service
public class CoachVerificationService {

    private final JdbcTemplate jdbc;
    private final AuditService audit;

    public CoachVerificationService(JdbcTemplate jdbc, AuditService audit) {
        this.jdbc = jdbc;
        this.audit = audit;
    }

    @Transactional
    public void record(UUID actor, UUID coachId, VerificationType type, String reference, LocalDate expiresOn) {
        jdbc.update("""
            insert into coach_verification(coach_id, type, reference, expires_on) values (?, ?, ?, ?)
            on conflict (coach_id) do update set type = excluded.type, reference = excluded.reference, expires_on = excluded.expires_on
            """, coachId, type.name(), reference, expiresOn);
        audit.record(actor, "coach_verified", coachId, Map.of("type", type.name(), "expires_on", expiresOn.toString()));
    }

    /** Active on every day up to and including the expiry date. */
    public boolean isActive(UUID coachId, LocalDate on) {
        List<LocalDate> expiry = jdbc.queryForList(
            "select expires_on from coach_verification where coach_id = ?", LocalDate.class, coachId);
        return !expiry.isEmpty() && !expiry.get(0).isBefore(on);
    }
}
