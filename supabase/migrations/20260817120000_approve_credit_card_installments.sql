-- Purchases entered in installments are confirmed at creation time. Only
-- recurring card debits and manual card expenses require statement approval.
update public.transactions
set
  status = 'approved',
  approved_at = coalesce(approved_at, created_at, now()),
  approved_by = coalesce(approved_by, created_by, user_id),
  updated_at = now(),
  metadata = coalesce(metadata, '{}'::jsonb) || jsonb_build_object(
    'installment_approval_backfill', jsonb_build_object(
      'changed_at', now(),
      'reason', 'credit_card_installments_are_confirmed_when_loaded'
    )
  )
where archived_at is null
  and type = 'expense'
  and payment_method = 'credit'
  and credit_card_purchase_id is not null
  and installment_number is not null
  and status = 'pending';
