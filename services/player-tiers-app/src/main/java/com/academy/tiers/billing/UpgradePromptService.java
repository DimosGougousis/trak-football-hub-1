package com.academy.tiers.billing;

import com.academy.tiers.analytics.AnalyticsEvents;
import com.academy.tiers.entitlements.Entitlements;
import com.academy.tiers.entitlements.TierService;
import com.academy.tiers.identity.Account;
import com.academy.tiers.identity.AccountService;
import com.academy.tiers.mail.AfterCommitMailer;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/**
 * REQ-005 and deck S12/S13: the first Skill Tree milestone of a Basic player sends
 * one upgrade prompt to each parent, by email to the parent account. Nothing is
 * ever shown to the player.
 */
@Service
public class UpgradePromptService {

    private final JdbcTemplate jdbc;
    private final AccountService accounts;
    private final TierService tiers;
    private final Entitlements entitlements;
    private final AfterCommitMailer mail;
    private final AnalyticsEvents events;

    public UpgradePromptService(JdbcTemplate jdbc, AccountService accounts, TierService tiers,
                                Entitlements entitlements, AfterCommitMailer mail, AnalyticsEvents events) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.tiers = tiers;
        this.entitlements = entitlements;
        this.mail = mail;
        this.events = events;
    }

    /** Called when a coach signs off a Skill Tree node. At most one prompt per parent per player, ever. */
    public void onMilestone(UUID playerId, String node) {
        Integer milestones = jdbc.queryForObject("select count(*) from skill_tree_completion where player_id = ?", Integer.class, playerId);
        if (milestones == null || milestones != 1) return;          // the first milestone ever, not the first one while on Basic
        if (!"basic".equals(tiers.tierOf(playerId))) return;
        String firstName = accounts.find(playerId).map(Account::displayName).orElse("");
        for (UUID parentId : accounts.guardiansOf(playerId)) {
            int fresh = jdbc.update("insert into upgrade_prompt(player_id, parent_id) values (?, ?) on conflict do nothing",
                playerId, parentId);
            if (fresh == 0) continue;
            var email = accounts.find(parentId).map(Account::email).filter(e -> e != null && !e.isBlank());
            if (email.isEmpty()) continue;                            // nothing sent, so nothing recorded as sent
            mail.send(email.get(), "upgrade_prompt", Map.of(
                "player_first_name", firstName, "milestone", node, "premium_price_eur", entitlements.price("premium")));
            events.emit("upgrade_prompt_sent", playerId, Map.of("parent_id", parentId.toString(), "milestone", node));
        }
    }
}
