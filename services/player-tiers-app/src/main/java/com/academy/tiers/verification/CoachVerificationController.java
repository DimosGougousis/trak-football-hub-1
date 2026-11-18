package com.academy.tiers.verification;

import com.academy.tiers.common.ApiException;
import com.academy.tiers.identity.AccountService;
import com.academy.tiers.security.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
public class CoachVerificationController {

    record VerificationRequest(@NotNull VerificationType type, @NotBlank String reference, @NotNull LocalDate expiresOn) {}

    private final CoachVerificationService service;
    private final AccountService accounts;
    private final Clock clock;

    public CoachVerificationController(CoachVerificationService service, AccountService accounts, Clock clock) {
        this.service = service;
        this.accounts = accounts;
        this.clock = clock;
    }

    /** An admin of the coach's own academy records the coach's check. */
    @PostMapping("/coaches/{coachId}/verification")
    @ResponseStatus(HttpStatus.CREATED)
    Map<String, Object> record(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID coachId,
                               @Valid @RequestBody VerificationRequest req) {
        var caller = CurrentUser.of(jwt);
        var coach = accounts.find(coachId).filter(a -> a.role().equals("coach")).orElseThrow(ApiException::notFound);
        caller.requireAdminOf(coach.academyId());
        service.record(caller.id(), coachId, req.type(), req.reference(), req.expiresOn());
        String status = req.expiresOn().isBefore(LocalDate.now(clock)) ? "expired" : "active";
        return Map.of("status", status, "expires_on", req.expiresOn());
    }
}
