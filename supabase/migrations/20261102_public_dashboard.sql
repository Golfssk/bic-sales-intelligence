-- Public Dashboard: opt-in publication of ONE administrator-selected snapshot.
-- Apply after 20261030_bi_workspaces.sql; does not require the batched-import
-- migration for viewing existing snapshots. No existing dataset is published.
begin;
create table if not exists public.bic_public_dashboard (
  singleton boolean primary key default true check (singleton),
  import_id uuid not null references public.bic_imports(id) on delete cascade,
  published_by uuid not null references auth.users(id),
  published_at timestamptz not null default now()
);
alter table public.bic_public_dashboard enable row level security;
revoke all on public.bic_public_dashboard from public,anon,authenticated;

-- Called by the owning account (private datasets) or workspace admin.
-- Once published, only the current publisher or the publication's team admin
-- can replace/revoke the global publication.
create or replace function public.bic_set_public_dashboard(p_import uuid)
returns void language plpgsql security definer set search_path='' as $$
declare v_uid uuid:=auth.uid(); v_old public.bic_public_dashboard%rowtype;
        v_new public.bic_imports%rowtype; v_can_change boolean;
begin
  if v_uid is null then raise exception 'Login required' using errcode='42501'; end if;
  perform pg_advisory_xact_lock(77284532);
  select * into v_old from public.bic_public_dashboard where singleton=true for update;
  if found then
    select * into v_new from public.bic_imports where id=v_old.import_id;
    v_can_change := v_old.published_by=v_uid
      or (v_new.workspace_id is not null and public.bic_role(v_new.workspace_id)='admin');
    if not v_can_change then raise exception 'Only the publishing admin can change the public dashboard' using errcode='42501'; end if;
  end if;
  if p_import is null then
    delete from public.bic_public_dashboard where singleton=true;
    return;
  end if;
  select * into v_new from public.bic_imports where id=p_import;
  if not found then raise exception 'Dataset not found'; end if;
  if not (v_new.owner_id=v_uid and v_new.workspace_id is null)
     and not (v_new.workspace_id is not null and public.bic_role(v_new.workspace_id)='admin')
  then raise exception 'Admin/owner permission required to publish' using errcode='42501'; end if;
  insert into public.bic_public_dashboard(singleton,import_id,published_by,published_at)
  values(true,p_import,v_uid,clock_timestamp())
  on conflict(singleton) do update set import_id=excluded.import_id,
    published_by=excluded.published_by,published_at=excluded.published_at;
end $$;

-- Return only the explicitly published snapshot metadata.
create or replace function public.bic_public_dashboard_info()
returns jsonb language sql stable security definer set search_path='' as $$
  select jsonb_build_object(
    'id',i.id,'name',i.name,'row_count',i.row_count,
    'activated_at',i.activated_at,'published_at',p.published_at,
    'meta',i.meta)
  from public.bic_public_dashboard p
  join public.bic_imports i on i.id=p.import_id
  where p.singleton=true
$$;

-- The only anonymous sales-data path: fixed published import, max 1000 rows
-- per call; no arbitrary import ID, no privileged direct table reads.
create or replace function public.bic_public_dashboard_rows(p_offset integer default 0,p_limit integer default 1000)
returns table(payload jsonb) language plpgsql stable security definer set search_path='' as $$
begin
  if p_offset is null or p_offset<0 or p_limit is null or p_limit<1 or p_limit>1000
  then raise exception 'Invalid page' using errcode='22023'; end if;
  return query
    select r.payload from public.bic_sales_rows r
    join public.bic_public_dashboard p on p.import_id=r.import_id
    where p.singleton=true
    order by r.id
    limit p_limit offset p_offset;
end $$;

revoke all on function public.bic_set_public_dashboard(uuid) from public,anon;
revoke all on function public.bic_public_dashboard_info() from public;
revoke all on function public.bic_public_dashboard_rows(integer,integer) from public;
grant execute on function public.bic_set_public_dashboard(uuid) to authenticated;
grant execute on function public.bic_public_dashboard_info() to anon,authenticated;
grant execute on function public.bic_public_dashboard_rows(integer,integer) to anon,authenticated;
commit;
