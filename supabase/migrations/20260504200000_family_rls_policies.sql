do $$
begin
  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'family editors can update families') then
    create policy "family editors can update families"
    on public.families
    for update
    to authenticated
    using (created_by = auth.uid() or public.can_edit_family(id))
    with check (created_by = auth.uid() or public.can_edit_family(id));
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'families' and policyname = 'family owners can delete families') then
    create policy "family owners can delete families"
    on public.families
    for delete
    to authenticated
    using (
      created_by = auth.uid()
      or exists (
        select 1
        from public.family_members fm
        where fm.family_id = families.id
          and fm.user_id = auth.uid()
          and fm.is_active
          and fm.role = 'owner'
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_members' and policyname = 'family owners can insert memberships') then
    create policy "family owners can insert memberships"
    on public.family_members
    for insert
    to authenticated
    with check (
      user_id = auth.uid()
      or exists (
        select 1
        from public.family_members fm
        where fm.family_id = family_members.family_id
          and fm.user_id = auth.uid()
          and fm.is_active
          and fm.role in ('owner', 'admin')
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_members' and policyname = 'family owners can update memberships') then
    create policy "family owners can update memberships"
    on public.family_members
    for update
    to authenticated
    using (
      exists (
        select 1
        from public.family_members fm
        where fm.family_id = family_members.family_id
          and fm.user_id = auth.uid()
          and fm.is_active
          and fm.role in ('owner', 'admin')
      )
    )
    with check (
      exists (
        select 1
        from public.family_members fm
        where fm.family_id = family_members.family_id
          and fm.user_id = auth.uid()
          and fm.is_active
          and fm.role in ('owner', 'admin')
      )
    );
  end if;

  if not exists (select 1 from pg_policies where schemaname = 'public' and tablename = 'family_members' and policyname = 'family owners can delete memberships') then
    create policy "family owners can delete memberships"
    on public.family_members
    for delete
    to authenticated
    using (
      exists (
        select 1
        from public.family_members fm
        where fm.family_id = family_members.family_id
          and fm.user_id = auth.uid()
          and fm.is_active
          and fm.role in ('owner', 'admin')
      )
    );
  end if;
end $$;
