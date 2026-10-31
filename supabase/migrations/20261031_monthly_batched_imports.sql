-- Monthly datasets with bounded, resumable 2,000-row uploads.
-- Apply after 20261030_bi_workspaces.sql. This migration changes schema only;
-- it does not connect to or execute against the production database.
begin;

alter table public.bic_imports drop constraint if exists bic_imports_row_count_check;
alter table public.bic_imports add constraint bic_imports_row_count_check
  check (row_count between 1 and 250000);
alter table public.bic_imports add column if not exists period_key text;
alter table public.bic_imports add constraint bic_imports_period_key_check
  check (period_key is null or period_key ~ '^\d{4}-(0[1-9]|1[0-2])$');
create index if not exists bic_imports_period_idx
  on public.bic_imports(owner_id,period_key,activated_at desc);
create index if not exists bic_team_period_idx
  on public.bic_imports(workspace_id,period_key,activated_at desc);

create table if not exists public.bic_import_sessions (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  workspace_id uuid references public.bic_workspaces(id) on delete cascade,
  name text not null check(length(name) between 1 and 255),
  content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
  expected_rows integer not null check(expected_rows between 1 and 250000),
  period_key text not null check(period_key ~ '^\d{4}-(0[1-9]|1[0-2])$'),
  meta jsonb not null default '{}'::jsonb check(jsonb_typeof(meta)='object' and octet_length(meta::text)<=32768),
  created_at timestamptz not null default now()
);
create table if not exists public.bic_import_session_rows (
  session_id uuid not null references public.bic_import_sessions(id) on delete cascade,
  row_index integer not null check(row_index>=0),
  payload jsonb not null check(jsonb_typeof(payload)='object'),
  primary key(session_id,row_index)
);
create index if not exists bic_import_sessions_owner_idx
  on public.bic_import_sessions(owner_id,created_at desc);
alter table public.bic_import_sessions enable row level security;
alter table public.bic_import_session_rows enable row level security;
revoke all on public.bic_import_sessions,public.bic_import_session_rows from public,anon,authenticated;

create or replace function public.bic_begin_import(
  p_workspace uuid,p_name text,p_hash text,p_expected_rows integer,p_period_key text,p_meta jsonb default '{}'::jsonb
) returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_workspace is null then
   if p_name is null or length(p_name) not between 1 and 255 then raise exception 'Invalid filename'; end if;
 else
   if public.bic_role(p_workspace) not in ('admin','uploader') or public.bic_role(p_workspace) is null then
     raise exception 'Upload permission required' using errcode='42501';
   end if;
 end if;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid content hash'; end if;
 if p_expected_rows not between 1 and 250000 then raise exception 'Import must contain 1–250000 rows'; end if;
 if p_period_key is null or p_period_key !~ '^\d{4}-(0[1-9]|1[0-2])$' then raise exception 'Invalid monthly period'; end if;
 if jsonb_typeof(p_meta) is distinct from 'object' or octet_length(p_meta::text)>32768 then raise exception 'Invalid metadata'; end if;
 insert into public.bic_import_sessions(owner_id,workspace_id,name,content_hash,expected_rows,period_key,meta)
 values(v_user,p_workspace,left(p_name,255),p_hash,p_expected_rows,p_period_key,p_meta) returning id into v_id;
 return v_id;
end;
$$;

create or replace function public.bic_append_import_batch(
  p_session uuid,p_offset integer,p_rows jsonb
) returns integer language plpgsql security definer set search_path='' as $$
declare s public.bic_import_sessions%rowtype; v_count integer; v_uid uuid:=auth.uid();
begin
 select * into s from public.bic_import_sessions where id=p_session for update;
 if not found or v_uid is null then raise exception 'Import session not found' using errcode='42501'; end if;
 if s.workspace_id is null then
   if s.owner_id<>v_uid then raise exception 'Import permission required' using errcode='42501'; end if;
 else
   if public.bic_role(s.workspace_id) not in ('admin','uploader') or public.bic_role(s.workspace_id) is null then
     raise exception 'Upload permission required' using errcode='42501';
   end if;
 end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be an array'; end if;
 v_count:=jsonb_array_length(p_rows);
 if v_count not between 1 and 2000 or p_offset<0 or p_offset+v_count>s.expected_rows then
   raise exception 'Batch must contain 1–2000 rows within expected range';
 end if;
 if octet_length(p_rows::text)>5242880 then raise exception 'Batch payload exceeds 5 MB'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where
  jsonb_typeof(r) is distinct from 'object' or
  jsonb_typeof(r->'doc') is distinct from 'string' or length(r->>'doc') not between 1 and 255 or
  jsonb_typeof(r->'date') is distinct from 'string' or coalesce(r->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or
  left(r->>'date',7)<>s.period_key or coalesce(r->>'status','') not in ('N','Y') or
  jsonb_typeof(r->'qty') is distinct from 'number' or jsonb_typeof(r->'ex') is distinct from 'number' or
  jsonb_typeof(r->'inc') is distinct from 'number' or jsonb_typeof(r->'ms') is distinct from 'number' or
  jsonb_typeof(r->'day') is distinct from 'number' or jsonb_typeof(r->'key') is distinct from 'string' or
  jsonb_typeof(r->'store') is distinct from 'string' or jsonb_typeof(r->'storeName') is distinct from 'string' or
  jsonb_typeof(r->'storeLabel') is distinct from 'string' or jsonb_typeof(r->'sku') is distinct from 'string' or
  jsonb_typeof(r->'name') is distinct from 'string' or jsonb_typeof(r->'unit') is distinct from 'string' or
  jsonb_typeof(r->'reason') is distinct from 'string' or not(r ?& array['hour','disc','before']) or
  jsonb_typeof(r->'hour') not in ('number','null') or jsonb_typeof(r->'disc') not in ('number','null') or
  jsonb_typeof(r->'before') not in ('number','null') or
  (jsonb_typeof(r->'hour')='number' and ((r->>'hour')::numeric not between 0 and 23 or (r->>'hour')::numeric<>trunc((r->>'hour')::numeric)))
 ) then raise exception 'Invalid sales row schema or mixed monthly period'; end if;
 perform (r->>'date')::date from jsonb_array_elements(p_rows) r;
 -- Retries are idempotent only when the same offset contains identical data.
 if exists(
   select 1 from jsonb_array_elements(p_rows) with ordinality x(value,ord)
   join public.bic_import_session_rows old
     on old.session_id=p_session and old.row_index=p_offset+(x.ord::integer)-1
   where old.payload is distinct from x.value
 ) then raise exception 'Batch retry does not match existing rows'; end if;
 insert into public.bic_import_session_rows(session_id,row_index,payload)
 select p_session,p_offset+(x.ord::integer)-1,x.value
 from jsonb_array_elements(p_rows) with ordinality x(value,ord)
 on conflict(session_id,row_index) do nothing;
 return (select count(*)::integer from public.bic_import_session_rows where session_id=p_session);
