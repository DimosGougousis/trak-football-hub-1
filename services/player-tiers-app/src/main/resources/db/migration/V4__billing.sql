-- Milestone 4: subscriptions (one per player, paid by a parent), Stripe event
-- idempotency, coach Skill Tree sign-off, and the one-time upgrade prompt.
-- No card or bank data is stored: Stripe holds it, and this keeps only ids and status.

create table player_subscription (
    player_id              uuid primary key references account(id),
    payer_parent_id        uuid not null references account(id),
    tier                   text not null check (tier in ('basic', 'premium')),
    status                 text not null,
    stripe_customer_id     text,
    stripe_subscription_id text,
    current_period_end     timestamptz,
    last_event_created     timestamptz,   -- Stripe 'created' of the last event applied; older events are skipped
    updated_at             timestamptz not null default now()
);

create table stripe_event (
    id          text primary key,
    type        text not null,
    received_at timestamptz not null default now()
);

-- CP-03: a coach signs off a Skill Tree node. Earns a milestone, never attributes (ADR-002).
create table skill_tree_completion (
    player_id    uuid not null references account(id),
    node         text not null check (node ~ '^[a-z0-9]+(-[a-z0-9]+)*$' and char_length(node) <= 40),
    coach_id     uuid not null references account(id),
    completed_at timestamptz not null default now(),
    primary key (player_id, node)
);

-- REQ-005: one upgrade prompt per parent per player, sent to the parent only.
create table upgrade_prompt (
    player_id uuid not null references account(id),
    parent_id uuid not null references account(id),
    sent_at   timestamptz not null default now(),
    primary key (player_id, parent_id)
);

-- A child never has an email address, so no prompt, nudge or receipt can reach a
-- player by email (ADR-003). Parents receive everything.
alter table account add constraint player_has_no_email check (role <> 'player' or email is null);
