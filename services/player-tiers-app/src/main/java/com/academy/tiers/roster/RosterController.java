package com.academy.tiers.roster;

import com.academy.tiers.common.ApiException;
import com.academy.tiers.identity.AccountService;
import com.academy.tiers.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
public class RosterController {

    private final RosterService roster;
    private final RosterAccess access;
    private final AccountService accounts;

    public RosterController(RosterService roster, RosterAccess access, AccountService accounts) {
        this.roster = roster;
        this.access = access;
        this.accounts = accounts;
    }

    @PostMapping("/rosters/{rosterId}/players")
    @ResponseStatus(HttpStatus.CREATED)
    RosterService.Onboarded onboard(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID rosterId,
                                    @RequestBody RosterService.OnboardRequest req) {
        return roster.onboard(CurrentUser.of(jwt), rosterId, req);
    }

    @DeleteMapping("/links/{playerId}/coaches/{coachId}")
    @ResponseStatus(HttpStatus.NO_CONTENT)
    void revoke(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId, @PathVariable UUID coachId) {
        roster.revoke(CurrentUser.of(jwt), playerId, coachId);
    }

    /** Minimal profile: no date of birth, no contact details. */
    @GetMapping("/players/{playerId}")
    Map<String, Object> player(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID playerId) {
        if (!access.canSee(CurrentUser.of(jwt), playerId)) throw ApiException.forbidden();
        var p = accounts.find(playerId).orElseThrow(ApiException::notFound);
        return Map.of("player_id", p.id(), "display_name", p.displayName());
    }
}
