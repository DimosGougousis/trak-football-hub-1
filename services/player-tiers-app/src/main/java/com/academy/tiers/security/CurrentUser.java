package com.academy.tiers.security;

import com.academy.tiers.common.ApiException;
import org.springframework.http.HttpStatus;
import org.springframework.security.oauth2.jwt.Jwt;

import java.util.UUID;

/** The authenticated caller, read from the token's claims. */
public record CurrentUser(UUID id, UUID academyId, String role) {

    /** A token missing any of sub, academy or role is treated as unauthenticated (401), never as a server error. */
    public static CurrentUser of(Jwt jwt) {
        try {
            String role = jwt.getClaimAsString("role");
            if (role == null) throw new IllegalArgumentException("role");
            return new CurrentUser(UUID.fromString(jwt.getSubject()), UUID.fromString(jwt.getClaimAsString("academy")), role);
        } catch (RuntimeException e) {
            throw new ApiException(HttpStatus.UNAUTHORIZED, "invalid_token");
        }
    }

    public boolean is(String r) { return r.equals(role); }

    /** The caller must be an admin of this academy. */
    public void requireAdminOf(UUID academy) {
        if (!is("admin") || !academyId.equals(academy)) throw ApiException.forbidden();
    }
}
