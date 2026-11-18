package com.academy.tiers.feed;

import com.academy.tiers.common.IsoWeek;
import com.academy.tiers.mail.Mailer;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Every Monday at 08:00, each parent gets last week's feed by email: one email per
 * parent, all their children in it. A failure for one parent is logged and the run
 * continues; feed_sent makes a re-run send only what has not been sent yet.
 *
 * Runs on one instance. Before running several instances, add a scheduler lock
 * (e.g. ShedLock); feed_sent already prevents duplicate emails across a re-run.
 */
@Component
public class WeeklyFeedJob {

    private static final Logger log = LoggerFactory.getLogger(WeeklyFeedJob.class);

    private record Parent(UUID id, String email) {}

    private final JdbcTemplate jdbc;
    private final FeedService feed;
    private final Mailer mailer;

    public WeeklyFeedJob(JdbcTemplate jdbc, FeedService feed, Mailer mailer) {
        this.jdbc = jdbc;
        this.feed = feed;
        this.mailer = mailer;
    }

    @Scheduled(cron = "0 0 8 * * MON")
    void lastWeek() {
        run(IsoWeek.containing(feed.currentWeek().monday().minusWeeks(1)).toString());
    }

    public void run(String isoWeek) {
        IsoWeek week = IsoWeek.parse(isoWeek);
        List<Parent> parents = jdbc.query("""
                select distinct a.id, a.email from player_guardian g join account a on a.id = g.parent_id
                where a.email is not null
                  and not exists (select 1 from feed_sent s where s.parent_id = a.id and s.week = ?)
                """,
            (rs, i) -> new Parent(rs.getObject("id", UUID.class), rs.getString("email")), week.toString());
        int sent = 0, failed = 0;
        for (Parent p : parents) {
            try {
                var f = feed.forParent(p.id(), week);
                if (f.players().isEmpty()) continue;
                mailer.send(p.email(), "weekly_feed", Map.of("week", f.week(), "players", f.players()));
                jdbc.update("insert into feed_sent(parent_id, week) values (?, ?) on conflict do nothing", p.id(), week.toString());
                sent++;
            } catch (RuntimeException e) {
                failed++;
                log.warn("weekly feed failed for parent {} week {}: {}", p.id(), week, e.getMessage());
            }
        }
        log.info("weekly feed {}: sent={} failed={}", week, sent, failed);
    }
}
