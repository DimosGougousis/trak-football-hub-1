package com.academy.tiers.roster;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * The age at which a player can be onboarded without the academy's consent
 * reference. Null means "not configured", and onboarding then fails closed.
 * Greece: 15 (Law 4624/2019, Art. 21; GDPR Art. 8).
 */
@ConfigurationProperties("tiers.consent")
public record ConsentProperties(Integer minAgeWithoutVerifiedConsent) {}
