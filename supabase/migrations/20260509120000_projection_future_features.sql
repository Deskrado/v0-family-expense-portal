create table if not exists public.projection_scenarios (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  name text not null,
  description text,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.projection_scenario_items (
  id uuid primary key default gen_random_uuid(),
  scenario_id uuid not null references public.projection_scenarios(id) on delete cascade,
  name text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_id uuid references public.currencies(id),
  frequency text not null default 'monthly' check (frequency in ('monthly', 'one_time')),
  start_month integer not null check (start_month between 1 and 12),
  start_year integer not null check (start_year between 2000 and 2100),
  end_month integer not null check (end_month between 1 and 12),
  end_year integer not null check (end_year between 2000 and 2100),
  category_id uuid references public.categories(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check ((end_year * 12 + end_month) >= (start_year * 12 + start_month))
);

create table if not exists public.monthly_closures (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  income_total numeric(14,2) not null default 0,
  expense_total numeric(14,2) not null default 0,
  savings_total numeric(14,2) not null default 0,
  cash_total numeric(14,2) not null default 0,
  investments_total numeric(14,2) not null default 0,
  foreign_currency_total numeric(14,2) not null default 0,
  snapshot jsonb not null default '{}'::jsonb,
  closed_by uuid references auth.users(id) on delete set null,
  closed_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, year, month)
);

create index if not exists idx_projection_scenarios_user_active
  on public.projection_scenarios(user_id, is_active, created_at desc);

create index if not exists idx_projection_scenarios_family_active
  on public.projection_scenarios(family_id, is_active, created_at desc);

create index if not exists idx_projection_scenario_items_scenario
  on public.projection_scenario_items(scenario_id);

create index if not exists idx_monthly_closures_user_period
  on public.monthly_closures(user_id, year desc, month desc);

create index if not exists idx_monthly_closures_family_period
  on public.monthly_closures(family_id, year desc, month desc);

alter table public.projection_scenarios enable row level security;
alter table public.projection_scenario_items enable row level security;
alter table public.monthly_closures enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projection_scenarios' and policyname = 'projection scenarios owner access') then
    create policy "projection scenarios owner access"
    on public.projection_scenarios
    for all
    to authenticated
    using (user_id = auth.uid() or (family_id is not null and public.is_family_member(family_id)))
    with check (user_id = auth.uid() or (family_id is not null and public.can_edit_family(family_id)));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'projection_scenario_items' and policyname = 'projection scenario items owner access') then
    create policy "projection scenario items owner access"
    on public.projection_scenario_items
    for all
    to authenticated
    using (
      exists (
        select 1
        from public.projection_scenarios scenario
        where scenario.id = projection_scenario_items.scenario_id
          and (scenario.user_id = auth.uid() or (scenario.family_id is not null and public.is_family_member(scenario.family_id)))
      )
    )
    with check (
      exists (
        select 1
        from public.projection_scenarios scenario
        where scenario.id = projection_scenario_items.scenario_id
          and (scenario.user_id = auth.uid() or (scenario.family_id is not null and public.can_edit_family(scenario.family_id)))
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'monthly_closures' and policyname = 'monthly closures owner access') then
    create policy "monthly closures owner access"
    on public.monthly_closures
    for all
    to authenticated
    using (user_id = auth.uid() or (family_id is not null and public.is_family_member(family_id)))
    with check (user_id = auth.uid() or (family_id is not null and public.can_edit_family(family_id)));
  end if;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'projection_scenarios',
    'projection_scenario_items',
    'monthly_closures'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = target_table || '_set_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', target_table || '_set_updated_at', target_table);
    end if;
  end loop;
end $$;
