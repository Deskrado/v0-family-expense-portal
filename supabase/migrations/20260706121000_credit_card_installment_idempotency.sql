-- Keep one canonical row for every purchase/installment pair before enforcing
-- the invariant. Prefer a visible row and, within those, an approved row.
with ranked_installments as (
  select
    id,
    row_number() over (
      partition by credit_card_purchase_id, installment_number
      order by
        (archived_at is null) desc,
        (status = 'approved') desc,
        created_at asc,
        id asc
    ) as row_position
  from public.transactions
  where credit_card_purchase_id is not null
    and installment_number is not null
)
delete from public.transactions target
using ranked_installments duplicate
where target.id = duplicate.id
  and duplicate.row_position > 1;

create unique index if not exists transactions_credit_card_installment_unique
  on public.transactions (credit_card_purchase_id, installment_number);
