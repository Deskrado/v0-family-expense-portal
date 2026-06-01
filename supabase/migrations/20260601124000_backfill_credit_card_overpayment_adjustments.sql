insert into public.transactions (
  user_id,
  family_id,
  created_by,
  description,
  amount,
  budgeted_amount,
  currency_id,
  category_id,
  group_id,
  transaction_date,
  type,
  is_recurring,
  payment_method,
  credit_card_id,
  credit_card_purchase_id,
  installment_number,
  status,
  approved_at,
  approved_by,
  notes,
  metadata
)
select
  statement.user_id,
  statement.family_id,
  statement.approved_by,
  'Ajuste pago ' || card.name,
  round((statement.paid_amount - statement.expected_amount)::numeric, 2),
  round((statement.paid_amount - statement.expected_amount)::numeric, 2),
  statement.currency_id,
  null,
  null,
  make_date(statement.year, statement.month, least(coalesce(card.due_day, 1), extract(day from (date_trunc('month', make_date(statement.year, statement.month, 1)) + interval '1 month - 1 day'))::integer)),
  'expense',
  false,
  'credit',
  statement.credit_card_id,
  null,
  null,
  'approved',
  coalesce(statement.approved_at, now()),
  statement.approved_by,
  null,
  jsonb_build_object(
    'source', 'credit_card_statement_payment_adjustment',
    'credit_card_statement_id', statement.id,
    'expected_amount', statement.expected_amount,
    'paid_amount', statement.paid_amount,
    'previous_balance', statement.previous_balance,
    'adjustment_kind', case
      when statement.paid_amount > statement.amount_due then 'overpayment'
      else 'previous_balance_payment'
    end,
    'backfilled_at', now()
  )
from public.credit_card_statements statement
join public.credit_cards card on card.id = statement.credit_card_id
where statement.status = 'paid'
  and statement.paid_amount > statement.expected_amount
  and not exists (
    select 1
    from public.transactions existing
    where existing.archived_at is null
      and existing.credit_card_id = statement.credit_card_id
      and existing.metadata @> jsonb_build_object(
        'source', 'credit_card_statement_payment_adjustment',
        'credit_card_statement_id', statement.id
      )
  );
