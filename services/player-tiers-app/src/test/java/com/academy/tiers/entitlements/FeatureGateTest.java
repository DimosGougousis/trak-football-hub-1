package com.academy.tiers.entitlements;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Task 4.2: @RequiresFeature returns 402 tier_required on Basic, and passes on Premium. */
class FeatureGateTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;

    @Test
    void basicPlayerGets402AndPremiumPlayerPasses() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(get("/players/{p}/premium-probe", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.error").value("tier_required"));

        accounts.setTier(link.playerId(), link.parentId(), "premium");
        mvc.perform(get("/players/{p}/premium-probe", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isOk());
    }

    @Test
    void anExpiredPremiumPeriodFallsBackToBasic() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.setTier(link.playerId(), link.parentId(), "premium", java.time.Instant.now().minusSeconds(60));
        mvc.perform(get("/players/{p}/premium-probe", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isPaymentRequired());
    }
}
