-- Only these emails may sign in. Anyone else is rejected before an account is created.
create table if not exists allowed_emails (email text primary key);
alter table allowed_emails enable row level security;   -- no policies: only the trigger below (security definer) reads it
insert into allowed_emails (email) values ('cambopokerr@gmail.com') on conflict do nothing;

create or replace function handle_new_user() returns trigger language plpgsql security definer set search_path = public as $$
begin
  if not exists (select 1 from allowed_emails where lower(email) = lower(coalesce(new.email, ''))) then
    raise exception 'This email is not allowed to sign in to Cambo Poker';
  end if;
  insert into profiles (user_id, email, approved) values (new.id, coalesce(new.email, ''), true);
  return new;
end $$;

-- make sure nobody outside the list is already approved
update profiles set approved = false where lower(email) not in (select lower(email) from allowed_emails);
