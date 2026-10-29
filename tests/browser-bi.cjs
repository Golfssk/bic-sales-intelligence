// Synthetic data only: no live users or sales are written by this test.
const {chromium}=require('playwright'),assert=require('assert'),fs=require('fs');
(async()=>{
 const out=process.env.SMOKE_OUTPUT||'/tmp/bic-bi-smoke';fs.mkdirSync(out,{recursive:true});
 const browser=await chromium.launch({executablePath:require('child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox']});
 const base=process.env.TEST_BASE_URL||'http://localhost:4176',errors=[];
 const page=await browser.newPage({viewport:{width:1440,height:1100}});page.on('pageerror',e=>errors.push(e.message));await page.goto(base);await page.waitForFunction(()=>window.BIC_APP&&document.querySelector('#biWorkspace'));
 const header='วันที่เอกสาร,วันที่สร้างข้อมูล,เลขที่เอกสาร,ร้านค้า,ชื่อร้านค้า,สินค้า,ชื่อสินค้า,หน่วย,คืนสินค้า,จำนวน,มูลค่าขาย,มูลค่าขายรวม Vat.,มูลค่าส่วนลด,มูลค่าขายก่อนส่วนลด,มูลค่า VAT';
 let data=header+'\n';for(let d=1;d<=4;d++)data+=`${d}/10/2026,${d}/10/2026 10:00:00,B${d},01,QA,001,ลาเต้,CUP,N,1,100,107,1,101,7\n${d}/10/2026,${d}/10/2026 11:00:00,B${d},01,QA,002,ครัวซองต์เนยสด,PC,N,1,50,53.5,2,52,3.5\n`;
 data+=',,Count = 8,,,,,,,8,600,642,12,612,42\n';
 await page.setInputFiles('#file',{name:'QA-only.csv',mimeType:'text/csv',buffer:Buffer.from(data)});await page.waitForFunction(()=>BIC_APP.getData().rows.length===8);
 await page.locator('#biQuality').evaluate(e=>e.open=true);assert((await page.locator('#biAudit').textContent()).includes('ตรง (±0.05)'));assert.equal(await page.evaluate(()=>BIC_TEST.getState().stats.dr>1.9),true);console.log('Source footer checks + ex-VAT compatible discount PASS');
 await page.locator('#from').fill('2026-10-03');await page.locator('#from').dispatchEvent('change');await page.waitForTimeout(100);assert((await page.locator('#biComparison').textContent()).includes('2026-10-01'));assert.equal(await page.locator('#biComparison').locator('tbody tr').count(),6);console.log('Equal-day comparison with same selectors PASS');
 await page.locator('#biCompare').selectOption('week');assert((await page.locator('#biComparison').textContent()).includes('ไม่ครอบคลุม'));await page.locator('#biCompare').selectOption('previous');
 const canvas=page.locator('#groupPie');await canvas.scrollIntoViewIfNeeded();const box=await canvas.boundingBox();await page.mouse.click(box.x+box.width*.65,box.y+box.height*.35);await page.waitForTimeout(100);assert.equal(await page.evaluate(()=>BIC_APP.getExplore()?.kind),'group');await page.evaluate(()=>BIC_APP.setExplore(null));console.log('Pie segment click cross-filters without chart lifecycle errors PASS');
 await page.locator('#groupShareBody [data-bi-group="Coffee & Tea"]').click();assert.equal(await page.evaluate(()=>BIC_APP.getView().filtered.length),2);assert(await page.locator('#biExplore').getAttribute('open')!==null);assert.equal(await page.locator('#biBills [data-bill]').count(),2);
 await page.locator('#biBills [data-bill]').first().click();assert((await page.locator('.bi-dialog').textContent()).includes('ยอดเต็มบิล ฿160.5'));assert((await page.locator('.bi-dialog').textContent()).includes('ยอดที่ตรงตัวกรอง ฿107.0'));await page.locator('#biCloseBill').click();console.log('Group cross-filter + receipt drill-through contextual vs full bill PASS');
 await page.locator('#biClearExplore').click();assert.equal(await page.evaluate(()=>BIC_APP.getView().filtered.length),4);
 await page.locator('#biProduct').selectOption(JSON.stringify(['002','ครัวซองต์เนยสด']));assert.equal(await page.evaluate(()=>BIC_APP.getView().filtered.every(r=>r.sku==='002')),true);await page.locator('#biClearExplore').click();console.log('Product drill + clear preserves global dates PASS');
 await page.locator('#biDecision').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/desktop-decision.png'});await page.locator('#biQuality').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/desktop-audit.png'});
 await page.setViewportSize({width:390,height:844});await page.locator('#biExplore').scrollIntoViewIfNeeded();await page.screenshot({path:out+'/mobile-explore.png'});for(const width of [320,390,768,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false,'BI overflow '+width)}
 const origin='https://gknqdodyvejvdlaxucrs.supabase.co',uid='11111111-1111-4111-8111-111111111111',ws='aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa';
 async function team(role){
  const ctx=await browser.newContext({viewport:{width:390,height:1000}});let settings={mapping:{},targets:[],timeMeaning:'unverified'},version=1,saves=0,active='latest';
  const qa={doc:'QA',key:'["01","QA"]',date:'2026-10-22',ms:1792627200000,day:4,hour:10,store:'01',storeName:'QA',storeLabel:'QA',sku:'1',name:'ลาเต้',unit:'CUP',status:'N',qty:1,inc:107,ex:100,vat:7,disc:0,before:100,beforeEx:100,reason:'QA'};
  const user={id:uid,email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
  const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'synthetic-only'].join('.');
  const session={access_token:token,refresh_token:'synthetic-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
  await ctx.addInitScript(({uid,ws})=>localStorage.setItem('bic.workspace.'+uid,ws),{uid,ws});
  await ctx.route(origin+'/**',async route=>{const u=route.request().url();let body=[];
   if(u.includes('/auth/v1/token'))body=session;else if(u.includes('/auth/v1/user'))body=user;
   else if(u.includes('/rpc/bic_activate_import')){assert.notEqual(role,'viewer');active=route.request().postDataJSON().p_import;body=null;}
   else if(u.includes('/bic_imports')){const ids=u.includes('limit=1')?[active]:[active,active==='latest'?'older':'latest'];body=ids.map(id=>({id,name:'QA '+id,row_count:1,owner_id:uid,workspace_id:ws,created_at:'2026-10-22T10:00:00Z',activated_at:new Date().toISOString(),meta:{}}));}
   else if(u.includes('/bic_sales_rows'))body=[{payload:{...qa,inc:active==='older'?53.5:107,ex:active==='older'?50:100,vat:active==='older'?3.5:7}}];
   else if(u.includes('/rpc/bic_role'))body=role;
   else if(u.includes('/rpc/bic_save_settings')){settings=route.request().postDataJSON().p_config;version++;saves++;body=version;}
   else if(u.includes('/rpc/bic_list_members'))body=[{user_id:uid,email:user.email,role}];
   else if(u.includes('/bic_workspaces'))body=u.includes('id=eq.')?{id:ws,name:'QA team'}:[{id:ws,name:'QA team'}];
   else if(u.includes('/bic_workspace_settings'))body={config:settings,version};
   await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});
  });
  const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(base);await p.waitForSelector('#cloudSave');await p.locator('#cloudSave').click();await p.locator('#cloudEmail').fill(user.email);await p.locator('#cloudPassword').fill('synthetic-password');await p.locator('dialog button[type=submit]').click();await p.waitForFunction(()=>BIC_CLOUD.context().workspace?.role);await p.locator('#biWorkspace').evaluate(e=>e.open=true);await p.waitForFunction(()=>document.querySelector('#biTeamMessage').textContent.includes('QA team'));
  return {p,get:()=>({settings,version,saves,active}),ctx};
 }
 const admin=await team('admin');assert.equal(await admin.p.locator('#biMemberForm').count(),1);await admin.p.locator('#biMappingForm').evaluate(e=>e.closest('details').open=true);
 await admin.p.locator('#biMappingForm [name=product]').fill('QA product');await admin.p.locator('#biMappingForm [name=group]').selectOption('Bakery');await admin.p.locator('#biMappingForm button').click();await admin.p.waitForFunction(()=>document.querySelector('#biTeamMessage').textContent.includes('บันทึกการตั้งค่ากลางแล้ว'));assert.equal(admin.get().settings.mapping['QA product'],'Bakery');
 await admin.p.locator('#biTargetForm').evaluate(e=>e.closest('details').open=true);await admin.p.locator('#biTargetForm [name=from]').fill('2026-10-01');await admin.p.locator('#biTargetForm [name=to]').fill('2026-10-31');await admin.p.locator('#biTargetForm [name=value]').fill('10000');await admin.p.locator('#biTargetForm button').click();await admin.p.waitForFunction(()=>document.querySelector('#biTeamMessage').textContent.includes('บันทึกการตั้งค่ากลางแล้ว'));assert.equal(admin.get().settings.targets[0].value,10000);console.log('Workspace preference + admin mapping and genuine target saves PASS (mock)');
 await admin.p.evaluate(()=>BIC_APP.loadData({rows:[{...BIC_APP.getData().rows[0],inc:999}],source:'invalid local QA',origin:'local',issues:{date:1}}));
 await admin.p.waitForTimeout(300);await admin.p.evaluate(()=>BIC_CLOUD.restore('older'));await admin.p.waitForFunction(()=>BIC_APP.getData().origin==='cloud'&&BIC_APP.getView().stats.sales===53.5);assert.equal(admin.get().active,'older');console.log('Explicit restore replaces unsaved local view without re-uploading it PASS (mock)');
 await admin.p.locator('#biWorkspace').scrollIntoViewIfNeeded();await admin.p.screenshot({path:out+'/mobile-team.png'});
 const viewer=await team('viewer');assert.equal(await viewer.p.locator('#biMemberForm').count(),0);assert.equal(await viewer.p.locator('#biMappingForm').count(),0);assert(await viewer.p.locator('#file').isDisabled());assert.equal(viewer.get().saves,0);console.log('Viewer UI read-only; database-level denial covered separately by PGlite PASS');
 assert.deepEqual(errors,[]);console.log('No JS errors; BI panels 320–1440 px no page overflow PASS');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
