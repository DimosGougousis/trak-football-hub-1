package com.academy.tiers;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;

import static org.assertj.core.api.Assertions.assertThat;

/** Task 1.1: the app starts against a real Postgres and Flyway has applied V1. */
class SkeletonTest extends IntegrationTestBase {

    @Autowired JdbcTemplate jdbc;

    @Test
    void flywayCreatesTheIdentityTables() {
        Integer n = jdbc.queryForObject(
            "select count(*) from information_schema.tables where table_name in " +
            "('academy','account','coach_verification','roster','roster_link','player_guardian','audit_log')",
            Integer.class);
        assertThat(n).isEqualTo(7);
    }
}
