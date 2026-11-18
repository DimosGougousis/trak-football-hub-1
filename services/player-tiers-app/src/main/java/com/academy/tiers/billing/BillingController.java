package com.academy.tiers.billing;

import com.academy.tiers.common.ApiException;
import com.academy.tiers.entitlements.Entitlements;
import com.academy.tiers.entitlements.TierService;
import com.academy.tiers.identity.Account;
import com.academy.tiers.identity.AccountService;
import com.academy.tiers.security.CurrentUser;
import org.springframework.http.HttpStatus;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.*;

import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** ADR-003: prices, checkout and subscription state exist only for the parent account. */
@RestController
public class BillingController {

    record CheckoutBody(UUID playerId, String tier) {}

    private final StripeGateway stripe;
    private final Entitlements entitlements;
    private final TierService tiers;
    private final AccountService accounts;
    private final JdbcTemplate jdbc;

    public BillingController(StripeGateway stripe, Entitlements entitlements, TierService tiers,
                             AccountService accounts, JdbcTemplate jdbc) {
        this.stripe = stripe;
        this.entitlements = entitlements;
        this.tiers = tiers;
        this.accounts = accounts;
        this.jdbc = jdbc;
    }

    private static CurrentUser parentOnly(Jwt jwt) {
        var caller = CurrentUser.of(jwt);
        if (!caller.is("parent")) throw ApiException.forbidden();
        return caller;
    }

    @PostMapping("/billing/checkout")
    Map<String, Object> checkout(@AuthenticationPrincipal Jwt jwt, @RequestBody CheckoutBody body) {
        var caller = parentOnly(jwt);
        if (body.playerId() == null || !accounts.isGuardian(caller.id(), body.playerId())) throw ApiException.forbidden();
        if (body.tier() == null || !entitlements.isPlan(body.tier())) throw ApiException.unprocessable("unknown_tier");
        if (tiers.hasPaidSubscription(body.playerId())) throw new ApiException(HttpStatus.CONFLICT, "already_subscribed");
        String email = accounts.find(caller.id()).map(Account::email).orElseThrow(ApiException::forbidden);
        try {
            String url = stripe.createCheckout(new StripeGateway.CheckoutRequest(
                caller.id(), email, body.playerId(), body.tier(), entitlements.price(body.tier())));
            return Map.of("checkout_url", url);
        } catch (StripeGateway.NotConfiguredException e) {
            throw new ApiException(HttpStatus.SERVICE_UNAVAILABLE, "billing_not_configured");
        } catch (StripeGateway.BillingUnavailableException e) {
            throw new ApiException(HttpStatus.BAD_GATEWAY, "billing_unavailable");
        }
    }

    @GetMapping("/billing/subscriptions")
    List<Map<String, Object>> subscriptions(@AuthenticationPrincipal Jwt jwt) {
        var caller = parentOnly(jwt);
        return jdbc.query("""
                select a.id, a.display_name from player_guardian g join account a on a.id = g.player_id
                where g.parent_id = ? order by a.display_name, a.id
                """,
            (rs, i) -> {
                UUID playerId = rs.getObject("id", UUID.class);
                String tier = tiers.tierOf(playerId);
                Map<String, Object> row = new LinkedHashMap<>();
                row.put("player_id", playerId);
                row.put("display_name", rs.getString("display_name"));
                row.put("tier", tier);
                row.put("basic_price_eur", entitlements.price("basic"));
                row.put("premium_price_eur", entitlements.price("premium"));
                row.put("degraded", entitlements.degraded(tier));
                return row;
            }, caller.id());
    }
}
