package com.academy.tiers.billing;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;

import java.time.Instant;
import java.util.UUID;

/**
 * The fields the app needs from a Stripe event. Parsed from the raw JSON after the
 * signature is verified, so it does not depend on the SDK's object model or API
 * version. {@code created} orders events (Stripe retries out of order); {@code priceId}
 * decides the tier, because it is what Stripe charges.
 */
public record WebhookEvent(String id, String type, Instant created, boolean livemode, String status,
                           UUID playerId, UUID parentId, String priceId,
                           String subscriptionId, String customerId, Instant currentPeriodEnd) {

    public boolean isSubscriptionEvent() {
        return type != null && type.startsWith("customer.subscription.");
    }

    public static WebhookEvent fromStripeJson(String payload, ObjectMapper json) {
        try {
            JsonNode root = json.readTree(payload);
            JsonNode obj = root.path("data").path("object");
            JsonNode meta = obj.path("metadata");
            JsonNode item = obj.path("items").path("data").path(0);
            JsonNode end = obj.path("current_period_end");
            if (!end.isNumber()) end = item.path("current_period_end");
            JsonNode created = root.path("created");
            return new WebhookEvent(
                text(root, "id"), text(root, "type"),
                created.isNumber() ? Instant.ofEpochSecond(created.asLong()) : null,
                root.path("livemode").asBoolean(false),
                text(obj, "status"),
                uuid(text(meta, "player_id")), uuid(text(meta, "parent_id")),
                text(item.path("price"), "id"),
                text(obj, "id"), text(obj, "customer"),
                end.isNumber() ? Instant.ofEpochSecond(end.asLong()) : null);
        } catch (Exception e) {
            throw new IllegalArgumentException("malformed Stripe event", e);
        }
    }

    private static String text(JsonNode n, String field) {
        JsonNode v = n.path(field);
        return v.isTextual() ? v.asText() : null;
    }

    private static UUID uuid(String s) {
        try {
            return s == null ? null : UUID.fromString(s);
        } catch (IllegalArgumentException e) {
            return null;
        }
    }
}
