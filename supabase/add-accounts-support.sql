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
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.expenses
add column if not exists movement_kind text not null default 'normal'
check (movement_kind in ('normal', 'card_payment'));

alter table public.expenses
add column if not exists account_id uuid references public.financial_accounts(id) on delete set null;

alter table public.expenses
add column if not exists payment_target_account_id uuid references public.financial_accounts(id) on delete set null;

alter table public.financial_accounts
drop constraint if exists financial_accounts_account_type_check;

alter table public.financial_accounts
add constraint financial_accounts_account_type_check
check (account_type in ('bank', 'cash', 'savings', 'investment', 'receivable', 'credit_card', 'debt'));

alter table public.financial_accounts enable row level security;

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

create index if not exists expenses_user_account_idx
on public.expenses (user_id, account_id);

create index if not exists financial_accounts_user_type_idx
on public.financial_accounts (user_id, account_type);
