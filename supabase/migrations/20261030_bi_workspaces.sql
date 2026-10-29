begin;
create table public.bic_workspaces(id uuid primary key default gen_random_uuid(),name text not null check(length(name) between 1 and 100),created_by uuid not null references auth.users(id),created_at timestamptz not null default now());
create table public.bic_members(workspace_id uuid not null references public.bic_workspaces(id) on delete cascade,user_id uuid not null references auth.users(id) on delete cascade,role text not null check(role in ('admin','uploader','viewer')),primary key(workspace_id,user_id));
create table public.bic_workspace_settings(workspace_id uuid primary key references public.bic_workspaces(id) on delete cascade,version integer not null default 1,config jsonb not null default '{"mapping":{},"targets":[],"timeMeaning":"unverified"}',updated_at timestamptz not null default now());
create table public.bic_audit(id bigint generated always as identity primary key,workspace_id uuid references public.bic_workspaces(id) on delete cascade,actor uuid not null references auth.users(id),action text not null,details jsonb not null default '{}',created_at timestamptz not null default now());
alter table public.bic_imports add column workspace_id uuid references public.bic_workspaces(id);
alter table public.bic_imports drop constraint bic_imports_owner_id_content_hash_key;
create unique index bic_private_hash on public.bic_imports(owner_id,content_hash) where workspace_id is null;
create unique index bic_team_hash on public.bic_imports(workspace_id,content_hash) where workspace_id is not null;
create index bic_team_latest on public.bic_imports(workspace_id,activated_at desc,id desc);
create index bic_member_user on public.bic_members(user_id);
create index bic_audit_workspace on public.bic_audit(workspace_id,created_at desc);
create function public.bic_role(p_workspace uuid) returns text language sql stable security definer set search_path='' as $$select role from public.bic_members where workspace_id=p_workspace and user_id=auth.uid()$$;
revoke all on function public.bic_role(uuid) from public,anon;
grant execute on function public.bic_role(uuid) to authenticated;
alter table public.bic_workspaces enable row level security;
alter table public.bic_members enable row level security;
alter table public.bic_workspace_settings enable row level security;
alter table public.bic_audit enable row level security;
revoke all on public.bic_workspaces,public.bic_members,public.bic_workspace_settings,public.bic_audit from public,anon,authenticated;
grant select on public.bic_workspaces,public.bic_members,public.bic_workspace_settings,public.bic_audit to authenticated;
create policy team_read on public.bic_workspaces for select to authenticated using(public.bic_role(id) is not null);
create policy members_read on public.bic_members for select to authenticated using(public.bic_role(workspace_id) is not null);
create policy settings_read on public.bic_workspace_settings for select to authenticated using(public.bic_role(workspace_id) is not null);
create policy audit_read on public.bic_audit for select to authenticated using(public.bic_role(workspace_id) is not null or (workspace_id is null and actor=auth.uid()));
drop policy bic_imports_read on public.bic_imports;
create policy bic_imports_read on public.bic_imports for select to authenticated using((workspace_id is null and owner_id=auth.uid()) or public.bic_role(workspace_id) is not null);
drop policy bic_imports_delete on public.bic_imports;
-- Historical snapshots are retained. Deletion is an admin/owner-only explicit operation.
create policy bic_imports_delete on public.bic_imports for delete to authenticated using((workspace_id is null and owner_id=auth.uid()) or public.bic_role(workspace_id)='admin');
drop policy bic_rows_read on public.bic_sales_rows;
create policy bic_rows_read on public.bic_sales_rows for select to authenticated using(exists(select 1 from public.bic_imports i where i.id=import_id));
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
 select id into v_id from public.bic_imports where owner_id=v_user and workspace_id is null and content_hash=p_hash;
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
create or replace function public.bic_ingest_team(p_workspace uuid,p_name text,p_hash text,p_rows jsonb,p_meta jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path='' as $$
declare v_user uuid:=auth.uid(); v_id uuid; v_count integer;
begin
 if public.bic_role(p_workspace) not in ('admin','uploader') or public.bic_role(p_workspace) is null then raise exception 'Upload permission required' using errcode='42501'; end if;
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
 perform pg_advisory_xact_lock(hashtextextended(p_workspace::text,0));
 select id into v_id from public.bic_imports where workspace_id=p_workspace and content_hash=p_hash;
 if v_id is not null then
  if not exists(select 1 from public.bic_imports where id=v_id and row_count=v_count) or
    (select jsonb_agg(payload order by id) from public.bic_sales_rows where import_id=v_id) is distinct from p_rows
    then raise exception 'Hash collision or mismatched data'; end if;
  update public.bic_imports set activated_at=clock_timestamp(),name=p_name,meta=p_meta where id=v_id;
  return v_id;
 end if;
 insert into public.bic_imports(workspace_id,owner_id,name,content_hash,row_count,meta,activated_at) values(p_workspace,v_user,p_name,p_hash,v_count,p_meta,clock_timestamp()) returning id into v_id;
 insert into public.bic_sales_rows(import_id,payload) select v_id,r from jsonb_array_elements(p_rows) r;
 return v_id;
end;
$$;

create function public.bic_create_workspace(p_name text) returns uuid language plpgsql security definer set search_path='' as $$
declare v_id uuid;v_user uuid:=auth.uid(); begin
 if v_user is null then raise exception 'Sign in required'; end if;
 insert into public.bic_workspaces(name,created_by) values(trim(p_name),v_user) returning id into v_id;
 insert into public.bic_members values(v_id,v_user,'admin');
 insert into public.bic_workspace_settings(workspace_id) values(v_id);
 insert into public.bic_audit(workspace_id,actor,action,details) values(v_id,v_user,'workspace.created',jsonb_build_object('name',p_name));
 return v_id;
end $$;
create function public.bic_set_member(p_workspace uuid,p_email text,p_role text) returns void language plpgsql security definer set search_path='' as $$
declare v_target uuid;begin
 if public.bic_role(p_workspace) is distinct from 'admin' then raise exception 'Admin required' using errcode='42501';end if;
 perform 1 from public.bic_workspaces where id=p_workspace for update;
 select id into v_target from auth.users where lower(email)=lower(trim(p_email));
 if v_target is null then raise exception 'Account not found: create user in Supabase Authentication first';end if;
 if p_role not in ('admin','uploader','viewer','remove') then raise exception 'Invalid role';end if;
 if exists(select 1 from public.bic_members where workspace_id=p_workspace and user_id=v_target and role='admin') and p_role<>'admin' and (select count(*) from public.bic_members where workspace_id=p_workspace and role='admin')<=1 then raise exception 'Cannot remove last admin';end if;
 if p_role='remove' then delete from public.bic_members where workspace_id=p_workspace and user_id=v_target;
 else insert into public.bic_members values(p_workspace,v_target,p_role) on conflict(workspace_id,user_id) do update set role=excluded.role;end if;
 insert into public.bic_audit(workspace_id,actor,action,details) values(p_workspace,auth.uid(),'member.'||p_role,jsonb_build_object('user',v_target));
end $$;
create function public.bic_list_members(p_workspace uuid) returns table(user_id uuid,email text,role text) language plpgsql security definer set search_path='' as $$begin
 if public.bic_role(p_workspace) is distinct from 'admin' then raise exception 'Admin required' using errcode='42501';end if;
 return query select m.user_id,u.email::text,m.role from public.bic_members m join auth.users u on u.id=m.user_id where m.workspace_id=p_workspace;
end $$;
create function public.bic_save_settings(p_workspace uuid,p_config jsonb,p_version integer) returns integer language plpgsql security definer set search_path='' as $$
declare v_version integer; v_before jsonb;begin
 if public.bic_role(p_workspace) is distinct from 'admin' then raise exception 'Admin required' using errcode='42501';end if;
 if jsonb_typeof(p_config) is distinct from 'object' or octet_length(p_config::text)>65536 or jsonb_typeof(p_config->'mapping') is distinct from 'object' or jsonb_typeof(p_config->'targets') is distinct from 'array' or coalesce(p_config->>'timeMeaning','') not in ('unverified','sale','recorded') then raise exception 'Invalid settings';end if;
 if exists(select 1 from jsonb_each_text(p_config->'mapping') where value not in ('Gelato & Ice Cream','Slushy','Coffee & Tea','Bakery','Fresh Coconut','DSB Sauces & Condiments','Other Beverages & Retail','Unmapped / รอตรวจสอบ')) then raise exception 'Invalid mapping group';end if;
 if exists(select 1 from jsonb_array_elements(p_config->'targets') t where jsonb_typeof(t->'value') is distinct from 'number' or (t->>'value')::numeric<=0 or coalesce(t->>'basis','') not in ('inc','ex') or coalesce(t->>'from','')!~'^\d{4}-\d{2}-\d{2}$' or coalesce(t->>'to','')!~'^\d{4}-\d{2}-\d{2}$') then raise exception 'Invalid targets';end if;
 perform (t->>'from')::date,(t->>'to')::date from jsonb_array_elements(p_config->'targets') t;
 if exists(select 1 from jsonb_array_elements(p_config->'targets') t where (t->>'from')::date>(t->>'to')::date) then raise exception 'Invalid target dates';end if;
 select config into v_before from public.bic_workspace_settings where workspace_id=p_workspace for update;
 update public.bic_workspace_settings set config=p_config,version=version+1,updated_at=clock_timestamp() where workspace_id=p_workspace and version=p_version returning version into v_version;
 if v_version is null then raise exception 'Settings changed by another admin; reload first';end if;
 insert into public.bic_audit(workspace_id,actor,action,details) values(p_workspace,auth.uid(),'settings.updated',jsonb_build_object('version',v_version,'previous',p_version,'previousConfig',v_before,'currentConfig',p_config));
 return v_version;
end $$;
create function public.bic_activate_import(p_import uuid) returns void language plpgsql security definer set search_path='' as $$
declare i public.bic_imports;begin
 select * into i from public.bic_imports where id=p_import;
 if i.id is null or (i.workspace_id is null and i.owner_id<>auth.uid()) or (i.workspace_id is not null and coalesce(public.bic_role(i.workspace_id),'') not in ('admin','uploader')) or auth.uid() is null then raise exception 'Restore permission required' using errcode='42501';end if;
 perform pg_advisory_xact_lock(hashtextextended(coalesce(i.workspace_id,i.owner_id)::text,0));
 update public.bic_imports set activated_at=clock_timestamp() where id=i.id;
 insert into public.bic_audit(workspace_id,actor,action,details) values(i.workspace_id,auth.uid(),'import.restored',jsonb_build_object('import',i.id,'name',i.name));
end $$;
create function public.bic_log_import() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.bic_audit(workspace_id,actor,action,details) values(new.workspace_id,auth.uid(),case when TG_OP='INSERT' then 'import.uploaded' else 'import.reactivated' end,jsonb_build_object('import',new.id,'name',new.name,'rows',new.row_count));return new;end $$;
create trigger bic_log_import after insert or update of activated_at on public.bic_imports for each row execute function public.bic_log_import();
create function public.bic_log_delete() returns trigger language plpgsql security definer set search_path='' as $$begin
 insert into public.bic_audit(workspace_id,actor,action,details) values(old.workspace_id,auth.uid(),'import.deleted',jsonb_build_object('import',old.id,'name',old.name));return old;end $$;
create trigger bic_log_delete after delete on public.bic_imports for each row execute function public.bic_log_delete();
revoke all on function public.bic_ingest_team(uuid,text,text,jsonb,jsonb) from public,anon;grant execute on function public.bic_ingest_team(uuid,text,text,jsonb,jsonb) to authenticated;
revoke all on function public.bic_create_workspace(text) from public,anon;grant execute on function public.bic_create_workspace(text) to authenticated;
revoke all on function public.bic_set_member(uuid,text,text) from public,anon;grant execute on function public.bic_set_member(uuid,text,text) to authenticated;
revoke all on function public.bic_list_members(uuid) from public,anon;grant execute on function public.bic_list_members(uuid) to authenticated;
revoke all on function public.bic_save_settings(uuid,jsonb,integer) from public,anon;grant execute on function public.bic_save_settings(uuid,jsonb,integer) to authenticated;
revoke all on function public.bic_activate_import(uuid) from public,anon;grant execute on function public.bic_activate_import(uuid) to authenticated;
revoke all on function public.bic_log_import(),public.bic_log_delete() from public,anon,authenticated;
commit;
