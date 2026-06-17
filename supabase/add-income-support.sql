alter table public.expenses
add column if not exists transaction_type text not null default 'expense'
check (transaction_type in ('expense', 'income'));

update public.expenses
set transaction_type = 'expense'
where transaction_type is null;

alter table public.expenses
add column if not exists client_token text;

alter table public.expenses
add column if not exists expense_kind text
check (expense_kind in ('fixed', 'variable'));

update public.expenses
set expense_kind = case when recurrence = 'monthly' then 'fixed' else 'variable' end
where transaction_type = 'expense' and expense_kind is null;

create unique index if not exists expenses_user_client_token_uidx
on public.expenses (user_id, client_token)
where client_token is not null;

create index if not exists expenses_user_kind_idx
on public.expenses (user_id, expense_kind);
