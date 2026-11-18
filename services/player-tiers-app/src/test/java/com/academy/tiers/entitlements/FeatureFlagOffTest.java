package com.academy.tiers.entitlements;

import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.TestPropertySource;
import org.springframework.test.web.servlet.MockMvc;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** A flag switched off by configuration (no code change) removes the feature even from Premium. */
@TestPropertySource(properties = "tiers.flags.wearable_sync=false")
class FeatureFlagOffTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;

    @Test
    void premiumPlayerGets402WhenTheFlagIsOff() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.setTier(link.playerId(), link.parentId(), "premium");
        mvc.perform(get("/players/{p}/premium-probe", link.playerId()).with(accounts.as(link.parentId())))
            .andExpect(status().isPaymentRequired())
            .andExpect(jsonPath("$.error").value("tier_required"));
    }
}
