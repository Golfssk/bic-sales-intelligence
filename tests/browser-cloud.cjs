// Synthetic-only acceptance test. Start npm run dev -- --port 4174 first.
const fs=require('fs'); const output=process.env.SMOKE_OUTPUT || '/tmp/bic-cloud-smoke'; fs.mkdirSync(output,{recursive:true});
const {chromium}=require('playwright'), assert=require('assert');
(async()=>{
const browser=await chromium.launch({executablePath:process.env.CHROMIUM_PATH || require('child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox']});
const origin='https://gknqdodyvejvdlaxucrs.supabase.co',uid='11111111-1111-4111-8111-111111111111';
const user={id:uid,email:'qa@example.test',aud:'authenticated',role:'authenticated',app_metadata:{provider:'email'},user_metadata:{},created_at:'2026-01-01T00:00:00Z'};
const token=['eyJhbGciOiJIUzI1NiJ9',Buffer.from(JSON.stringify({sub:uid,exp:Math.floor(Date.now()/1000)+3600,role:'authenticated'})).toString('base64url'),'mock-test-only'].join('.');
const session={access_token:token,refresh_token:'synthetic-only',expires_in:3600,expires_at:Math.floor(Date.now()/1000)+3600,token_type:'bearer',user};
let stored=[],id=null,calls=0,login=0,fail=false;const errors=[];
async function context(mobile=false){const ctx=await browser.newContext({viewport:mobile?{width:390,height:1000}:{width:1440,height:1000}});
await ctx.addInitScript(()=>localStorage.setItem('bic.project.v1',JSON.stringify({url:'https://obsolete.supabase.co',key:'sb_publishable_obsolete'})));
await ctx.route(origin+'/**',async route=>{const req=route.request(),u=req.url();let body={};
if(u.includes('/auth/v1/token')){assert(u.includes('grant_type=password'));assert(!u.includes('otp'));assert.equal(req.postDataJSON().password,'synthetic-password');login++;body=session;}
else if(u.includes('/auth/v1/user'))body=user;
else if(u.includes('/rest/v1/bic_imports')){assert(u.includes('limit=1'));body=id?[{id,name:'Synthetic upload',row_count:stored.length,meta:{},activated_at:new Date().toISOString()}]:[];}
else if(u.includes('/rest/v1/bic_sales_rows'))body=stored.map(payload=>({payload}));
else if(u.includes('/rest/v1/rpc/bic_ingest')){calls++;if(fail){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({message:'Synthetic network failure'})});return;}stored=req.postDataJSON().p_rows;body=id='synthetic-'+calls;}
else if(u.includes('/auth/v1/otp'))throw Error('OTP must not be called');
await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(body)});});
const p=await ctx.newPage();p.on('pageerror',e=>errors.push(e.message));await p.goto(process.env.TEST_BASE_URL || 'http://localhost:4174');await p.waitForFunction(()=>!!window.BIC_APP&&document.querySelector('#cloudStatus').textContent.includes('อีเมล'));p.setDefaultTimeout(10000);return {ctx,p};}
async function signIn(p){await p.locator('#cloudSave').click();await p.locator('#cloudEmail').fill(user.email);await p.locator('#cloudPassword').fill('synthetic-password');await p.locator('dialog button[type=submit]').click();await p.waitForFunction(()=>document.querySelector('#cloudAuth').textContent==='ออกจากระบบ');await p.waitForTimeout(300);}
const {ctx,p}=await context();await signIn(p);assert.equal(login,1);console.log('Password auth + obsolete config ignored PASS');
const csv=(amount)=>Buffer.from('วันที่เอกสาร,วันที่สร้างข้อมูล,เลขที่เอกสาร,ร้านค้า,ชื่อร้านค้า,สินค้า,ชื่อสินค้า,หน่วย,คืนสินค้า,จำนวน,มูลค่าขาย,มูลค่าขายรวม Vat.\n22/10/2026,22/10/2026 10:00:00,QA-NEW,00011,QA,001,ลาเต้,CUP,N,1,'+amount+','+amount*1.07+'\n');
await p.setInputFiles('#file',{name:'initial.csv',mimeType:'text/csv',buffer:csv(100)});await p.waitForFunction(()=>document.querySelector('#sourceBadge').textContent.includes('CLOUD'));assert.equal(calls,1);assert.equal(stored.length,1);assert.equal(await p.evaluate(()=>BIC_TEST.getState().stats.sales),107);console.log('Validated upload automatically saved once PASS');
await p.screenshot({path:output+'/desktop.png'});
await p.setInputFiles('#file',{name:'new.csv',mimeType:'text/csv',buffer:csv(200)});await p.waitForFunction(()=>document.querySelector('#sourceBadge').textContent.includes('CLOUD'));assert.equal(stored.length,1);assert.equal(await p.evaluate(()=>BIC_TEST.getState().stats.sales),214);console.log('Latest dataset replaces instead of summing PASS');
const {ctx:mobile,p:mp}=await context(true);await signIn(mp);await mp.waitForFunction(()=>BIC_APP.getData().origin==='cloud');assert.equal(await mp.evaluate(()=>BIC_TEST.getState().stats.sales),214);assert.equal(calls,2);await mp.screenshot({path:output+'/mobile.png'});console.log('Separate mobile browser reads same latest snapshot PASS (mock)');
fail=true;await p.setInputFiles('#file',{name:'failure.csv',mimeType:'text/csv',buffer:csv(300)});await p.waitForFunction(()=>document.querySelector('#cloudMessage').textContent.includes('อัปโหลดไม่สำเร็จ'));assert.equal(stored[0].inc,214);await p.locator('#cloudSave').waitFor({state:'visible'});console.log('Failed upload preserves previous remote dataset and offers retry PASS');
fail=false;await p.locator('#cloudSave').click();await p.waitForFunction(()=>BIC_APP.getData().origin==='cloud');assert.equal(stored[0].inc,321);const before=calls;
const invalid=Buffer.concat([csv(400),Buffer.from('bad-date,,QA-BAD,00011,QA,002,ลาเต้,CUP,N,1,100,107\n')]);
await p.setInputFiles('#file',{name:'invalid.csv',mimeType:'text/csv',buffer:invalid});await p.waitForFunction(()=>document.querySelector('#cloudMessage').textContent.includes('ข้อมูลหลักไม่ถูกต้อง'));assert.equal(calls,before);assert.equal(stored[0].inc,321);console.log('Partial invalid import blocked before Cloud write PASS');
await mp.reload();await mp.waitForFunction(()=>BIC_APP.getData().origin==='cloud');assert.equal(await mp.evaluate(()=>BIC_TEST.getState().stats.sales),321);assert.equal(calls,before);console.log('Reload restores latest without pushing cached data PASS');
assert.deepEqual(errors,[]);assert(await p.locator('.brand-logo').evaluate(e=>e.complete&&e.naturalWidth>0));
const auth=await context(true);await auth.p.locator('#cloudSave').click();await auth.p.screenshot({path:output+'/auth-mobile.png'});assert.equal(await auth.p.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);console.log('Logo loaded, no browser errors or mobile page overflow PASS');
await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
