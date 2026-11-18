package com.academy.tiers.messaging;

import com.academy.tiers.audit.AuditService;
import com.academy.tiers.common.ApiException;
import com.academy.tiers.identity.Account;
import com.academy.tiers.identity.AccountService;
import com.academy.tiers.mail.AfterCommitMailer;
import com.academy.tiers.roster.RosterAccess;
import com.academy.tiers.security.CurrentUser;
import com.academy.tiers.verification.CoachVerificationService;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

/**
 * GR-08: every message is about one player and goes to the player, all the
 * player's guardians and every actively linked, non-blocked coach, minus the
 * author. Clients cannot choose recipients, so a private adult-to-minor thread
 * cannot exist. A message with no parent recipient is refused.
 */
@Service
public class MessageService {

    public static final int MAX_BODY = 2000;

    public record SendRequest(UUID toPlayerId, String body) {}

    public record Sent(UUID messageId, List<UUID> recipients) {}

    public record Message(UUID messageId, UUID authorId, String body, OffsetDateTime at) {}

    private final JdbcTemplate jdbc;
    private final AccountService accounts;
    private final RosterAccess access;
    private final CoachVerificationService verification;
    private final AuditService audit;
    private final AfterCommitMailer mail;
    private final Clock clock;

    public MessageService(JdbcTemplate jdbc, AccountService accounts, RosterAccess access,
                          CoachVerificationService verification, AuditService audit, AfterCommitMailer mail, Clock clock) {
        this.jdbc = jdbc;
        this.accounts = accounts;
        this.access = access;
        this.verification = verification;
        this.audit = audit;
        this.mail = mail;
        this.clock = clock;
    }

    @Transactional
    public Sent send(CurrentUser caller, SendRequest req) {
        UUID playerId = req.toPlayerId();
        if (playerId == null || !access.canSee(caller, playerId)) throw ApiException.forbidden();
        if (caller.is("coach")) {
            if (isBlocked(playerId, caller.id())) throw new ApiException(HttpStatus.FORBIDDEN, "contact_revoked");
            if (!verification.isActive(caller.id(), LocalDate.now(clock))) throw new ApiException(HttpStatus.FORBIDDEN, "coach_unverified");
        }
        String body = req.body() == null ? "" : req.body().trim();
        if (body.isEmpty() || body.length() > MAX_BODY) throw ApiException.unprocessable("invalid_message");

        List<UUID> guardians = accounts.guardiansOf(playerId);
        if (guardians.isEmpty()) throw ApiException.unprocessable("no_parent_recipient");
        Set<UUID> recipients = new LinkedHashSet<>();
        recipients.add(playerId);
        recipients.addAll(guardians);
        for (UUID coach : access.activeCoachesOf(playerId)) {
            if (!isBlocked(playerId, coach)) recipients.add(coach);
        }
        recipients.remove(caller.id());

        UUID messageId = UUID.randomUUID();
        jdbc.update("insert into message(id, player_id, author_id, body) values (?, ?, ?, ?)", messageId, playerId, caller.id(), body);
        for (UUID r : recipients) {
            jdbc.update("insert into message_recipient(message_id, account_id) values (?, ?)", messageId, r);
        }
        audit.record(caller.id(), "message_sent", playerId, Map.of("message_id", messageId.toString(), "recipients", recipients.size()));

        // Parents are copied by email on every message, whoever wrote it.
        for (UUID g : guardians) {
            if (g.equals(caller.id())) continue;
            accounts.find(g).map(Account::email).filter(e -> e != null && !e.isBlank())
                .ifPresent(email -> mail.send(email, "coach_message", Map.of("player_id", playerId.toString(), "body", body)));
        }
        return new Sent(messageId, List.copyOf(recipients));
    }

    public List<Message> thread(CurrentUser caller, UUID playerId) {
        if (!access.canSee(caller, playerId)) throw ApiException.forbidden();
        if (caller.is("coach") && isBlocked(playerId, caller.id())) throw new ApiException(HttpStatus.FORBIDDEN, "contact_revoked");
        return jdbc.query("select id, author_id, body, at from message where player_id = ? order by at desc, id",
            (rs, i) -> new Message(rs.getObject("id", UUID.class), rs.getObject("author_id", UUID.class),
                rs.getString("body"), rs.getObject("at", OffsetDateTime.class)), playerId);
    }

    /** GR-09: a guardian stops all electronic contact between one coach and their child. */
    @Transactional
    public void block(CurrentUser caller, UUID playerId, UUID coachId) {
        if (!caller.is("parent") || !accounts.isGuardian(caller.id(), playerId) || coachId == null) throw ApiException.forbidden();
        UUID playerAcademy = accounts.find(playerId).map(Account::academyId).orElseThrow(ApiException::notFound);
        accounts.find(coachId).filter(c -> c.role().equals("coach") && c.academyId().equals(playerAcademy))
            .orElseThrow(ApiException::notFound);
        int n = jdbc.update("insert into contact_block(player_id, coach_id, blocked_by) values (?, ?, ?) on conflict do nothing",
            playerId, coachId, caller.id());
        if (n == 1) audit.record(caller.id(), "contact_revoked", playerId, Map.of("coach_id", coachId.toString()));
    }

    boolean isBlocked(UUID playerId, UUID coachId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from contact_block where player_id = ? and coach_id = ?)", Boolean.class, playerId, coachId));
    }
}
