create or replace function public.default_family_for_user(target_user_id uuid)
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select fm.family_id
  from public.family_members fm
  where fm.user_id = target_user_id
    and fm.is_active = true
  order by
    case fm.role
      when 'owner' then 1
      when 'admin' then 2
      when 'member' then 3
      else 4
    end,
    fm.joined_at asc
  limit 1;
$$;

create or replace function public.set_default_family_id()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if new.family_id is null and new.user_id is not null then
    new.family_id := public.default_family_for_user(new.user_id);
  end if;

  return new;
end;
$$;

do $$
declare
  target_table text;
begin
  foreach target_table in array array[
    'groups',
    'categories',
    'credit_cards',
    'credit_card_purchases',
    'transactions',
    'budgets',
    'investments',
    'savings_goals',
    'monthly_savings',
    'recurring_income_templates'
  ] loop
    if exists (
      select 1
      from information_schema.columns
      where table_schema = 'public'
        and table_name = target_table
        and column_name = 'family_id'
    ) and not exists (
      select 1 from pg_trigger where tgname = target_table || '_set_default_family_id'
    ) then
      execute format(
        'create trigger %I before insert on public.%I for each row execute function public.set_default_family_id()',
        target_table || '_set_default_family_id',
        target_table
      );
    end if;
  end loop;
end $$;

update public.groups item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.categories item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.credit_cards item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.credit_card_purchases item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.transactions item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.budgets item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.investments item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.savings_goals item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.monthly_savings item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;

update public.recurring_income_templates item
set family_id = public.default_family_for_user(item.user_id)
where item.family_id is null
  and public.default_family_for_user(item.user_id) is not null;
