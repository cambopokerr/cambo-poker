-- Hours each host dealt (null = alternated, half each).
alter table games add column if not exists dealing_hours jsonb;
