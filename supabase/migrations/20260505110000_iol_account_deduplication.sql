with ranked_connections as (
  select
    id,
    row_number() over (
      partition by user_id, provider_id, environment, external_account_hash
      order by coalesce(last_sync_at, updated_at, created_at) desc, created_at desc
    ) as row_number
  from public.broker_connections
  where external_account_hash is not null
    and status <> 'disabled'
)
update public.broker_connections as connection
set
  status = 'disabled',
  last_error = 'Duplicada por reconexion de la misma cuenta IOL',
  updated_at = now()
from ranked_connections
where connection.id = ranked_connections.id
  and ranked_connections.row_number > 1;

create unique index if not exists idx_broker_connections_unique_iol_account
on public.broker_connections(user_id, provider_id, environment, external_account_hash)
where external_account_hash is not null and status <> 'disabled';
