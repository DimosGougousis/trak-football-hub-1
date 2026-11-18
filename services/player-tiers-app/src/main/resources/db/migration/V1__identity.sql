-- Milestone 1: identity, coach verification, rosters, guardians, audit.
-- No player footage, payment data or health data lives in these tables.

create table academy (
    id   uuid primary key,
    name text not null
);

create table account (
    id           uuid primary key,
    academy_id   uuid not null references academy(id),
    role         text not null check (role in ('player', 'parent', 'coach', 'admin')),
    email        text,
    display_name text not null,
    dob          date,
    created_at   timestamptz not null default now()
);
-- Parents are onboarded by the academy and found by email (OQ-8).
create unique index account_academy_email on account (academy_id, lower(email)) where email is not null;

create table coach_verification (
    coach_id   uuid primary key references account(id),
    type       text not null check (type in ('GR_CRIMINAL_RECORD', 'DBS', 'US_BG')),
    reference  text not null,
    expires_on date not null
);

-- One default roster per coach, created when the academy adds the coach.
create table roster (
    id         uuid primary key,
    academy_id uuid not null references academy(id),
    coach_id   uuid not null references account(id),
    name       text not null
);

-- A player's parents or guardians. Every coach message copies all of them (REQ-003).
create table player_guardian (
    player_id uuid not null references account(id),
    parent_id uuid not null references account(id),
    primary key (player_id, parent_id)
);

create table roster_link (
    player_id           uuid not null references account(id),
    coach_id            uuid not null references account(id),
    roster_id           uuid not null references roster(id),
    academy_consent_ref text,
    status              text not null check (status in ('active', 'revoked')),
    created_at          timestamptz not null default now(),
    primary key (player_id, coach_id)
);

create table audit_log (
    id         bigserial primary key,
    at         timestamptz not null default now(),
    actor_id   uuid not null,
    action     text not null,
    subject_id uuid not null,
    detail     jsonb not null default '{}'::jsonb
);
