create table if not exists public.external_providers (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('broker', 'fx', 'market_data')),
  base_url text not null,
  sandbox_base_url text,
  is_active boolean not null default true,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.integration_secrets (
  id uuid primary key default gen_random_uuid(),
  provider_code text not null,
  ciphertext text not null,
  iv text not null,
  tag text not null,
  key_version text not null default 'v1',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broker_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  provider_id uuid not null references public.external_providers(id),
  secret_id uuid references public.integration_secrets(id) on delete set null,
  display_name text not null,
  environment text not null default 'sandbox' check (environment in ('sandbox', 'production')),
  status text not null default 'active' check (status in ('active', 'reauth_required', 'disabled', 'error')),
  scopes text[] not null default array['read_portfolio', 'read_account', 'read_quotes'],
  external_account_hash text,
  access_token_expires_at timestamptz,
  last_sync_at timestamptz,
  last_error text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.broker_accounts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.broker_connections(id) on delete cascade,
  external_account_id text,
  account_number_last4 text,
  name text not null,
  base_currency_id uuid references public.currencies(id),
  status text not null default 'active',
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.market_instruments (
  id uuid primary key default gen_random_uuid(),
  provider_id uuid references public.external_providers(id),
  symbol text not null,
  market text,
  country text,
  instrument_type text not null default 'other',
  currency_id uuid references public.currencies(id),
  name text,
  provider_symbol text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (provider_id, symbol, market)
);

create table if not exists public.broker_positions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  account_id uuid not null references public.broker_accounts(id) on delete cascade,
  instrument_id uuid references public.market_instruments(id) on delete set null,
  quantity numeric(18,8) not null default 0,
  avg_cost numeric(18,8),
  currency_id uuid references public.currencies(id),
  market_value numeric(18,2),
  price numeric(18,8),
  observed_at timestamptz not null default now(),
  source text not null default 'iol',
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.portfolio_snapshots (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  connection_id uuid not null references public.broker_connections(id) on delete cascade,
  account_id uuid references public.broker_accounts(id) on delete cascade,
  snapshot_at timestamptz not null default now(),
  total_value numeric(18,2) not null default 0,
  currency_id uuid references public.currencies(id),
  source text not null default 'iol',
  raw_hash text,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.portfolio_snapshot_items (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  snapshot_id uuid not null references public.portfolio_snapshots(id) on delete cascade,
  instrument_id uuid references public.market_instruments(id) on delete set null,
  quantity numeric(18,8),
  price numeric(18,8),
  market_value numeric(18,2),
  currency_id uuid references public.currencies(id),
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.market_quotes (
  id uuid primary key default gen_random_uuid(),
  instrument_id uuid not null references public.market_instruments(id) on delete cascade,
  provider_id uuid references public.external_providers(id),
  bid numeric(18,8),
  ask numeric(18,8),
  last numeric(18,8),
  close numeric(18,8),
  volume numeric(18,2),
  currency_id uuid references public.currencies(id),
  observed_at timestamptz not null default now(),
  market_date date,
  source text not null,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.fx_quotes (
  id uuid primary key default gen_random_uuid(),
  base_currency_id uuid not null references public.currencies(id) on delete cascade,
  quote_currency_id uuid not null references public.currencies(id) on delete cascade,
  rate_type text not null,
  bid numeric(18,8),
  ask numeric(18,8),
  mid numeric(18,8),
  source text not null,
  observed_at timestamptz not null default now(),
  valid_on date not null default current_date,
  raw jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create table if not exists public.integration_audit_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  connection_id uuid references public.broker_connections(id) on delete set null,
  event_type text not null,
  status text not null,
  message text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_broker_connections_user on public.broker_connections(user_id, status);
create index if not exists idx_broker_accounts_user on public.broker_accounts(user_id, connection_id);
create unique index if not exists idx_broker_accounts_unique_external on public.broker_accounts(connection_id, external_account_id);
create index if not exists idx_broker_positions_user on public.broker_positions(user_id, observed_at desc);
create index if not exists idx_portfolio_snapshots_user on public.portfolio_snapshots(user_id, snapshot_at desc);
create index if not exists idx_fx_quotes_latest on public.fx_quotes(source, rate_type, observed_at desc);
create unique index if not exists idx_fx_quotes_unique_source_type_time on public.fx_quotes(source, rate_type, observed_at);

insert into public.external_providers (code, name, kind, base_url, sandbox_base_url, metadata)
values
  ('iol', 'IOL invertironline', 'broker', 'https://api.invertironline.com', 'https://api.invertironline.com', '{"mode":"read_only"}'::jsonb),
  ('dolarapi', 'DolarAPI', 'fx', 'https://dolarapi.com', null, '{}'::jsonb),
  ('monedapi', 'MonedAPI', 'fx', 'https://monedapi.ar', null, '{}'::jsonb),
  ('data912', 'Data912', 'market_data', 'https://data912.com', null, '{}'::jsonb)
on conflict (code) do update set
  name = excluded.name,
  kind = excluded.kind,
  base_url = excluded.base_url,
  sandbox_base_url = excluded.sandbox_base_url,
  metadata = excluded.metadata,
  is_active = true,
  updated_at = now();

do $$
declare
  table_name text;
begin
  foreach table_name in array array[
    'external_providers',
    'integration_secrets',
    'broker_connections',
    'broker_accounts',
    'market_instruments',
    'broker_positions',
    'portfolio_snapshots',
    'portfolio_snapshot_items',
    'market_quotes',
    'fx_quotes',
    'integration_audit_events'
  ] loop
    execute format('alter table public.%I enable row level security', table_name);
  end loop;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'external_providers',
    'integration_secrets',
    'broker_connections',
    'broker_accounts',
    'market_instruments',
    'broker_positions'
  ] loop
    if not exists (select 1 from pg_trigger where tgname = target_table || '_set_updated_at') then
      execute format('create trigger %I before update on public.%I for each row execute function public.set_updated_at()', target_table || '_set_updated_at', target_table);
    end if;
  end loop;
end $$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'external_providers' and policyname = 'authenticated can read providers') then
    create policy "authenticated can read providers" on public.external_providers for select to authenticated using (is_active = true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'market_instruments' and policyname = 'authenticated can read instruments') then
    create policy "authenticated can read instruments" on public.market_instruments for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'market_quotes' and policyname = 'authenticated can read market quotes') then
    create policy "authenticated can read market quotes" on public.market_quotes for select to authenticated using (true);
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'fx_quotes' and policyname = 'authenticated can read fx quotes') then
    create policy "authenticated can read fx quotes" on public.fx_quotes for select to authenticated using (true);
  end if;
end $$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'broker_connections',
    'broker_accounts',
    'broker_positions',
    'portfolio_snapshots',
    'portfolio_snapshot_items',
    'integration_audit_events'
  ] loop
    if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = target_table and policyname = target_table || ' user access') then
      execute format(
        'create policy %I on public.%I for select to authenticated using (user_id = auth.uid())',
        target_table || ' user access',
        target_table
      );
    end if;
  end loop;
end $$;
