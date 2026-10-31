import {PGlite} from '@electric-sql/pglite';
import {beforeAll,afterAll,describe,it,expect} from 'vitest';
import {readFileSync} from 'node:fs';
const db=new PGlite(),A='11111111-1111-4111-8111-111111111111',B='22222222-2222-4222-8222-222222222222';
const row={doc:'ABB-1',key:'["00011","ABB-1"]',date:'2026-10-22',ms:1792627200000,day:4,hour:9,store:'00011',storeName:'เยาวราช',storeLabel:'เยาวราช · 00011',sku:'001',name:'ชาไทย',unit:'CUP',status:'N',qty:1,ex:100,inc:107,disc:0,before:100,reason:'ไม่ระบุ'};let id;
async function login(uid){await db.exec('reset role; set role authenticated');await db.query("select set_config('request.jwt.claim.sub',$1,false)",[uid])}
const save=(hash,rows=[row])=>db.query('select public.bic_ingest($1,$2,$3::jsonb,$4::jsonb) as id',['test.xlsx',hash.repeat(64),JSON.stringify(rows),'{}']);
beforeAll(async()=>{await db.exec(`create role anon; create role authenticated; create schema auth; create table auth.users(id uuid primary key); insert into auth.users values('${A}'),('${B}'); create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid $$; grant usage on schema auth to anon,authenticated; grant execute on function auth.uid() to anon,authenticated;`);await db.exec(readFileSync(new URL('../supabase/setup.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/migrations/20261030_bi_workspaces.sql',import.meta.url),'utf8'));await db.exec(readFileSync(new URL('../supabase/migrations/20261031_monthly_batched_imports.sql',import.meta.url),'utf8'))},30000);afterAll(()=>db.close());
describe.sequential('Atomic import and row-level security',()=>{
it('stores import and rows as authenticated owner',async()=>{await login(A);id=(await save('a')).rows[0].id;expect((await db.query('select owner_id,row_count from public.bic_imports')).rows).toEqual([{owner_id:A,row_count:1}]);expect((await db.query('select * from public.bic_sales_rows')).rows).toHaveLength(1)});
it('rejects direct writes',async()=>{await expect(db.query('insert into public.bic_sales_rows(import_id,payload) values($1,$2::jsonb)',[id,JSON.stringify(row)])).rejects.toThrow(/permission denied/)});
it('hides rows and imports from another account',async()=>{await login(B);expect((await db.query('select * from public.bic_imports')).rows).toHaveLength(0);expect((await db.query('select * from public.bic_sales_rows')).rows).toHaveLength(0);expect((await db.query('delete from public.bic_imports where id=$1 returning id',[id])).rows).toHaveLength(0)});
it('rejects invalid rows without partial data',async()=>{await expect(save('b',[row,{...row,status:'INVALID'}])).rejects.toThrow(/Invalid sales row/);expect((await db.query('select * from public.bic_imports')).rows).toHaveLength(0)});
it('assigns owner server-side',async()=>{await save('b');expect((await db.query('select owner_id from public.bic_imports')).rows[0].owner_id).toBe(B)});
it('reactivates duplicate as latest without duplicating rows',async()=>{const before=(await db.query('select id from public.bic_imports')).rows[0].id;expect((await save('b')).rows[0].id).toBe(before);expect((await db.query('select * from public.bic_sales_rows')).rows).toHaveLength(1)});
it('keeps previous snapshots separate and preserves latest after invalid upload',async()=>{
  const latest=(await save('d',[{...row,inc:214,ex:200}])).rows[0].id;
  expect((await db.query('select count(*)::int n from public.bic_imports')).rows[0].n).toBe(2);
  expect((await db.query('select payload from public.bic_sales_rows where import_id=$1',[latest])).rows).toHaveLength(1);
  await expect(save('e',[{...row,status:'INVALID'}])).rejects.toThrow(/Invalid sales row/);
  expect((await db.query('select id from public.bic_imports order by activated_at desc,id desc limit 1')).rows[0].id).toBe(latest);
  await db.query('delete from public.bic_imports where id=$1',[latest]);
});
it('blocks anonymous access',async()=>{await db.exec('reset role; set role anon');await db.query("select set_config('request.jwt.claim.sub','',false)");await expect(db.query('select * from public.bic_imports')).rejects.toThrow(/permission denied/);await expect(save('c')).rejects.toThrow(/permission denied/)});
it('cascades deletion only for owner data',async()=>{await login(A);await db.query('delete from public.bic_imports where id=$1',[id]);expect((await db.query('select * from public.bic_sales_rows')).rows).toHaveLength(0);await login(B);expect((await db.query('select * from public.bic_sales_rows')).rows).toHaveLength(1)});
});
