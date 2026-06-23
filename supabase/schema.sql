create extension if not exists "pgcrypto";

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  transaction_type text not null default 'expense' check (transaction_type in ('expense', 'income')),
  expense_kind text check (expense_kind in ('fixed', 'variable')),
  movement_kind text not null default 'normal' check (movement_kind in ('normal', 'card_payment')),
  account_id uuid,
  payment_target_account_id uuid,
  client_token text,
  category text not null,
  due_date date not null,
  status text not null default 'pending' check (status in ('pending', 'due_today', 'upcoming', 'overdue', 'paid')),
  recurrence text not null default 'none' check (recurrence in ('none', 'monthly')),
  notes text,
  paid_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.financial_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  institution text,
  account_type text not null check (account_type in ('bank', 'cash', 'savings', 'investment', 'receivable', 'credit_card', 'debt')),
  balance numeric(12, 2) not null default 0,
  credit_limit numeric(12, 2) not null default 0,
  credit_used numeric(12, 2) not null default 0,
  statement_day int check (statement_day is null or (statement_day >= 1 and statement_day <= 31)),
  due_day int check (due_day is null or (due_day >= 1 and due_day <= 31)),
  receivable_due_date date,
  settled_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses
add column if not exists transaction_type text not null default 'expense'
check (transaction_type in ('expense', 'income'));

alter table public.expenses
add column if not exists client_token text;

alter table public.expenses
add column if not exists expense_kind text
check (expense_kind in ('fixed', 'variable'));

alter table public.expenses
add column if not exists movement_kind text not null default 'normal'
check (movement_kind in ('normal', 'card_payment'));

alter table public.expenses
add column if not exists account_id uuid references public.financial_accounts(id) on delete set null;

alter table public.expenses
add column if not exists payment_target_account_id uuid references public.financial_accounts(id) on delete set null;

alter table public.financial_accounts
add column if not exists receivable_due_date date;

alter table public.financial_accounts
add column if not exists settled_at timestamptz;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_account_id_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
    add constraint expenses_account_id_fkey
    foreign key (account_id) references public.financial_accounts(id) on delete set null not valid;
  end if;

  if not exists (
    select 1 from pg_constraint
    where conname = 'expenses_payment_target_account_id_fkey'
      and conrelid = 'public.expenses'::regclass
  ) then
    alter table public.expenses
    add constraint expenses_payment_target_account_id_fkey
    foreign key (payment_target_account_id) references public.financial_accounts(id) on delete set null not valid;
  end if;
end $$;

alter table public.financial_accounts
drop constraint if exists financial_accounts_account_type_check;

alter table public.financial_accounts
add constraint financial_accounts_account_type_check
check (account_type in ('bank', 'cash', 'savings', 'investment', 'receivable', 'credit_card', 'debt'));

update public.expenses
set expense_kind = case when recurrence = 'monthly' then 'fixed' else 'variable' end
where transaction_type = 'expense' and expense_kind is null;

create table if not exists public.push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses enable row level security;
alter table public.financial_accounts enable row level security;
alter table public.push_subscriptions enable row level security;

drop policy if exists "Users can select own expenses" on public.expenses;
create policy "Users can select own expenses"
on public.expenses for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own expenses" on public.expenses;
create policy "Users can insert own expenses"
on public.expenses for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own expenses" on public.expenses;
create policy "Users can update own expenses"
on public.expenses for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own expenses" on public.expenses;
create policy "Users can delete own expenses"
on public.expenses for delete
using (auth.uid() = user_id);

drop policy if exists "Users can select own financial accounts" on public.financial_accounts;
create policy "Users can select own financial accounts"
on public.financial_accounts for select
using (auth.uid() = user_id);

drop policy if exists "Users can insert own financial accounts" on public.financial_accounts;
create policy "Users can insert own financial accounts"
on public.financial_accounts for insert
with check (auth.uid() = user_id);

drop policy if exists "Users can update own financial accounts" on public.financial_accounts;
create policy "Users can update own financial accounts"
on public.financial_accounts for update
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

drop policy if exists "Users can delete own financial accounts" on public.financial_accounts;
create policy "Users can delete own financial accounts"
on public.financial_accounts for delete
using (auth.uid() = user_id);

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
on public.push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create or replace function public.ensure_expense_accounts_belong_to_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.account_id is not null and not exists (
    select 1 from public.financial_accounts
    where id = new.account_id and user_id = new.user_id
  ) then
    raise exception 'La cuenta origen no pertenece al usuario.';
  end if;

  if new.payment_target_account_id is not null and not exists (
    select 1 from public.financial_accounts
    where id = new.payment_target_account_id and user_id = new.user_id
  ) then
    raise exception 'La cuenta destino no pertenece al usuario.';
  end if;

  return new;
end;
$$;

drop trigger if exists ensure_expense_accounts_belong_to_user_trigger on public.expenses;
create trigger ensure_expense_accounts_belong_to_user_trigger
before insert or update of user_id, account_id, payment_target_account_id
on public.expenses
for each row
execute function public.ensure_expense_accounts_belong_to_user();

create index if not exists expenses_user_due_date_idx on public.expenses (user_id, due_date);
create index if not exists expenses_user_category_idx on public.expenses (user_id, category);
create index if not exists expenses_user_kind_idx on public.expenses (user_id, expense_kind);
create index if not exists expenses_user_account_idx on public.expenses (user_id, account_id);
create index if not exists financial_accounts_user_type_idx on public.financial_accounts (user_id, account_type);
create unique index if not exists expenses_user_client_token_uidx
on public.expenses (user_id, client_token)
where client_token is not null;
