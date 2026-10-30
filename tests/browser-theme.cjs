// Local presentation checks only; fixture data is opt-in demo, no live writes.
const {chromium}=require('playwright'),assert=require('assert'),fs=require('fs');
(async()=>{
 const browser=await chromium.launch({executablePath:require('child_process').execFileSync('which',['chromium'],{encoding:'utf8'}).trim(),headless:true,args:['--no-sandbox']});
 const out=process.env.SMOKE_OUTPUT||'/tmp/bic-theme';fs.mkdirSync(out,{recursive:true});
 const p=await browser.newPage({viewport:{width:1440,height:1100},deviceScaleFactor:2}),errors=[];p.on('pageerror',e=>errors.push(e.message));
 await p.route('https://gknqdodyvejvdlaxucrs.supabase.co/**',r=>r.fulfill({status:200,contentType:'application/json',body:'{}'}));
 await p.goto(process.env.TEST_BASE_URL||'http://localhost:4179');await p.waitForFunction(()=>window.BIC_UX);await p.evaluate(()=>BIC_TEST.loadDemo());await p.waitForTimeout(350);
 const style=async(selector,prop)=>p.locator(selector).first().evaluate((e,k)=>getComputedStyle(e)[k],prop);
 assert.equal(await style('body','backgroundColor'),'rgb(250, 249, 245)');assert.equal(await style('.sidebar','backgroundColor'),'rgb(245, 240, 232)');assert.equal(await style('.kpi .value','color'),'rgb(0, 0, 0)');assert.equal(await style('.ux-primary','backgroundColor'),'rgb(204, 120, 92)');
 const initial=await p.evaluate(()=>JSON.stringify(BIC_TEST.getState().stats));
 const chart=await p.evaluate(async()=>{const resource=performance.getEntriesByType('resource').find(e=>e.name.includes('/chart__js_auto.js'));const {default:Chart}=await import(resource.name);const c=Chart.getChart(document.querySelector('#trend'));return{color:c.data.datasets[0].borderColor,tick:c.options.scales.y.ticks.color,grid:c.options.scales.y.grid.color}});
 assert.deepEqual(chart,{color:'#b46b50',tick:'#000000',grid:'#e6dfd8'});for(const selector of ['.ux-source-line','.kpi .sub','.kpi .delta','.ux-view-button','.ux-status-button'])assert.equal(await style(selector,'color'),'rgb(0, 0, 0)',selector);console.log('Warm canvas, pure black typography, coral CTA and chart palette PASS');
 await p.evaluate(()=>BIC_UX.openTool('quality'));await p.waitForTimeout(350);assert.equal(await style('#uxInspector','backgroundColor'),'rgb(250, 249, 245)');assert.equal(await style('#uxTab-quality','backgroundColor'),'rgb(239, 233, 222)');await p.screenshot({path:out+'/desktop-quality.png'});await p.evaluate(()=>BIC_UX.closeTool());
 await p.evaluate(()=>BIC_UX.showView('groups'));await p.waitForTimeout(300);await p.screenshot({path:out+'/desktop-groups.png'});assert.equal(await p.evaluate(()=>JSON.stringify(BIC_TEST.getState().stats)),initial);
 await p.setViewportSize({width:390,height:844});await p.evaluate(()=>BIC_UX.showView('overview'));await p.locator('.ux-page-header').scrollIntoViewIfNeeded();await p.waitForTimeout(300);assert.equal(await style('.mobile-bottom-nav button[aria-current]','color'),'rgb(0, 0, 0)');await p.screenshot({path:out+'/mobile-overview.png'});
 await p.locator('#mobileFilters>.mobile-fold-toggle').click();assert.equal(await style('#from','colorScheme'),'light');assert.equal(await style('#from','fontSize'),'16px');await p.locator('#groupFilterToggle').click();await p.waitForTimeout(250);await p.screenshot({path:out+'/mobile-filters.png'});await p.locator('#groupFilterToggle').click();await p.locator('#mobileFilters>.mobile-fold-toggle').click();
 await p.locator('#toggleFilters').click();await p.locator('.sidebar-settings>summary').click();await p.waitForTimeout(250);await p.screenshot({path:out+'/mobile-import.png'});
 await p.locator('#cloudAuth').click();await p.locator('dialog:has(#cloudEmail)').waitFor({state:'visible'});assert.equal(await style('dialog:has(#cloudEmail)','backgroundColor'),'rgb(250, 249, 245)');assert.equal(await style('#cloudEmail','colorScheme'),'light');await p.screenshot({path:out+'/mobile-auth.png'});
 assert.deepEqual(errors,[]);console.log('Selected tabs, mobile filters, native light inputs and nested auth theme PASS');console.log('View navigation preserves identical KPI data PASS');await browser.close();
})().catch(e=>{console.error(e);process.exit(1)});
