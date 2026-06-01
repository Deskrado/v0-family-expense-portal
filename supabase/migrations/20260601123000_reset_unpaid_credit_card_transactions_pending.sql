update public.transactions transaction
set
  status = 'pending',
  approved_at = null,
  approved_by = null,
  updated_at = now(),
  metadata = coalesce(transaction.metadata, '{}'::jsonb) || jsonb_build_object(
    'payment_approval_backfill', jsonb_build_object(
      'changed_at', now(),
      'reason', 'credit_card_statement_payment_required_from_2026_06'
    )
  )
where transaction.archived_at is null
  and transaction.type = 'expense'
  and transaction.payment_method = 'credit'
  and transaction.transaction_date >= date '2026-06-01'
  and transaction.status = 'approved'
  and not exists (
    select 1
    from public.credit_card_statements statement
    where statement.credit_card_id = transaction.credit_card_id
      and statement.year = extract(year from transaction.transaction_date)::integer
      and statement.month = extract(month from transaction.transaction_date)::integer
      and statement.status = 'paid'
  );
