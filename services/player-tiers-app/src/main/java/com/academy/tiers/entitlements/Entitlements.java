package com.academy.tiers.entitlements;

import org.yaml.snakeyaml.LoaderOptions;
import org.yaml.snakeyaml.Yaml;
import org.yaml.snakeyaml.constructor.SafeConstructor;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.*;

/**
 * Which features each plan includes, after feature flags. Loaded from
 * {@code entitlements.yaml}; flag overrides come from {@code tiers.flags.*}.
 * Refuses any configuration that does not declare
 * {@code rules.progression_write_by_entitlement: false} (GR-01, ADR-002).
 */
public final class Entitlements {

    private final Map<String, BigDecimal> prices;
    private final Map<String, Set<String>> planFeatures;
    private final Map<String, Boolean> flags;

    private Entitlements(Map<String, BigDecimal> prices, Map<String, Set<String>> planFeatures, Map<String, Boolean> flags) {
        this.prices = prices;
        this.planFeatures = planFeatures;
        this.flags = flags;
    }

    public static Entitlements load(String classpathResource, Map<String, Boolean> flagOverrides) {
        try (InputStream in = Entitlements.class.getClassLoader().getResourceAsStream(classpathResource)) {
            if (in == null) throw new InvalidEntitlementsException("missing " + classpathResource);
            return parse(new String(in.readAllBytes(), StandardCharsets.UTF_8), flagOverrides);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        }
    }

    @SuppressWarnings("unchecked")
    public static Entitlements parse(String yamlText, Map<String, Boolean> flagOverrides) {
        Map<String, Object> root = new Yaml(new SafeConstructor(new LoaderOptions())).load(yamlText);
        if (root == null) throw new InvalidEntitlementsException("empty entitlements");
        Map<String, Object> rules = (Map<String, Object>) root.getOrDefault("rules", Map.of());
        if (!Boolean.FALSE.equals(rules.get("progression_write_by_entitlement"))) {
            throw new InvalidEntitlementsException("rules.progression_write_by_entitlement must be false (ADR-002)");
        }
        Map<String, BigDecimal> prices = new TreeMap<>();
        Map<String, Set<String>> features = new TreeMap<>();
        Map<String, Object> plans = (Map<String, Object>) root.getOrDefault("plans", Map.of());
        if (plans.isEmpty()) throw new InvalidEntitlementsException("no plans");
        plans.forEach((name, value) -> {
            Map<String, Object> plan = (Map<String, Object>) value;
            prices.put(name, new BigDecimal(String.valueOf(plan.get("price_eur"))));
            features.put(name, Set.copyOf((List<String>) plan.getOrDefault("features", List.of())));
        });
        Map<String, Boolean> flags = new TreeMap<>();
        ((Map<String, Object>) root.getOrDefault("flags", Map.of())).forEach((name, value) ->
            flags.put(name, Boolean.TRUE.equals(((Map<String, Object>) value).get("enabled"))));
        flagOverrides.forEach(flags::put);
        return new Entitlements(Map.copyOf(prices), Map.copyOf(features), Map.copyOf(flags));
    }

    public boolean isPlan(String plan) { return prices.containsKey(plan); }

    /** Display price for the parent account only (ADR-003). */
    public BigDecimal price(String plan) {
        BigDecimal p = prices.get(plan);
        if (p == null) throw new IllegalArgumentException("unknown plan " + plan);
        return p;
    }

    /** A feature with a flag counts only while its flag is on. */
    public boolean has(String plan, String feature) {
        return planFeatures.getOrDefault(plan, Set.of()).contains(feature) && flags.getOrDefault(feature, true);
    }

    public Set<String> features(String plan) {
        Set<String> out = new TreeSet<>();
        for (String f : planFeatures.getOrDefault(plan, Set.of())) if (has(plan, f)) out.add(f);
        return out;
    }

    /** Features the plan includes but that are switched off right now. */
    public List<String> degraded(String plan) {
        return planFeatures.getOrDefault(plan, Set.of()).stream().filter(f -> !has(plan, f)).sorted().toList();
    }
}
