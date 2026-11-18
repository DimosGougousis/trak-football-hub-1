package com.academy.tiers.audit;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.util.Map;
import java.util.UUID;

/** Append-only record of safeguarding-relevant actions: links, consent, attribute changes, messages. */
@Service
public class AuditService {

    private final JdbcTemplate jdbc;
    private final ObjectMapper json;

    public AuditService(JdbcTemplate jdbc, ObjectMapper json) {
        this.jdbc = jdbc;
        this.json = json;
    }

    public void record(UUID actor, String action, UUID subject, Map<String, ?> detail) {
        try {
            jdbc.update("insert into audit_log(actor_id, action, subject_id, detail) values (?, ?, ?, ?::jsonb)",
                actor, action, subject, json.writeValueAsString(detail));
        } catch (JsonProcessingException e) {
            throw new IllegalStateException("audit detail is not serialisable", e);
        }
    }
}
