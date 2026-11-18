-- Milestone 2: Player Card attributes, coach-signed tests, drills and XP, analytics events.
-- Only PlayerAttributeWriter writes player_attribute (ADR-002; ArchitectureTest enforces it).

create table player_attribute (
    player_id  uuid not null references account(id),
    name       text not null check (name in ('pace', 'dribbling', 'tactical_awareness')),
    value       int  not null check (value between 0 and 99),
    measured_at timestamptz not null,          -- signed_at of the test that set it; an older test never overwrites a newer one
    updated_at  timestamptz not null default now(),
    primary key (player_id, name)
);

create table test_result (
    id        uuid primary key,
    player_id uuid not null references account(id),
    coach_id  uuid not null references account(id),
    test_type text not null,
    results   jsonb not null,
    signed_at timestamptz not null
);

create table drill_log (
    player_id    uuid not null references account(id),
    drill_id     text not null,
    day          date not null,
    completed_at timestamptz not null,
    xp           int  not null check (xp >= 0),
    primary key (player_id, drill_id, day)
);

create table analytics_event (
    id        bigserial primary key,
    type      text not null,
    player_id uuid not null,
    at        timestamptz not null default now(),
    payload   jsonb not null default '{}'::jsonb
);
create index analytics_event_type_at on analytics_event (type, at);
