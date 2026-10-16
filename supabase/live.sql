-- Live game mode: game status + player buy-ins / cash-outs.
alter table games add column if not exists status text;
alter table games add column if not exists started_at timestamptz;
alter table games add column if not exists ended_at timestamptz;

create table if not exists player_transactions (
  id text primary key,
  game_id text not null references games(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  kind text not null check (kind in ('buy_in','cash_out')),
  amount numeric not null,
  at timestamptz not null default now(),
  notes text
);
alter table player_transactions enable row level security;
drop policy if exists "approved all" on player_transactions;
create policy "approved all" on player_transactions for all to authenticated using (is_approved()) with check (is_approved());
grant all on player_transactions to authenticated;
