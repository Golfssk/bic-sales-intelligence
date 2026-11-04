-- Replace datasets only after every monthly import in the new file succeeded.
create or replace function public.bic_replace_imports(
  p_workspace uuid, p_keep_ids uuid[]
) returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_user uuid := auth.uid();
  v_expected integer := coalesce(cardinality(p_keep_ids), 0);
  v_valid integer;
  v_removed integer;
begin
  if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
  if v_expected not between 1 and 12
     or v_expected <> (select count(distinct id) from unnest(p_keep_ids) as id)
     or array_position(p_keep_ids, null) is not null then
    raise exception 'Provide 1 to 12 distinct completed import IDs';
  end if;
  if p_workspace is not null
     and public.bic_role(p_workspace) is distinct from 'admin' then
    raise exception 'Only a workspace admin can replace existing team datasets'
      using errcode='42501';
  end if;
  perform pg_advisory_xact_lock(
    hashtextextended(coalesce(p_workspace::text, v_user::text), 0)
  );
  select count(*) into v_valid
  from public.bic_imports i
  where i.id = any(p_keep_ids)
    and i.workspace_id is not distinct from p_workspace
    and (p_workspace is not null or i.owner_id = v_user)
    and i.period_key is not null
    and i.row_count > 0;
  if v_valid <> v_expected then
    raise exception 'Replacement aborted: incomplete or unauthorized dataset IDs'
      using errcode='42501';
  end if;
  -- ON DELETE CASCADE removes sales rows and revokes any publication of
  -- a deleted snapshot; it does not touch user accounts or workspace config.
  with removed as (
    delete from public.bic_imports i
    where i.workspace_id is not distinct from p_workspace
      and (p_workspace is not null or i.owner_id = v_user)
      and not (i.id = any(p_keep_ids))
    returning i.id
  )
  select count(*)::integer into v_removed from removed;
  insert into public.bic_audit(workspace_id, actor, action, details)
  values (p_workspace, v_user, 'import.replaced',
    jsonb_build_object('kept', v_expected, 'removed', v_removed));
  return v_removed;
end;
$$;
revoke all on function public.bic_replace_imports(uuid,uuid[]) from public, anon;
grant execute on function public.bic_replace_imports(uuid,uuid[]) to authenticated;
notify pgrst, 'reload schema';
