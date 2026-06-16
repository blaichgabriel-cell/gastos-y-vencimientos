alter table public.expenses
add column if not exists transaction_type text not null default 'expense'
check (transaction_type in ('expense', 'income'));

update public.expenses
set transaction_type = 'expense'
where transaction_type is null;
