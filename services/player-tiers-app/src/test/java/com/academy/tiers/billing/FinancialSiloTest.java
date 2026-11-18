package com.academy.tiers.billing;

import com.academy.tiers.FakeStripeGateway;
import com.academy.tiers.IntegrationTestBase;
import com.academy.tiers.TestAccounts;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.web.servlet.MockMvc;

import java.util.List;
import java.util.UUID;

import static com.academy.tiers.TestAccounts.uniqueEmail;
import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/** Tasks 4.3-4.4: billing exists only in the parent account (REQ-005, ADR-003, GR-06). */
class FinancialSiloTest extends IntegrationTestBase {

    @Autowired MockMvc mvc;
    @Autowired TestAccounts accounts;
    @Autowired FakeStripeGateway stripe;
    @Autowired @org.springframework.beans.factory.annotation.Qualifier("requestMappingHandlerMapping")
    org.springframework.web.servlet.mvc.method.annotation.RequestMappingHandlerMapping mappings;

    private static String checkout(UUID player, String tier) {
        return "{\"player_id\":\"" + player + "\",\"tier\":\"" + tier + "\"}";
    }

    @Test
    void playerAndCoachTokensAreRefusedOnEveryBillingEndpoint() throws Exception {
        var link = accounts.activeLink(mvc);
        for (UUID caller : new UUID[]{link.playerId(), link.coachId()}) {
            mvc.perform(post("/billing/checkout").with(accounts.as(caller)).contentType("application/json")
                    .content(checkout(link.playerId(), "premium")))
                .andExpect(status().isForbidden());
            mvc.perform(get("/billing/subscriptions").with(accounts.as(caller)))
                .andExpect(status().isForbidden());
        }
        assertThat(stripe.checkouts).noneMatch(c -> c.playerId().equals(link.playerId()));
    }

    @Test
    void parentChecksOutPremiumForTheirOwnChild() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/billing/checkout").with(accounts.as(link.parentId())).contentType("application/json")
                .content(checkout(link.playerId(), "premium")))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$.checkout_url").value(org.hamcrest.Matchers.startsWith("https://checkout.stripe.test/")));
        var req = stripe.checkouts.stream().filter(c -> c.playerId().equals(link.playerId())).findFirst().orElseThrow();
        assertThat(req.parentId()).isEqualTo(link.parentId());
        assertThat(req.tier()).isEqualTo("premium");
        assertThat(req.priceEur()).isEqualByComparingTo("29.99");
    }

    @Test
    void parentCannotCheckOutForSomeoneElsesChild() throws Exception {
        var link = accounts.activeLink(mvc);
        var otherParent = accounts.parent(mvc, link.academy(), uniqueEmail("other"));
        mvc.perform(post("/billing/checkout").with(accounts.as(otherParent)).contentType("application/json")
                .content(checkout(link.playerId(), "premium")))
            .andExpect(status().isForbidden());
    }

    @Test
    void unknownTierIsRejected() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(post("/billing/checkout").with(accounts.as(link.parentId())).contentType("application/json")
                .content(checkout(link.playerId(), "gold")))
            .andExpect(status().isUnprocessableEntity())
            .andExpect(jsonPath("$.error").value("unknown_tier"));
    }

    @Test
    void parentSeesTheirChildrensSubscriptionsWithPrices() throws Exception {
        var link = accounts.activeLink(mvc);
        mvc.perform(get("/billing/subscriptions").with(accounts.as(link.parentId())))
            .andExpect(status().isOk())
            .andExpect(jsonPath("$[0].player_id").value(link.playerId().toString()))
            .andExpect(jsonPath("$[0].tier").value("basic"))
            .andExpect(jsonPath("$[0].premium_price_eur").value(29.99));
    }

    @Test
    void nothingAPlayerCanFetchMentionsPricesOrUpgrades() throws Exception {
        var link = accounts.activeLink(mvc);
        accounts.setTier(link.playerId(), link.parentId(), "premium");
        List<String> paths = mappings.getHandlerMethods().keySet().stream()
            .filter(info -> info.getMethodsCondition().getMethods().contains(org.springframework.web.bind.annotation.RequestMethod.GET))
            .flatMap(info -> info.getPatternValues().stream())
            .filter(p -> !p.startsWith("/billing") && !p.startsWith("/parents"))   // parent-only areas, refused to players above
            .filter(p -> p.replace("{playerId}", "").chars().noneMatch(c -> c == '{'))
            .sorted().toList();
        assertThat(paths).as("player-reachable GET endpoints").contains("/players/{playerId}", "/players/{playerId}/progress");
        for (String path : paths) {
            String body = mvc.perform(get(path.replace("{playerId}", link.playerId().toString())).with(accounts.as(link.playerId())))
                .andReturn().getResponse().getContentAsString().toLowerCase();
            assertThat(body).as(path).doesNotContain("price").doesNotContain("checkout")
                .doesNotContain("upgrade").doesNotContain("subscription").doesNotContain("premium");
        }
    }
}
