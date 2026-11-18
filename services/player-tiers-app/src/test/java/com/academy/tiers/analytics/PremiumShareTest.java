package com.academy.tiers.analytics;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;

/** Task 4.6: the premium-share guardrail (Product Office analytics/metrics.md#premium-share). */
class PremiumShareTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;
    @Autowired PremiumShareQuery query;

    @Test
    void shareOfActivelyRosteredPlayersOnPremium() throws Exception {
        var link = accounts.activeLink(mvc);
        UUID b = accounts.extraPlayer(mvc, link, "B");
        accounts.extraPlayer(mvc, link, "C");
        accounts.extraPlayer(mvc, link, "D");
        accounts.extraPlayer(mvc, link, "E");
        accounts.setTier(link.playerId(), link.parentId(), "premium");
        accounts.setTier(b, link.parentId(), "premium");
        assertThat(query.share(link.academy().id())).isEqualByComparingTo("0.40");
    }

    @Test
    void academyWithNoPlayersHasNoShare() {
        assertThat(query.share(UUID.randomUUID())).isNull();
    }
}
