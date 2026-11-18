-- Milestone 3: messaging with parents always copied (GR-08), contact revoke (GR-09).
-- There is no thread type and no recipient column a client can set: every message
-- belongs to a player, and its recipients are computed by the server.

create table message (
    id        uuid primary key,
    player_id uuid not null references account(id),
    author_id uuid not null references account(id),
    body      text not null check (char_length(body) between 1 and 2000),
    at        timestamptz not null default now()
);
create index message_player_at on message (player_id, at);

create table message_recipient (
    message_id uuid not null references message(id),
    account_id uuid not null references account(id),
    primary key (message_id, account_id)
);

-- One weekly feed email per parent per ISO week, so a re-run of the job never resends.
create table feed_sent (
    parent_id uuid not null references account(id),
    week      text not null,
    sent_at   timestamptz not null default now(),
    primary key (parent_id, week)
);

create table contact_block (
    player_id  uuid not null references account(id),
    coach_id   uuid not null references account(id),
    blocked_by uuid not null references account(id),
    at         timestamptz not null default now(),
    primary key (player_id, coach_id)
);
