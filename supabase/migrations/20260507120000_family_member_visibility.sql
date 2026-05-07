alter table public.family_members add column if not exists email text;
alter table public.family_members add column if not exists display_name text;

create table if not exists public.family_member_permissions (
  id uuid primary key default gen_random_uuid(),
  family_id uuid not null references public.families(id) on delete cascade,
  family_member_id uuid not null unique references public.family_members(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  allowed_modules text[] not null default array[
    'dashboard',
    'transactions',
    'credit_cards',
    'categories',
    'savings',
    'projections',
    'investments',
    'settings'
  ],
  visible_category_ids uuid[],
  masked_category_amounts jsonb not null default '{}'::jsonb,
  show_investments boolean not null default true,
  created_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_family_member_permissions_family on public.family_member_permissions(family_id);
create index if not exists idx_family_member_permissions_user on public.family_member_permissions(user_id);

alter table public.family_member_permissions enable row level security;

create or replace function public.can_manage_family_members(target_family_id uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.family_members fm
    where fm.family_id = target_family_id
      and fm.user_id = auth.uid()
      and fm.is_active = true
      and fm.role in ('owner', 'admin')
  );
$$;

do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_member_permissions' and policyname = 'members can read visible permissions') then
    create policy "members can read visible permissions"
    on public.family_member_permissions
    for select
    to authenticated
    using (
      user_id = auth.uid()
      or public.can_manage_family_members(family_id)
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_member_permissions' and policyname = 'family admins can create permissions') then
    create policy "family admins can create permissions"
    on public.family_member_permissions
    for insert
    to authenticated
    with check (public.can_manage_family_members(family_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_member_permissions' and policyname = 'family admins can update permissions') then
    create policy "family admins can update permissions"
    on public.family_member_permissions
    for update
    to authenticated
    using (public.can_manage_family_members(family_id))
    with check (public.can_manage_family_members(family_id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_member_permissions' and policyname = 'family admins can delete permissions') then
    create policy "family admins can delete permissions"
    on public.family_member_permissions
    for delete
    to authenticated
    using (public.can_manage_family_members(family_id));
  end if;
end $$;

do $$
begin
  if not exists (select 1 from pg_trigger where tgname = 'family_member_permissions_set_updated_at') then
    create trigger family_member_permissions_set_updated_at
    before update on public.family_member_permissions
    for each row execute function public.set_updated_at();
  end if;
end $$;
