create table if not exists public.credit_card_statements (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  credit_card_id uuid not null references public.credit_cards(id) on delete cascade,
  year integer not null check (year between 2000 and 2100),
  month integer not null check (month between 1 and 12),
  currency_id uuid references public.currencies(id),
  expected_amount numeric(14,2) not null default 0 check (expected_amount >= 0),
  previous_balance numeric(14,2) not null default 0,
  amount_due numeric(14,2) not null default 0,
  paid_amount numeric(14,2) not null default 0 check (paid_amount >= 0),
  balance_delta numeric(14,2) not null default 0,
  carryover_balance numeric(14,2) not null default 0,
  status text not null default 'pending' check (status in ('pending', 'paid')),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (credit_card_id, year, month)
);

create index if not exists idx_credit_card_statements_user_period
  on public.credit_card_statements(user_id, year desc, month desc);

create index if not exists idx_credit_card_statements_family_period
  on public.credit_card_statements(family_id, year desc, month desc);

create index if not exists idx_credit_card_statements_card_period
  on public.credit_card_statements(credit_card_id, year desc, month desc);

alter table public.credit_card_statements enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'credit_card_statements' and policyname = 'credit card statements owner access') then
    create policy "credit card statements owner access"
    on public.credit_card_statements
    for all
    to authenticated
    using (user_id = auth.uid() or (family_id is not null and public.is_family_member(family_id)))
    with check (user_id = auth.uid() or (family_id is not null and public.can_edit_family(family_id)));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'credit_card_statements_set_updated_at') then
    create trigger credit_card_statements_set_updated_at
    before update on public.credit_card_statements
    for each row execute function public.set_updated_at();
  end if;
end $$;
