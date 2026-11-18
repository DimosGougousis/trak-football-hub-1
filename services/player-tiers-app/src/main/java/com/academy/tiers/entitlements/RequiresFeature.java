package com.academy.tiers.entitlements;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

/**
 * Marks an endpoint under {@code /players/{playerId}/...} as needing a plan feature.
 * The caller must first be allowed to see the player (403 otherwise); then the
 * player's plan must include the feature with its flag on (402 tier_required).
 */
@Target(ElementType.METHOD)
@Retention(RetentionPolicy.RUNTIME)
public @interface RequiresFeature {
    String value();
}
