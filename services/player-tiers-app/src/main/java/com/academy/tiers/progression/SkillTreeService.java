package com.academy.tiers.progression;

import com.academy.tiers.analytics.AnalyticsEvents;
import com.academy.tiers.audit.AuditService;
import com.academy.tiers.billing.UpgradePromptService;
import com.academy.tiers.common.ApiException;
import com.academy.tiers.roster.RosterAccess;
import com.academy.tiers.security.CurrentUser;
import com.academy.tiers.verification.CoachVerificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.regex.Pattern;

/**
 * CP-03: a verified, actively linked coach signs off a Skill Tree node. A node is
 * a milestone and a badge; it never changes Player Card attributes (ADR-002).
 */
@Service
public class SkillTreeService {

    private static final Pattern NODE = Pattern.compile("^[a-z0-9]+(-[a-z0-9]+)*$");

    public enum Result { COMPLETED, ALREADY_COMPLETED }

    private final JdbcTemplate jdbc;
    private final RosterAccess access;
    private final CoachVerificationService verification;
    private final AuditService audit;
    private final AnalyticsEvents events;
    private final UpgradePromptService prompts;
    private final Clock clock;

    public SkillTreeService(JdbcTemplate jdbc, RosterAccess access, CoachVerificationService verification, AuditService audit,
                            AnalyticsEvents events, UpgradePromptService prompts, Clock clock) {
        this.jdbc = jdbc;
        this.access = access;
        this.verification = verification;
        this.audit = audit;
        this.events = events;
        this.prompts = prompts;
        this.clock = clock;
    }

    @Transactional
    public Result complete(CurrentUser caller, UUID playerId, String node) {
        if (!caller.is("coach") || !access.hasActiveLink(caller.id(), playerId)) throw ApiException.forbidden();
        if (!verification.isActive(caller.id(), LocalDate.now(clock))) throw new ApiException(HttpStatus.FORBIDDEN, "coach_unverified");
        if (node == null || node.length() > 40 || !NODE.matcher(node).matches()) throw ApiException.unprocessable("invalid_node");

        int fresh = jdbc.update("insert into skill_tree_completion(player_id, node, coach_id) values (?, ?, ?) on conflict do nothing",
            playerId, node, caller.id());
        if (fresh == 0) return Result.ALREADY_COMPLETED;
        audit.record(caller.id(), "skill_node_completed", playerId, Map.of("node", node));
        events.emit("skill_tree_milestone", playerId, Map.of("node", node));
        prompts.onMilestone(playerId, node);
        return Result.COMPLETED;
    }

    public List<String> completedNodes(UUID playerId) {
        return jdbc.queryForList("select node from skill_tree_completion where player_id = ? order by completed_at, node",
            String.class, playerId);
    }
}
