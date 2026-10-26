-- BIC sales workspace. Run the entire migration once in Supabase SQL Editor.
-- Only Publishable / anon keys belong in the browser. NEVER use service_role.
begin;
create table if not exists public.bic_imports (
 id uuid primary key default gen_random_uuid(),
 owner_id uuid not null references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 255),
 content_hash text not null check(content_hash ~ '^[0-9a-f]{64}$'),
 row_count integer not null check(row_count between 1 and 25000),
 meta jsonb not null default '{}'::jsonb,
 created_at timestamptz not null default now(),
 unique(owner_id,content_hash)
);
alter table public.bic_imports add column if not exists activated_at timestamptz not null default now();
create table if not exists public.bic_sales_rows (
 id bigint generated always as identity primary key,
 import_id uuid not null references public.bic_imports(id) on delete cascade,
 payload jsonb not null check(jsonb_typeof(payload)='object')
);
create index if not exists bic_imports_owner_idx on public.bic_imports(owner_id,created_at desc);
create index if not exists bic_rows_import_idx on public.bic_sales_rows(import_id,id);
alter table public.bic_imports enable row level security;
alter table public.bic_sales_rows enable row level security;
revoke all on public.bic_imports,public.bic_sales_rows from anon,authenticated;
grant select,delete on public.bic_imports to authenticated;
grant select on public.bic_sales_rows to authenticated;
drop policy if exists bic_imports_read on public.bic_imports;
create policy bic_imports_read on public.bic_imports for select to authenticated using(owner_id=(select auth.uid()));
drop policy if exists bic_imports_delete on public.bic_imports;
create policy bic_imports_delete on public.bic_imports for delete to authenticated using(owner_id=(select auth.uid()));
drop policy if exists bic_rows_read on public.bic_sales_rows;
create policy bic_rows_read on public.bic_sales_rows for select to authenticated using(exists(select 1 from public.bic_imports i where i.id=import_id and i.owner_id=(select auth.uid())));
create or replace function public.bic_ingest(p_name text,p_hash text,p_rows jsonb,p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_count integer;
begin
 if v_user is null then raise exception 'Sign in required' using errcode='42501'; end if;
 if p_name is null or length(p_name) not between 1 and 255 then raise exception 'Invalid filename'; end if;
 if p_hash is null or p_hash !~ '^[0-9a-f]{64}$' then raise exception 'Invalid content hash'; end if;
 if jsonb_typeof(p_rows) is distinct from 'array' then raise exception 'Rows must be an array'; end if;
 v_count:=jsonb_array_length(p_rows);
 if v_count not between 1 and 25000 then raise exception 'Import must contain 1–25000 rows'; end if;
 if octet_length(p_rows::text)>5242880 then raise exception 'Payload exceeds 5 MB; split the file'; end if;
 if jsonb_typeof(p_meta) is distinct from 'object' or octet_length(p_meta::text)>32768 then raise exception 'Invalid metadata'; end if;
 if exists(select 1 from jsonb_array_elements(p_rows) r where
  jsonb_typeof(r) is distinct from 'object' or
  jsonb_typeof(r->'doc') is distinct from 'string' or length(r->>'doc') not between 1 and 255 or
  jsonb_typeof(r->'date') is distinct from 'string' or coalesce(r->>'date','') !~ '^\d{4}-\d{2}-\d{2}$' or
  coalesce(r->>'status','') not in ('N','Y') or
  jsonb_typeof(r->'qty') is distinct from 'number' or jsonb_typeof(r->'ex') is distinct from 'number' or jsonb_typeof(r->'inc') is distinct from 'number' or
  jsonb_typeof(r->'ms') is distinct from 'number' or jsonb_typeof(r->'day') is distinct from 'number' or
  jsonb_typeof(r->'key') is distinct from 'string' or jsonb_typeof(r->'store') is distinct from 'string' or
  jsonb_typeof(r->'storeName') is distinct from 'string' or jsonb_typeof(r->'storeLabel') is distinct from 'string' or
  jsonb_typeof(r->'sku') is distinct from 'string' or jsonb_typeof(r->'name') is distinct from 'string' or
  jsonb_typeof(r->'unit') is distinct from 'string' or jsonb_typeof(r->'reason') is distinct from 'string' or
  not(r ?& array['hour','disc','before']) or
  jsonb_typeof(r->'hour') not in ('number','null') or jsonb_typeof(r->'disc') not in ('number','null') or jsonb_typeof(r->'before') not in ('number','null') or
  (jsonb_typeof(r->'hour')='number' and ((r->>'hour')::numeric not between 0 and 23 or (r->>'hour')::numeric<>trunc((r->>'hour')::numeric)))
 ) then raise exception 'Invalid sales row schema'; end if;
 -- Casting validates calendar dates and fails atomically on invalid values.
 perform (r->>'date')::date from jsonb_array_elements(p_rows) r;
 -- Serialise same-owner uploads: latest activation wins, identical content never duplicates rows.
 perform pg_advisory_xact_lock(hashtextextended(v_user::text,0));
 select id into v_id from public.bic_imports where owner_id=v_user and content_hash=p_hash;
 if v_id is not null then
  if not exists(select 1 from public.bic_imports where id=v_id and row_count=v_count) or
    (select jsonb_agg(payload order by id) from public.bic_sales_rows where import_id=v_id) is distinct from p_rows
    then raise exception 'Hash collision or mismatched data'; end if;
  update public.bic_imports set activated_at=clock_timestamp(),name=p_name,meta=p_meta where id=v_id;
  return v_id;
 end if;
 insert into public.bic_imports(owner_id,name,content_hash,row_count,meta,activated_at) values(v_user,p_name,p_hash,v_count,p_meta,clock_timestamp()) returning id into v_id;
 insert into public.bic_sales_rows(import_id,payload) select v_id,r from jsonb_array_elements(p_rows) r;
 return v_id;
end;
$$;
revoke all on function public.bic_ingest(text,text,jsonb,jsonb) from public,anon;
grant execute on function public.bic_ingest(text,text,jsonb,jsonb) to authenticated;
commit;
