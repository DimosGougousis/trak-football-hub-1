package com.academy.tiers.identity;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.core.RowMapper;
import org.springframework.stereotype.Service;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

@Service
public class AccountService {

    private static final RowMapper<Account> ROW = (rs, i) -> new Account(
        rs.getObject("id", UUID.class), rs.getObject("academy_id", UUID.class), rs.getString("role"),
        rs.getString("email"), rs.getString("display_name"), rs.getObject("dob", LocalDate.class));

    private final JdbcTemplate jdbc;

    public AccountService(JdbcTemplate jdbc) {
        this.jdbc = jdbc;
    }

    public Optional<Account> find(UUID id) {
        return jdbc.query("select * from account where id = ?", ROW, id).stream().findFirst();
    }

    public Optional<Account> findParentByEmail(UUID academyId, String email) {
        return jdbc.query("select * from account where academy_id = ? and role = 'parent' and lower(email) = lower(?)",
            ROW, academyId, email.trim()).stream().findFirst();
    }

    public UUID create(UUID academyId, String role, String email, String displayName, LocalDate dob) {
        UUID id = UUID.randomUUID();
        jdbc.update("insert into account(id, academy_id, role, email, display_name, dob) values (?, ?, ?, ?, ?, ?)",
            id, academyId, role, email, displayName, dob);
        return id;
    }

    /** Inserts the parent unless an account with that email already exists in the academy. True if created. */
    public boolean createParentIfAbsent(UUID academyId, String email, String name) {
        return jdbc.update("""
            insert into account(id, academy_id, role, email, display_name) values (?, ?, 'parent', ?, ?)
            on conflict (academy_id, lower(email)) where email is not null do nothing
            """, UUID.randomUUID(), academyId, email.trim(), name.trim()) == 1;
    }

    public List<UUID> guardiansOf(UUID playerId) {
        return jdbc.queryForList("select parent_id from player_guardian where player_id = ? order by parent_id", UUID.class, playerId);
    }

    public boolean isGuardian(UUID parentId, UUID playerId) {
        return Boolean.TRUE.equals(jdbc.queryForObject(
            "select exists(select 1 from player_guardian where parent_id = ? and player_id = ?)", Boolean.class, parentId, playerId));
    }

    public void addGuardian(UUID playerId, UUID parentId) {
        jdbc.update("insert into player_guardian(player_id, parent_id) values (?, ?) on conflict do nothing", playerId, parentId);
    }
}
