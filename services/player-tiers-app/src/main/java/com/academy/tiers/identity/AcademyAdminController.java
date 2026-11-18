package com.academy.tiers.identity;

import com.academy.tiers.audit.AuditService;
import com.academy.tiers.common.ApiException;
import com.academy.tiers.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/** What an academy admin does: add coaches, onboard parents (OQ-8), add a second guardian. */
@RestController
public class AcademyAdminController {

    private static final Pattern EMAIL = Pattern.compile("^[^@\\s]+@[^@\\s]+\\.[^@\\s]+$");

    record CoachRequest(@NotBlank String email, @NotBlank String name) {}
    record ParentEntry(@NotNull String email, @NotBlank String name) {}
    record ParentsRequest(@NotEmpty List<@Valid ParentEntry> parents) {}
    record GuardianRequest(@NotBlank String email) {}

    private final AccountService accounts;
    private final AuditService audit;
    private final JdbcTemplate jdbc;

    public AcademyAdminController(AccountService accounts, AuditService audit, JdbcTemplate jdbc) {
        this.accounts = accounts;
        this.audit = audit;
        this.jdbc = jdbc;
    }

    /** Adds a coach and the coach's default roster. The coach still needs a verification before onboarding anyone. */
    @PostMapping("/academies/{academyId}/coaches")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> addCoach(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID academyId,
                                        @Valid @RequestBody CoachRequest req) {
        var caller = CurrentUser.of(jwt);
        caller.requireAdminOf(academyId);
        if (!EMAIL.matcher(req.email().trim()).matches()) throw ApiException.unprocessable("invalid_email");
        UUID coachId;
        try {
            coachId = accounts.create(academyId, "coach", req.email().trim(), req.name().trim(), null);
        } catch (DuplicateKeyException e) {
            throw new ApiException(HttpStatus.CONFLICT, "email_in_use");
        }
        UUID rosterId = UUID.randomUUID();
        jdbc.update("insert into roster(id, academy_id, coach_id, name) values (?, ?, ?, ?)",
            rosterId, academyId, coachId, req.name().trim() + "'s squad");
        audit.record(caller.id(), "coach_added", coachId, Map.of("roster_id", rosterId.toString()));
        return Map.of("coach_id", coachId, "roster_id", rosterId);
    }

    /** Bulk, idempotent by email. One malformed email rejects the whole batch before anything is written. */
    @PostMapping("/academies/{academyId}/parents")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> onboardParents(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID academyId,
                                              @Valid @RequestBody ParentsRequest req) {
        var caller = CurrentUser.of(jwt);
        caller.requireAdminOf(academyId);
        for (ParentEntry p : req.parents()) {
            if (!EMAIL.matcher(p.email().trim()).matches()) throw ApiException.unprocessable("invalid_email");
        }
        for (ParentEntry p : req.parents()) {
            Boolean usedByOtherRole = jdbc.queryForObject(
                "select exists(select 1 from account where academy_id = ? and lower(email) = lower(?) and role <> 'parent')",
                Boolean.class, academyId, p.email().trim());
            if (Boolean.TRUE.equals(usedByOtherRole)) throw ApiException.unprocessable("email_in_use");
        }
        int created = 0;
        for (ParentEntry p : req.parents()) {
            if (accounts.createParentIfAbsent(academyId, p.email(), p.name())) created++;
        }
        int existing = req.parents().size() - created;
        audit.record(caller.id(), "parents_onboarded", academyId, Map.of("created", created, "existing", existing));
        return Map.of("created", created, "existing", existing);
    }

    /** Links one more onboarded parent to a player, so both are copied on every message. */
    @PostMapping("/academies/{academyId}/players/{playerId}/guardians")
    @ResponseStatus(HttpStatus.CREATED)
    @Transactional
    public Map<String, Object> addGuardian(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID academyId,
                                           @PathVariable UUID playerId, @Valid @RequestBody GuardianRequest req) {
        var caller = CurrentUser.of(jwt);
        caller.requireAdminOf(academyId);
        var player = accounts.find(playerId)
            .filter(a -> a.role().equals("player") && a.academyId().equals(academyId))
            .orElseThrow(ApiException::notFound);
        var parent = accounts.findParentByEmail(academyId, req.email())
            .orElseThrow(() -> ApiException.unprocessable("parent_not_onboarded"));
        accounts.addGuardian(player.id(), parent.id());
        audit.record(caller.id(), "guardian_added", player.id(), Map.of("parent_id", parent.id().toString()));
        return Map.of("player_id", player.id(), "parent_id", parent.id());
    }
}
