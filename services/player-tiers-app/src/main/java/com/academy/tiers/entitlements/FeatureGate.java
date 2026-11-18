package com.academy.tiers.entitlements;

import com.academy.tiers.common.ApiException;
import com.academy.tiers.roster.RosterAccess;
import com.academy.tiers.security.CurrentUser;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.HttpStatus;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.method.HandlerMethod;
import org.springframework.web.servlet.HandlerInterceptor;
import org.springframework.web.servlet.HandlerMapping;
import org.springframework.web.servlet.config.annotation.InterceptorRegistry;
import org.springframework.web.servlet.config.annotation.WebMvcConfigurer;

import java.util.Map;
import java.util.UUID;

/** Enforces {@link RequiresFeature}: 403 if the caller cannot see the player, then 402 if the plan lacks the feature. */
@Configuration
public class FeatureGate implements HandlerInterceptor, WebMvcConfigurer {

    private final Entitlements entitlements;
    private final TierService tiers;
    private final RosterAccess access;

    public FeatureGate(Entitlements entitlements, TierService tiers, RosterAccess access) {
        this.entitlements = entitlements;
        this.tiers = tiers;
        this.access = access;
    }

    @Override
    public void addInterceptors(InterceptorRegistry registry) {
        registry.addInterceptor(this);
    }

    @Override
    @SuppressWarnings("unchecked")
    public boolean preHandle(HttpServletRequest request, HttpServletResponse response, Object handler) {
        if (!(handler instanceof HandlerMethod method)) return true;
        RequiresFeature required = method.getMethodAnnotation(RequiresFeature.class);
        if (required == null) return true;

        var vars = (Map<String, String>) request.getAttribute(HandlerMapping.URI_TEMPLATE_VARIABLES_ATTRIBUTE);
        String player = vars == null ? null : vars.get("playerId");
        if (player == null) throw new IllegalStateException("@RequiresFeature needs a {playerId} path variable");
        UUID playerId;
        try {
            playerId = UUID.fromString(player);
        } catch (IllegalArgumentException e) {
            throw new ApiException(HttpStatus.BAD_REQUEST, "bad_request");
        }
        if (!(SecurityContextHolder.getContext().getAuthentication() instanceof JwtAuthenticationToken token)) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_token");
        }
        if (!access.canSee(CurrentUser.of(token.getToken()), playerId)) throw ApiException.forbidden();
        if (!entitlements.has(tiers.tierOf(playerId), required.value())) {
            throw new ApiException(HttpStatus.PAYMENT_REQUIRED, "tier_required");
        }
        return true;
    }
}
