package com.academy.tiers.analytics;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.IsoFields;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** Task 2.5: the success metric, weekly-active-players (analytics/metrics.md#weekly-active-players). */
class WeeklyActivePlayersTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;
    @Autowired WeeklyActivePlayersQuery query;

    private void drill(UUID player, String id, LocalDate day) {
        accounts.seedDrill(player, id, day, 30);   // past weeks are outside the API's 72-hour window
    }

    @Test
    void shareOfRosterWithTwoOrMoreDrillsInTheIsoWeek() throws Exception {
        var link = accounts.activeLink(mvc);
        List<UUID> players = List.of(link.playerId(),
            accounts.extraPlayer(mvc, link, "B"), accounts.extraPlayer(mvc, link, "C"),
            accounts.extraPlayer(mvc, link, "D"), accounts.extraPlayer(mvc, link, "E"));
        LocalDate monday = LocalDate.now().minusWeeks(2).with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
        String week = monday.get(IsoFields.WEEK_BASED_YEAR) + "-W" + String.format("%02d", monday.get(IsoFields.WEEK_OF_WEEK_BASED_YEAR));

        for (int i = 0; i < 3; i++) {                      // three players with 2 drills each
            drill(players.get(i), "x", monday);
            drill(players.get(i), "y", monday.plusDays(2));
        }
        drill(players.get(3), "x", monday);               // one player with 1 drill: not active
        drill(players.get(4), "x", monday.minusDays(1));  // previous week: not counted

        assertThat(query.share(link.rosterId(), week)).isEqualByComparingTo("0.60");
    }

    @Test
    void emptyRosterHasNoShare() {
        assertThat(query.share(UUID.randomUUID(), "2027-W23")).isNull();
    }
}
