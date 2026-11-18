package com.academy.tiers.progression;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * GR-02: one daily XP cap, identical on every tier. Drills older than
 * {@code maxBackdateHours} are refused so XP, streaks and the weekly metric
 * cannot be backfilled.
 */
@ConfigurationProperties("tiers.xp")
public record XpProperties(int dailyCap, int perDrill, int maxBackdateHours) {}
