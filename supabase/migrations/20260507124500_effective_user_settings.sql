create or replace function public.effective_user_settings()
returns setof public.user_settings
language sql
stable
security definer
set search_path = public
as $$
  with active_membership as (
    select fm.family_id, fm.role, fm.joined_at
    from public.family_members fm
    where fm.user_id = auth.uid()
      and fm.is_active = true
    order by
      case fm.role
        when 'owner' then 0
        when 'admin' then 1
        when 'member' then 2
        else 3
      end,
      fm.joined_at
    limit 1
  ),
  family_owner as (
    select f.created_by as user_id
    from active_membership am
    join public.families f on f.id = am.family_id
    where am.role <> 'owner'
  ),
  preferred_user as (
    select coalesce((select user_id from family_owner), auth.uid()) as user_id
  )
  select us.*
  from public.user_settings us
  join preferred_user pu on pu.user_id = us.user_id
  limit 1;
$$;

grant execute on function public.effective_user_settings() to authenticated;
