alter table public.expenses
add column if not exists transaction_type text not null default 'expense'
check (transaction_type in ('expense', 'income'));

update public.expenses
set transaction_type = 'expense'
where transaction_type is null;

alter table public.expenses
add column if not exists client_token text;

create unique index if not exists expenses_user_client_token_uidx
on public.expenses (user_id, client_token)
where client_token is not null;
