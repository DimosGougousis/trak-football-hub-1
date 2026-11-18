package com.academy.tiers.roster;

import com.academy.tiers.audit.AuditService;
import com.academy.tiers.common.ApiException;
import com.academy.tiers.identity.AccountService;
import com.academy.tiers.mail.AfterCommitMailer;
import com.academy.tiers.security.CurrentUser;
import com.academy.tiers.verification.CoachVerificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.Period;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * REQ-001 as amended 2026-11-18: a verified coach onboards a player directly.
 * There is no parent approval step. The link is active at once, the academy-onboarded
 * parent is notified, and the parent can revoke the link at any time.
 */
@Service
public class RosterService {

    public record OnboardRequest(String playerFirstName, LocalDate dob, String parentEmail, String academyConsentRef) {}

    public record Onboarded(UUID playerId, String linkStatus, boolean parentNotified) {}

    private final JdbcTemplate jdbc;
    private final AccountService accounts;
    private final CoachVerificationService verification;
    private final ConsentProperties consent;
    private final AuditService audit;
    private final AfterCommitMailer mail;
    private final Clock clock;

    public RosterService(JdbcTemplate jdbc, AccountService accounts, CoachVerificationService verification,
                         ConsentProperties consent, AuditService audit, AfterCommitMailer mail, Clock clock) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.verification = verification;
        this.consent = consent;
        this.audit = audit;
        this.mail = mail;
        this.clock = clock;
    }

    @Transactional
    public Onboarded onboard(CurrentUser caller, UUID rosterId, OnboardRequest req) {
        // 1. Only the roster's own coach, and only while verified (GR-07).
        List<Map<String, Object>> rows = jdbc.queryForList("select academy_id, coach_id from roster where id = ?", rosterId);
        if (rows.isEmpty()) throw ApiException.notFound();
        UUID academyId = (UUID) rows.get(0).get("academy_id");
        UUID coachId = (UUID) rows.get(0).get("coach_id");
        if (!caller.is("coach") || !caller.id().equals(coachId)) throw ApiException.forbidden();
        LocalDate today = LocalDate.now(clock);
        if (!verification.isActive(coachId, today)) throw new ApiException(HttpStatus.FORBIDDEN, "coach_unverified");

        // 2. Every player needs a parent recipient (REQ-003) and valid player details.
        if (req.parentEmail() == null || req.parentEmail().isBlank()) throw ApiException.unprocessable("parent_email_required");
        if (req.playerFirstName() == null || req.playerFirstName().isBlank() || req.dob() == null || req.dob().isAfter(today)) {
            throw ApiException.unprocessable("invalid_player");
        }

        // 3. Consent fails closed: unset age refuses everyone; under the age needs the academy's reference.
        Integer minAge = consent.minAgeWithoutVerifiedConsent();
        boolean hasRef = req.academyConsentRef() != null && !req.academyConsentRef().isBlank();
        if (minAge == null || (Period.between(req.dob(), today).getYears() < minAge && !hasRef)) {
            throw ApiException.unprocessable("consent_required");
        }

        // 4. The academy onboards parents itself (OQ-8); the coach can only link to one that exists.
        var parent = accounts.findParentByEmail(academyId, req.parentEmail())
            .orElseThrow(() -> ApiException.unprocessable("parent_not_onboarded"));

        Boolean duplicate = jdbc.queryForObject("""
            select exists(select 1 from roster_link rl
                          join account p on p.id = rl.player_id
                          join player_guardian g on g.player_id = p.id
                          where rl.roster_id = ? and g.parent_id = ? and p.dob = ? and lower(p.display_name) = lower(?))
            """, Boolean.class, rosterId, parent.id(), req.dob(), req.playerFirstName().trim());
        if (Boolean.TRUE.equals(duplicate)) throw new ApiException(HttpStatus.CONFLICT, "already_linked");

        UUID playerId = accounts.create(academyId, "player", null, req.playerFirstName().trim(), req.dob());
        accounts.addGuardian(playerId, parent.id());
        String ref = hasRef ? req.academyConsentRef().trim() : null;
        jdbc.update("insert into roster_link(player_id, coach_id, roster_id, academy_consent_ref, status) values (?, ?, ?, ?, 'active')",
            playerId, coachId, rosterId, ref);

        Map<String, Object> detail = new HashMap<>();
        detail.put("roster_id", rosterId.toString());
        detail.put("academy_consent_ref", ref);
        audit.record(caller.id(), "player_onboarded", playerId, detail);
        mail.send(parent.email(), "player_onboarded", Map.of("player_first_name", req.playerFirstName().trim()));
        return new Onboarded(playerId, "active", true);
    }

    @Transactional
    public void revoke(CurrentUser caller, UUID playerId, UUID coachId) {
        if (!caller.is("parent") || !accounts.isGuardian(caller.id(), playerId)) throw ApiException.forbidden();
        int n = jdbc.update("update roster_link set status = 'revoked' where player_id = ? and coach_id = ? and status = 'active'",
            playerId, coachId);
        if (n == 0) throw ApiException.notFound();
        audit.record(caller.id(), "link_revoked", playerId, Map.of("coach_id", coachId.toString()));
    }
}
