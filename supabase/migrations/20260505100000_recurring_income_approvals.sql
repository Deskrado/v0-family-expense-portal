create table if not exists public.recurring_income_templates (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  family_id uuid references public.families(id) on delete cascade,
  description text not null,
  amount numeric(14,2) not null check (amount > 0),
  currency_id uuid references public.currencies(id),
  category_id uuid references public.categories(id) on delete set null,
  group_id uuid references public.groups(id) on delete set null,
  day_of_month integer not null default 1 check (day_of_month between 1 and 28),
  start_date date not null default current_date,
  end_date date,
  frequency text not null default 'monthly' check (frequency in ('monthly')),
  auto_generate_months_ahead integer not null default 1 check (auto_generate_months_ahead between 0 and 12),
  is_active boolean not null default true,
  last_generated_on date,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (end_date is null or end_date >= start_date)
);

alter table public.transactions
  add column if not exists status text not null default 'approved' check (status in ('pending', 'approved', 'rejected'));

alter table public.transactions
  add column if not exists approved_at timestamptz;

alter table public.transactions
  add column if not exists approved_by uuid references auth.users(id) on delete set null;

alter table public.transactions
  add column if not exists recurring_template_id uuid references public.recurring_income_templates(id) on delete set null;

update public.transactions
set status = 'approved',
    approved_at = coalesce(approved_at, created_at),
    approved_by = coalesce(approved_by, user_id)
where status = 'approved';

create index if not exists idx_recurring_income_templates_user_active on public.recurring_income_templates(user_id, is_active, day_of_month);
create index if not exists idx_transactions_user_status_date on public.transactions(user_id, status, transaction_date desc);
create unique index if not exists idx_transactions_recurring_template_date
  on public.transactions(user_id, recurring_template_id, transaction_date)
  where recurring_template_id is not null and archived_at is null;

alter table public.recurring_income_templates enable row level security;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'recurring_income_templates' and policyname = 'recurring_income_templates owner access') then
    create policy "recurring_income_templates owner access"
      on public.recurring_income_templates
      for all
      to authenticated
      using (user_id = auth.uid() or (family_id is not null and public.is_family_member(family_id)))
      with check (user_id = auth.uid() or (family_id is not null and public.can_edit_family(family_id)));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'recurring_income_templates_set_updated_at') then
    create trigger recurring_income_templates_set_updated_at
      before update on public.recurring_income_templates
      for each row execute function public.set_updated_at();
  end if;
end $$;
