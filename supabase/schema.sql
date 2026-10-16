-- Cambo Poker schema. Mirrors src/types.ts. Run once per project.
create extension if not exists pgcrypto;

-- People allowed into the app. First sign-up is approved automatically; approved people approve the rest.
create table if not exists profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  approved boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into profiles (user_id, email, approved)
  values (new.id, coalesce(new.email, ''), not exists (select 1 from profiles));
  return new;
end $$;
drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users for each row execute procedure handle_new_user();

create or replace function is_approved() returns boolean language sql stable security definer set search_path = public as $$
  select coalesce((select approved from profiles where user_id = auth.uid()), false)
$$;

create table if not exists settings (
  id int primary key default 1 check (id = 1),
  data jsonb not null,
  updated_at timestamptz not null default now()
);
create table if not exists players (
  id text primary key,
  name text not null,
  aliases text[] not null default '{}',
  notes text not null default '',
  is_host boolean not null default false
);
create table if not exists games (
  id text primary key,
  date date,
  original_date_text text not null default '',
  start_time text not null default '',
  finish_time text not null default '',
  duration_hours numeric,
  duration_source text,
  dealer_player_id text,
  dealer_name text not null default '',
  location text,
  notes text not null default '',
  source_text text not null default '',
  review_notes text[] not null default '{}',
  updated_at timestamptz not null default now()
);
create table if not exists attendance (
  game_id text not null references games(id) on delete cascade,
  player_id text not null references players(id) on delete cascade,
  arrival text,
  departure text,
  notes text,
  primary key (game_id, player_id)
);
create table if not exists entries (
  id text primary key,
  game_id text not null references games(id) on delete cascade,
  category text not null,
  amount numeric,
  original_text text not null default '',
  verification text not null default 'verified',
  deduct_from_rake boolean,
  dealer_name text,
  dealer_player_id text,
  notes text
);
create table if not exists distributions (
  id text primary key,
  game_id text not null references games(id) on delete cascade,
  recipient text not null,
  amount numeric,
  type text not null,
  original_text text not null default '',
  verification text not null default 'verified',
  notes text
);

alter table profiles enable row level security;
alter table settings enable row level security;
alter table players enable row level security;
alter table games enable row level security;
alter table attendance enable row level security;
alter table entries enable row level security;
alter table distributions enable row level security;

drop policy if exists "own profile" on profiles;
create policy "own profile" on profiles for select to authenticated using (user_id = auth.uid());
drop policy if exists "approved read all profiles" on profiles;
create policy "approved read all profiles" on profiles for select to authenticated using (is_approved());
drop policy if exists "approved manage profiles" on profiles;
create policy "approved manage profiles" on profiles for update to authenticated using (is_approved()) with check (is_approved());
drop policy if exists "approved delete profiles" on profiles;
create policy "approved delete profiles" on profiles for delete to authenticated using (is_approved() and user_id <> auth.uid());

do $$ declare t text; begin
  foreach t in array array['settings','players','games','attendance','entries','distributions'] loop
    execute format('drop policy if exists "approved all" on %I', t);
    execute format('create policy "approved all" on %I for all to authenticated using (is_approved()) with check (is_approved())', t);
  end loop;
end $$;

grant usage on schema public to authenticated;
grant all on all tables in schema public to authenticated;
