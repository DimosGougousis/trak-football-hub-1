package com.academy.tiers.entitlements;

import org.junit.jupiter.api.Test;

import java.math.BigDecimal;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/** Tasks 4.1-4.2: entitlements.yaml matches the approved solution and cannot sell progression (GR-01). */
class EntitlementsConfigTest {

    private final Entitlements e = Entitlements.load("entitlements.yaml", Map.of());

    @Test
    void pricesAndFeaturesMatchTheApprovedSolution() {
        assertThat(e.price("basic")).isEqualByComparingTo(new BigDecimal("9.00"));
        assertThat(e.price("premium")).isEqualByComparingTo(new BigDecimal("29.99"));
        assertThat(e.has("basic", "skill_tree")).isTrue();
        assertThat(e.has("basic", "wearable_sync")).isFalse();
        assertThat(e.has("basic", "video_library")).isFalse();
        assertThat(e.has("premium", "wearable_sync")).isTrue();
        assertThat(e.has("premium", "video_library")).isTrue();
    }

    @Test
    void premiumHasEveryBasicFeature() {
        assertThat(e.features("premium")).containsAll(e.features("basic"));
    }

    @Test
    void configThatLetsAPlanWriteProgressionIsRejected() {
        assertThatThrownBy(() -> Entitlements.parse("""
            plans: { basic: { price_eur: 9.00, features: [skill_tree] } }
            rules: { progression_write_by_entitlement: true }
            """, Map.of())).isInstanceOf(InvalidEntitlementsException.class);
    }

    @Test
    void configWithoutTheProgressionRuleIsRejected() {
        assertThatThrownBy(() -> Entitlements.parse("plans: { basic: { price_eur: 9.00, features: [skill_tree] } }", Map.of()))
            .isInstanceOf(InvalidEntitlementsException.class);
    }

    @Test
    void aFlagSwitchedOffRemovesTheFeatureFromPremium() {
        var off = Entitlements.load("entitlements.yaml", Map.of("wearable_sync", false));
        assertThat(off.has("premium", "wearable_sync")).isFalse();
        assertThat(off.has("premium", "video_library")).isTrue();
        assertThat(off.degraded("premium")).containsExactly("wearable_sync");
    }

    @Test
    void unknownPlanHasNoFeatures() {
        assertThat(e.has("gold", "skill_tree")).isFalse();
    }
}
