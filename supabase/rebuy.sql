alter table player_transactions drop constraint if exists player_transactions_kind_check;
alter table player_transactions add constraint player_transactions_kind_check check (kind in ('buy_in','rebuy','cash_out'));
