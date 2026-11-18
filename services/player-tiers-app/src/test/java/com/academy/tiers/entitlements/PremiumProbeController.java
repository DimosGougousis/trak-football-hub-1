package com.academy.tiers.entitlements;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/** Test-only endpoint guarded by a Premium feature, so the 402 gate is tested before Milestone 5 adds real ones. */
@RestController
class PremiumProbeController {

    @RequiresFeature("wearable_sync")
    @GetMapping("/players/{playerId}/premium-probe")
    Map<String, Object> probe(@PathVariable UUID playerId) {
        return Map.of("ok", true);
    }
}
