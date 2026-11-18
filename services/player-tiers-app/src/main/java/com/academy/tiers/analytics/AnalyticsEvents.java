package com.academy.tiers.analytics;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

/** Product analytics events: drill_logged, test_signed. They feed weekly-active-players and the parent feed. */
@Component
public class AnalyticsEvents {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AnalyticsEvents(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void emit(String type, UUID playerId, Map<String, ?> payload) {
        try {
            jdbc.update("insert into analytics_event(type, player_id, payload) values (?, ?, ?::jsonb)",
                type, playerId, json.writeValueAsString(payload));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException(e);
        }
    }
}
