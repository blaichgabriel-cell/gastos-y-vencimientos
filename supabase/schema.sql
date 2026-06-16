create extension if not exists "pgcrypto";

create table if not exists public.expenses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  title text not null,
  amount numeric(12, 2) not null check (amount > 0),
  transaction_type text not null default 'expense' check (transaction_type in ('expense', 'income')),
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

alter table public.expenses
add column if not exists transaction_type text not null default 'expense'
check (transaction_type in ('expense', 'income'));

alter table public.expenses
add column if not exists client_token text;

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

drop policy if exists "Users can manage own push subscriptions" on public.push_subscriptions;
create policy "Users can manage own push subscriptions"
on public.push_subscriptions for all
using (auth.uid() = user_id)
with check (auth.uid() = user_id);

create index if not exists expenses_user_due_date_idx on public.expenses (user_id, due_date);
create index if not exists expenses_user_category_idx on public.expenses (user_id, category);
create unique index if not exists expenses_user_client_token_uidx
on public.expenses (user_id, client_token)
where client_token is not null;
