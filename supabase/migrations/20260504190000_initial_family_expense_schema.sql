create extension if not exists pgcrypto;

create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create table if not exists public.currencies (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  symbol text not null default '$',
  decimal_separator text not null default ',',
  thousand_separator text not null default '.',
  decimal_places integer not null default 2,
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text,
  avatar_url text,
  locale text not null default 'es-AR',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.families (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  default_currency_id uuid references public.currencies(id),
  timezone text not null default 'America/Argentina/Buenos_Aires',
  month_start_day integer not null default 1 check (month_start_day between 1 and 28),
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.family_members (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null default 'owner' check (role in ('owner', 'admin', 'member', 'viewer')),
  is_active boolean not null default true,
  joined_at timestamptz not null default now(),
  unique (family_id, user_id)
);

create table if not exists public.user_settings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null unique references auth.users(id) on delete cascade,
  default_currency_id uuid references public.currencies(id),
  monthly_savings_target numeric(14,2) not null default 0 check (monthly_savings_target >= 0),
  annual_savings_target numeric(14,2) not null default 0 check (annual_savings_target >= 0),
  initial_balance numeric(14,2) not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.groups (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  name text not null,
  description text,
  color text not null default '#2563eb',
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.categories (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  name text not null,
  type text not null check (type in ('expense', 'income')),
  color text not null default '#2563eb',
  icon text,
  parent_id uuid references public.categories(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (parent_id is null or parent_id <> id)
);

create table if not exists public.credit_cards (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  owner_user_id uuid references auth.users(id) on delete set null,
  name text not null,
  last_four text check (last_four is null or last_four ~ '^[0-9]{4}$'),
  brand text,
  credit_limit numeric(14,2) check (credit_limit is null or credit_limit >= 0),
  closing_day integer check (closing_day is null or closing_day between 1 and 31),
  due_day integer check (due_day is null or due_day between 1 and 31),
  currency_id uuid references public.currencies(id),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.credit_card_purchases (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  description text not null,
  total_amount numeric(14,2) not null check (total_amount > 0),
  installment_amount numeric(14,2) not null check (installment_amount > 0),
  total_installments integer not null check (total_installments >= 1),
  current_installment integer not null default 1 check (current_installment >= 1),
  start_date date not null,
  category_id uuid references public.categories(id) on delete set null,
  currency_id uuid references public.currencies(id),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (current_installment <= total_installments)
);

create table if not exists public.transactions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  budgeted_amount numeric(14,2) check (budgeted_amount is null or budgeted_amount >= 0),
  currency_id uuid references public.currencies(id),
  category_id uuid references public.categories(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  transaction_date date not null,
  type text not null check (type in ('expense', 'income')),
  is_recurring boolean not null default false,
  payment_method text check (payment_method is null or payment_method in ('cash', 'debit', 'credit', 'transfer')),
  credit_card_id uuid references public.credit_cards(id) on delete set null,
  credit_card_purchase_id uuid references public.credit_card_purchases(id) on delete set null,
  installment_number integer,
  notes text,
  metadata jsonb not null default '{}'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (type = 'expense' or credit_card_id is null)
);

create table if not exists public.budgets (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  category_id uuid references public.categories(id) on delete cascade,
  group_id uuid references public.groups(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  budgeted_amount numeric(14,2) not null check (budgeted_amount >= 0),
  currency_id uuid references public.currencies(id),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (category_id is not null or group_id is not null)
);

create table if not exists public.investments (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  type text not null check (type in ('plazo_fijo', 'acciones', 'crypto', 'fci', 'bonos', 'otros')),
  initial_amount numeric(14,2) not null check (initial_amount >= 0),
  current_value numeric(14,2) not null check (current_value >= 0),
  currency_id uuid references public.currencies(id),
  start_date date not null,
  end_date date,
  interest_rate numeric(8,4),
  institution text,
  ticker text,
  quantity numeric(18,8),
  notes text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

create table if not exists public.savings_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  created_by uuid references auth.users(id) on delete set null,
  name text not null,
  target_amount numeric(14,2) not null check (target_amount > 0),
  current_amount numeric(14,2) not null default 0 check (current_amount >= 0),
  currency_id uuid references public.currencies(id),
  target_date date,
  monthly_target numeric(14,2) check (monthly_target is null or monthly_target >= 0),
  is_completed boolean not null default false,
  completed_at timestamptz,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.savings_movements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  goal_id uuid references public.savings_goals(id) on delete cascade,
  movement_date date not null default current_date,
  type text not null check (type in ('deposit', 'withdrawal', 'adjustment', 'interest')),
  amount numeric(14,2) not null check (amount > 0),
  currency_id uuid references public.currencies(id),
  description text,
  source_transaction_id uuid references public.transactions(id) on delete set null,
  created_at timestamptz not null default now()
);

create table if not exists public.monthly_savings (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  month integer not null check (month between 1 and 12),
  year integer not null check (year between 2000 and 2100),
  total_income numeric(14,2) not null default 0,
  total_expenses numeric(14,2) not null default 0,
  savings_amount numeric(14,2) not null default 0,
  currency_id uuid references public.currencies(id),
  created_at timestamptz not null default now()
);

create table if not exists public.exchange_rates (
  id uuid primary key default gen_random_uuid(),
  from_currency_id uuid not null references public.currencies(id) on delete cascade,
  to_currency_id uuid not null references public.currencies(id) on delete cascade,
  rate numeric(18,8) not null check (rate > 0),
  date date not null,
  source text,
  created_at timestamptz not null default now(),
  unique (from_currency_id, to_currency_id, date)
);

alter table public.currencies add column if not exists decimal_places integer not null default 2;
alter table public.currencies add column if not exists is_active boolean not null default true;
alter table public.currencies add column if not exists created_at timestamptz not null default now();

alter table public.groups add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.groups add column if not exists sort_order integer not null default 0;
alter table public.groups add column if not exists archived_at timestamptz;
alter table public.groups add column if not exists updated_at timestamptz not null default now();

alter table public.categories add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.categories add column if not exists sort_order integer not null default 0;
alter table public.categories add column if not exists is_active boolean not null default true;
alter table public.categories add column if not exists archived_at timestamptz;
alter table public.categories add column if not exists updated_at timestamptz not null default now();

alter table public.credit_cards add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.credit_cards add column if not exists owner_user_id uuid references auth.users(id) on delete set null;
alter table public.credit_cards add column if not exists notes text;
alter table public.credit_cards add column if not exists updated_at timestamptz not null default now();

alter table public.credit_card_purchases add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.credit_card_purchases add column if not exists currency_id uuid references public.currencies(id);
alter table public.credit_card_purchases add column if not exists notes text;
alter table public.credit_card_purchases add column if not exists updated_at timestamptz not null default now();

alter table public.transactions add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.transactions add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.transactions add column if not exists credit_card_purchase_id uuid references public.credit_card_purchases(id) on delete set null;
alter table public.transactions add column if not exists installment_number integer;
alter table public.transactions add column if not exists metadata jsonb not null default '{}'::jsonb;
alter table public.transactions add column if not exists archived_at timestamptz;
alter table public.transactions add column if not exists updated_at timestamptz not null default now();

alter table public.budgets add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.budgets add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.budgets add column if not exists notes text;
alter table public.budgets add column if not exists updated_at timestamptz not null default now();

alter table public.investments add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.investments add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.investments add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.investments add column if not exists institution text;
alter table public.investments add column if not exists ticker text;
alter table public.investments add column if not exists quantity numeric(18,8);
alter table public.investments add column if not exists updated_at timestamptz not null default now();

alter table public.savings_goals add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.savings_goals add column if not exists family_id uuid references public.families(id) on delete cascade;
alter table public.savings_goals add column if not exists created_by uuid references auth.users(id) on delete set null;
alter table public.savings_goals add column if not exists completed_at timestamptz;
alter table public.savings_goals add column if not exists notes text;
alter table public.savings_goals add column if not exists updated_at timestamptz not null default now();

alter table public.savings_movements add column if not exists family_id uuid references public.families(id) on delete cascade;

alter table public.monthly_savings add column if not exists user_id uuid references auth.users(id) on delete cascade;
alter table public.monthly_savings add column if not exists family_id uuid references public.families(id) on delete cascade;

alter table public.exchange_rates add column if not exists source text;

create index if not exists idx_groups_user_name on public.groups(user_id, name) where archived_at is null;
create index if not exists idx_categories_user_type on public.categories(user_id, type, name) where archived_at is null;
create index if not exists idx_transactions_user_date on public.transactions(user_id, transaction_date desc);
create index if not exists idx_transactions_user_type_date on public.transactions(user_id, type, transaction_date desc);
create index if not exists idx_transactions_user_category_date on public.transactions(user_id, category_id, transaction_date desc);
create index if not exists idx_transactions_credit_card on public.transactions(user_id, credit_card_id, transaction_date desc);
create index if not exists idx_credit_cards_user_active on public.credit_cards(user_id, is_active);
create index if not exists idx_credit_card_purchases_user_active on public.credit_card_purchases(user_id, is_active, start_date desc);
create index if not exists idx_budgets_user_period on public.budgets(user_id, year, month);
create index if not exists idx_investments_user_active on public.investments(user_id, is_active);
create index if not exists idx_savings_goals_user_completed on public.savings_goals(user_id, is_completed);
create unique index if not exists idx_monthly_savings_unique on public.monthly_savings(user_id, year, month, currency_id);

insert into public.currencies (code, name, symbol, decimal_separator, thousand_separator, decimal_places, is_active)
values
  ('ARS', 'Peso argentino', '$', ',', '.', 2, true),
  ('USD', 'US Dollar', 'US$', '.', ',', 2, true)
on conflict (code) do update set
  name = excluded.name,
  symbol = excluded.symbol,
  decimal_separator = excluded.decimal_separator,
  thousand_separator = excluded.thousand_separator,
  decimal_places = excluded.decimal_places,
  is_active = excluded.is_active;

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'profiles',
    'families',
    'family_members',
    'user_settings',
    'groups',
    'categories',
    'credit_cards',
    'credit_card_purchases',
    'transactions',
    'budgets',
    'investments',
    'savings_goals',
    'savings_movements',
    'monthly_savings',
    'exchange_rates',
    'currencies'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

create or replace function public.is_family_member(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.is_active = true
  );
$$;

create or replace function public.can_edit_family(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.is_active = true
      and fm.role in ('owner', 'admin', 'member')
  );
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'currencies' and policyname = 'authenticated can read currencies') then
    create policy "authenticated can read currencies" on public.currencies for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'exchange_rates' and policyname = 'authenticated can read exchange rates') then
    create policy "authenticated can read exchange rates" on public.exchange_rates for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'profiles' and policyname = 'users can manage own profile') then
    create policy "users can manage own profile" on public.profiles for all to authenticated using (id = auth.uid()) with check (id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'family members can read families') then
    create policy "family members can read families" on public.families for select to authenticated using (public.is_family_member(id) or created_by = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'authenticated can create families') then
    create policy "authenticated can create families" on public.families for insert to authenticated with check (created_by = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_members' and policyname = 'family members can read memberships') then
    create policy "family members can read memberships" on public.family_members for select to authenticated using (public.is_family_member(family_id) or user_id = auth.uid());
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'user_settings' and policyname = 'users can manage own settings') then
    create policy "users can manage own settings" on public.user_settings for all to authenticated using (user_id = auth.uid()) with check (user_id = auth.uid());
  end if;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'groups',
    'categories',
    'credit_cards',
    'credit_card_purchases',
    'transactions',
    'budgets',
    'investments',
    'savings_goals',
    'savings_movements',
    'monthly_savings'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || ' owner access') then
      execute format(
        'create policy %I on public.%I for all to authenticated using (user_id = auth.uid() or (family_id is not null and public.is_family_member(family_id))) with check (user_id = auth.uid() or (family_id is not null and public.can_edit_family(family_id)))',
        target_table || ' owner access',
        target_table
      );
    end if;
  end loop;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'profiles',
    'families',
    'user_settings',
    'groups',
    'categories',
    'credit_cards',
    'credit_card_purchases',
    'transactions',
    'budgets',
    'investments',
    'savings_goals'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = target_table || '_set_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', target_table || '_set_updated_at', target_table);
    end if;
  end loop;
end $$;
