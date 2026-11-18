package com.academy.tiers.roster;

import com.academy.tiers.identity.AccountService;
import com.academy.tiers.security.CurrentUser;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.UUID;

/**
 * Who may see or act on a player. The player, the player's guardians, and coaches
 * with an active roster link. A revoked link removes the coach on the next request.
 */
@Component
public class RosterAccess {

    private final JdbcTemplate jdbc;
    private final AccountService accounts;

    public RosterAccess(JdbcTemplate jdbc, AccountService accounts) {
        this.jdbc = jdbc;
        this.accounts = accounts;
    }

    public boolean hasActiveLink(UUID coachId, UUID playerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from roster_link where coach_id = ? and player_id = ? and status = 'active')",
            Boolean.class, coachId, playerId));
    }

    public List<UUID> activeCoachesOf(UUID playerId) {
        return jdbc.queryForList("select coach_id from roster_link where player_id = ? and status = 'active' order by coach_id",
            UUID.class, playerId);
    }

    public boolean canSee(CurrentUser caller, UUID playerId) {
        return switch (caller.role()) {
            case "player" -> caller.id().equals(playerId);
            case "parent" -> accounts.isGuardian(caller.id(), playerId);
            case "coach" -> hasActiveLink(caller.id(), playerId);
            default -> false;
        };
    }
}
