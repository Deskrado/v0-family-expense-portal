alter table public.transactions
  add column if not exists recurring_series_id uuid,
  add column if not exists recurrence_period date;

alter table public.transactions
  drop constraint if exists transactions_recurrence_period_month_start;

alter table public.transactions
  add constraint transactions_recurrence_period_month_start
  check (recurrence_period is null or recurrence_period = date_trunc('month', recurrence_period)::date);

-- Backfill the durable identity already present in metadata. If historical data
-- contains repeated rows for the same series/month, only the oldest row becomes
-- the canonical occurrence; the cleanup script can archive the others safely.
with candidates as (
  select
    id,
    (metadata ->> 'recurring_series_id')::uuid as series_id,
    date_trunc(
      'month',
      coalesce(
        nullif(metadata ->> 'purchase_date', '')::date,
        nullif(metadata ->> 'scheduled_date', '')::date,
        transaction_date
      )
    )::date as period,
    row_number() over (
      partition by
        metadata ->> 'recurring_series_id',
        date_trunc(
          'month',
          coalesce(
            nullif(metadata ->> 'purchase_date', '')::date,
            nullif(metadata ->> 'scheduled_date', '')::date,
            transaction_date
          )
        )
      order by archived_at nulls first, created_at, id
    ) as occurrence_rank
  from public.transactions
  where is_recurring = true
    and coalesce(metadata ->> 'recurring_series_id', '')
      ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'
)
update public.transactions transaction
set recurring_series_id = candidate.series_id,
    recurrence_period = candidate.period
from candidates candidate
where transaction.id = candidate.id
  and candidate.occurrence_rank = 1;

with candidates as (
  select
    id,
    date_trunc('month', transaction_date)::date as period,
    row_number() over (
      partition by recurring_template_id, date_trunc('month', transaction_date)
      order by archived_at nulls first, created_at, id
    ) as occurrence_rank
  from public.transactions
  where recurring_template_id is not null
)
update public.transactions transaction
set recurrence_period = candidate.period
from candidates candidate
where transaction.id = candidate.id
  and candidate.occurrence_rank = 1
  and transaction.recurrence_period is null;

create unique index if not exists idx_transactions_recurring_series_period
  on public.transactions(recurring_series_id, recurrence_period);

create unique index if not exists idx_transactions_recurring_template_period
  on public.transactions(recurring_template_id, recurrence_period);

create index if not exists idx_transactions_family_recurrence_period
  on public.transactions(family_id, recurrence_period)
  where is_recurring = true;