end;
$$;

create or replace function public.bic_complete_import(p_session uuid)
returns uuid language plpgsql security definer set search_path='' as $$
declare s public.bic_import_sessions%rowtype; v_uid uuid:=auth.uid(); v_count integer; v_id uuid;
begin
 select * into s from public.bic_import_sessions where id=p_session for update;
 if not found or v_uid is null then raise exception 'Import session not found' using errcode='42501'; end if;
 if s.workspace_id is null then
   if s.owner_id<>v_uid then raise exception 'Import permission required' using errcode='42501'; end if;
 else
   if public.bic_role(s.workspace_id) not in ('admin','uploader') or public.bic_role(s.workspace_id) is null then
     raise exception 'Upload permission required' using errcode='42501';
   end if;
 end if;
 select count(*) into v_count from public.bic_import_session_rows where session_id=p_session;
 if v_count<>s.expected_rows or
    (select min(row_index) from public.bic_import_session_rows where session_id=p_session)<>0 or
    (select max(row_index) from public.bic_import_session_rows where session_id=p_session)<>s.expected_rows-1
 then raise exception 'Upload incomplete: expected % rows, received %',s.expected_rows,v_count; end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(s.workspace_id::text,s.owner_id::text),0));
 if s.workspace_id is null then
   select id into v_id from public.bic_imports where owner_id=s.owner_id and workspace_id is null and content_hash=s.content_hash;
 else
   select id into v_id from public.bic_imports where workspace_id=s.workspace_id and content_hash=s.content_hash;
 end if;
 if v_id is not null then
   if not exists(select 1 from public.bic_imports where id=v_id and row_count=s.expected_rows and period_key=s.period_key)
      or (select jsonb_agg(payload order by row_index) from public.bic_import_session_rows where session_id=p_session)
         is distinct from
         (select jsonb_agg(payload order by id) from public.bic_sales_rows where import_id=v_id)
   then raise exception 'Hash collision or mismatched data'; end if;
   update public.bic_imports set activated_at=clock_timestamp(),name=s.name,meta=s.meta where id=v_id;
 else
   insert into public.bic_imports(owner_id,workspace_id,name,content_hash,row_count,period_key,meta,activated_at)
   values(s.owner_id,s.workspace_id,s.name,s.content_hash,s.expected_rows,s.period_key,s.meta,clock_timestamp())
   returning id into v_id;
   insert into public.bic_sales_rows(import_id,payload)
   select v_id,payload from public.bic_import_session_rows where session_id=p_session order by row_index;
 end if;
 delete from public.bic_import_sessions where id=p_session;
 return v_id;
end;
$$;


create or replace function public.bic_abort_import(p_session uuid)
returns void language plpgsql security definer set search_path='' as $
declare s public.bic_import_sessions%rowtype; v_uid uuid:=auth.uid();
begin
 select * into s from public.bic_import_sessions where id=p_session for update;
 if not found then return; end if;
 if s.workspace_id is null then
   if s.owner_id<>v_uid then raise exception 'Import permission required' using errcode='42501'; end if;
 else
   if public.bic_role(s.workspace_id) not in ('admin','uploader') or public.bic_role(s.workspace_id) is null then
     raise exception 'Upload permission required' using errcode='42501';
   end if;
 end if;
 delete from public.bic_import_sessions where id=p_session;
end;
$;

revoke all on function public.bic_abort_import(uuid) from public,anon;
grant execute on function public.bic_abort_import(uuid) to authenticated;
revoke all on function public.bic_begin_import(uuid,text,text,integer,text,jsonb) from public,anon;
revoke all on function public.bic_append_import_batch(uuid,integer,jsonb) from public,anon;
revoke all on function public.bic_complete_import(uuid) from public,anon;
grant execute on function public.bic_begin_import(uuid,text,text,integer,text,jsonb) to authenticated;
grant execute on function public.bic_append_import_batch(uuid,integer,jsonb) to authenticated;
grant execute on function public.bic_complete_import(uuid) to authenticated;

commit;
