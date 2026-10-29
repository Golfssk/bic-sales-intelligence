import Chart from 'chart.js/auto';
import './workbench.css';

const $=id=>document.getElementById(id);
const make=(tag,text,cls)=>{const n=document.createElement(tag);if(text!==undefined)n.textContent=text;if(cls)n.className=cls;return n};
const paths={overview:'M3 3h7v7H3z M14 3h7v7h-7z M3 14h7v7H3z M14 14h7v7h-7z',trends:'M3 3v18h18 M6 15l4-5 4 3 6-8',groups:'M12 3v9h9 A9 9 0 1 1 12 3 M15 3a9 9 0 0 1 6 6h-6z',details:'M8 5h13 M8 12h13 M8 19h13 M3 5h1 M3 12h1 M3 19h1',activity:'M3 12h4l3-8 4 16 3-8h4',compare:'M4 6h16 M16 2l4 4-4 4 M20 18H4 M8 14l-4 4 4 4',quality:'M12 3l9 4v6c0 4-5 7-9 9-4-2-9-5-9-9V7z M8 12l3 3 5-6',explore:'M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14 M15 15l7 7',workspace:'M16 21v-3a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v3 M9 10a4 4 0 1 0 0-8 4 4 0 0 0 0 8 M17 3a4 4 0 0 1 0 8 M22 21v-3a4 4 0 0 0-3-4',import:'M12 16V3 M7 8l5-5 5 5 M4 15v6h16v-6',help:'M9 9a3 3 0 1 1 5 2c-2 1-2 2-2 3 M12 18h.01 M12 22a10 10 0 1 0 0-20 10 10 0 0 0 0 20',menu:'M4 6h16 M4 12h16 M4 18h16',close:'M6 6l12 12 M18 6L6 18',chevron:'M14 5l-7 7 7 7',filter:'M4 7h16 M4 17h16 M8 3v8 M16 13v8'};
function icon(key){const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');for(const [k,v]of Object.entries({viewBox:'0 0 24 24',width:'20',height:'20',fill:'none',stroke:'currentColor','stroke-width':'1.7','stroke-linecap':'round','stroke-linejoin':'round','aria-hidden':'true'}))svg.setAttribute(k,v);const path=document.createElementNS(svg.namespaceURI,'path');path.setAttribute('d',paths[key]||paths.menu);svg.append(path);return svg}
function btn(key,text,cls='ux-nav-button'){const b=make('button',undefined,cls);b.type='button';b.append(icon(key),make('span',text));b.title=text;return b}
const tools=[['activity','สถานะข้อมูล','การซิงก์ Cloud และการนำเข้า'],['compare','เปรียบเทียบ','เทียบช่วงเวลาและเป้าหมายจริง'],['quality','คุณภาพข้อมูล','แหล่งที่มา หน่วย และนิยามตัวเลข'],['explore','เจาะสินค้าและบิล','ดูรายละเอียดภายใต้ตัวกรองเดียวกัน'],['workspace','ทีมและเป้าหมาย','พื้นที่ทำงาน สิทธิ์ และประวัติ'],['import','นำเข้า / บัญชี','อัปโหลดข้อมูลและจัดการการเชื่อมต่อ'],['help','วิธีใช้งาน','เริ่มต้นและเข้าใจตัวเลขบน Dashboard']];
const views=[['overview','ภาพรวม'],['trends','แนวโน้ม'],['groups','สัดส่วนสินค้า'],['details','รายละเอียด']];
export function initWorkbench(api){
 if(document.body.classList.contains('ux-workbench'))return;
 document.body.classList.add('ux-workbench');
 let currentView='overview',currentTool='activity',lastTrigger=null,lastHour=api.getView().hourDrill;
 const sidebar=$('sidebar'),main=document.querySelector('main'),nav=make('nav',undefined,'ux-navigation');nav.setAttribute('aria-label','เมนู Dashboard');
 sidebar.setAttribute('aria-label','เมนูหลักและเครื่องมือ');
 const navHeading=make('p','WORKSPACE','ux-nav-heading');nav.append(navHeading);
 for(const [key,label]of views){const b=btn(key,label);b.dataset.uxView=key;b.onclick=()=>showView(key);nav.append(b)}
 nav.append(make('p','เครื่องมือวิเคราะห์','ux-nav-heading'));
 for(const [key,label]of tools){const b=btn(key,label);b.dataset.uxTool=key;b.setAttribute('aria-haspopup','dialog');b.setAttribute('aria-controls','uxInspector');b.setAttribute('aria-expanded','false');b.onclick=()=>toggleTool(key,b);nav.append(b)}
 sidebar.append(nav);
 const collapse=btn('chevron','ย่อเมนูด้านข้าง','ux-collapse');collapse.id='uxNavToggle';collapse.setAttribute('aria-controls','sidebar');sidebar.append(collapse);
 let rail=false;try{rail=localStorage.getItem('bic.ui.rail.v1')==='true'}catch{}
 function setRail(value){rail=value;document.body.classList.toggle('ux-rail',rail);collapse.setAttribute('aria-expanded',String(!rail));collapse.title=rail?'ขยายเมนูด้านข้าง':'ย่อเมนูด้านข้าง';try{localStorage.setItem('bic.ui.rail.v1',String(rail))}catch{}requestAnimationFrame(resizeCharts)}
 collapse.onclick=()=>setRail(!rail);setRail(rail);

 const header=make('header',undefined,'ux-page-header');header.innerHTML='<div class="ux-page-heading"><p>DEK SOM BOON / RETAIL ANALYTICS</p><h2 id="uxPageTitle">ภาพรวมยอดขาย</h2></div>';
 const headerActions=make('div',undefined,'ux-header-actions');
 const health=btn('activity','ยังไม่มีข้อมูล','ux-status-button');health.id='uxHealth';health.setAttribute('aria-haspopup','dialog');health.onclick=()=>toggleTool('activity',health);
 const utility=btn('menu','เครื่องมือ','ux-header-button');utility.id='uxTools';utility.setAttribute('aria-haspopup','dialog');utility.onclick=()=>toggleTool(currentTool,utility);
 const upload=btn('import','นำเข้าข้อมูล','ux-header-button ux-primary');upload.id='uxUpload';upload.onclick=()=>openTool('import',upload);
 headerActions.append(health,utility,upload);header.append(headerActions);main.prepend(header);
 const viewbar=make('nav',undefined,'ux-viewbar');viewbar.setAttribute('aria-label','มุมมองข้อมูล');
 for(const [key,label]of views){const b=btn(key,label,'ux-view-button');b.dataset.uxView=key;b.onclick=()=>showView(key);viewbar.append(b)}
 const rangebar=document.querySelector('.rangebar');rangebar.before(viewbar);
 const sourceLine=make('p','', 'ux-source-line');sourceLine.id='uxSourceLine';rangebar.after(sourceLine);
 const context=make('div',undefined,'ux-active-context');context.hidden=true;context.id='uxActiveContext';sourceLine.after(context);
 const screenReaderStatus=make('p','','a11y');screenReaderStatus.setAttribute('role','status');main.append(screenReaderStatus);

 // Reuse the original nodes and their listeners. No duplicate forms, datasets or IDs.
 const drawer=make('dialog',undefined,'ux-inspector');drawer.id='uxInspector';drawer.setAttribute('aria-labelledby','uxInspectorTitle');drawer.setAttribute('aria-describedby','uxInspectorSubtitle');
 const head=make('div',undefined,'ux-inspector-head');head.innerHTML='<div><p class="ux-inspector-eyebrow">WORKSPACE TOOLS</p><h2 id="uxInspectorTitle">สถานะข้อมูล</h2><p id="uxInspectorSubtitle"></p></div>';
 const close=btn('close','ปิดแผงเครื่องมือ','ux-close');close.id='uxInspectorClose';close.setAttribute('aria-label','ปิดแผงเครื่องมือ');close.autofocus=true;close.onclick=()=>drawer.close();head.append(close);
 const tablist=make('div',undefined,'ux-inspector-tabs');tablist.setAttribute('role','tablist');tablist.setAttribute('aria-label','เครื่องมือวิเคราะห์');
 const toolBody=make('div',undefined,'ux-inspector-body');const panels=new Map();
 for(const [key,label]of tools){const tab=make('button',label);tab.type='button';tab.id='uxTab-'+key;tab.setAttribute('role','tab');tab.setAttribute('aria-controls','uxPanel-'+key);tab.setAttribute('aria-selected','false');tab.tabIndex=-1;tab.dataset.tool=key;tab.onclick=()=>selectTool(key);tablist.append(tab);const panel=make('section',undefined,'ux-tool-panel');panel.id='uxPanel-'+key;panel.setAttribute('role','tabpanel');panel.setAttribute('aria-labelledby',tab.id);panel.tabIndex=0;panel.hidden=true;panels.set(key,panel);toolBody.append(panel)}
 drawer.append(head,tablist,toolBody);document.body.append(drawer);
 const activity=panels.get('activity');const activitySummary=make('div',undefined,'ux-activity-summary');activitySummary.innerHTML='<span class="ux-inspector-eyebrow">CURRENT DATASET</span><strong id="uxActivitySource">ยังไม่มีไฟล์</strong><p id="uxActivityContext"></p>';activity.append(activitySummary);
 ['.cloud-actions','#cloudMessage','#message','#dataNotice'].forEach(selector=>{const el=document.querySelector(selector);if(el)activity.append(el)});
 for(const [key,id]of [['compare','biDecision'],['quality','biQuality'],['explore','biExplore'],['workspace','biWorkspace']]){const node=$(id);node.classList.add('ux-tool-content');panels.get(key).append(node);node.open=true;}
 const definitions=document.querySelector('.definitions');if(definitions)panels.get('quality').append(definitions);
 const filePanel=document.querySelector('.filterbody');panels.get('import').append(filePanel);filePanel.classList.add('ux-import-body');filePanel.querySelector('.mobile-import-close').onclick=()=>drawer.close();
 const note=make('p','เข้าสู่ระบบก่อนนำเข้าเพื่อบันทึกข้ามอุปกรณ์ · ไฟล์ใหม่จะแทนชุดล่าสุด ไม่บวกซ้ำ','ux-tool-note');panels.get('import').prepend(note);
 const oldToggle=$('toggleFilters');oldToggle.onclick=()=>toggleTool('import',oldToggle);oldToggle.setAttribute('aria-controls',drawer.id);oldToggle.setAttribute('aria-haspopup','dialog');
 const help=panels.get('help');help.innerHTML='<div class="ux-help-intro"><strong>เริ่มจากคำถาม ไม่ใช่จากเมนู</strong><p>เลือกข้อมูลเพียงครั้งเดียว แล้วใช้ร่วมกันทั้ง KPI กราฟ ตาราง และบิล</p></div>';
 const instructions=[['import','1. เตรียมข้อมูล','เข้าสู่ระบบ เลือกส่วนตัวหรือทีม แล้วอัปโหลด Excel/CSV รอให้สถานะแสดงว่าบันทึกบน Cloud สำเร็จ'],['overview','2. กำหนดขอบเขต','เปิดตัวกรองด้านบน เลือกช่วงวันที่ สาขา Group และประเภทรายการได้จากจุดเดียว'],['trends','3. หาช่วงเวลาสำคัญ','ไปที่แนวโน้ม เลือกค่าที่ต้องการ แล้วแตะจุดหรือแท่งรายชั่วโมงเพื่อดูสินค้าที่ขายในชั่วโมงนั้น'],['explore','4. เจาะให้ถึงบิล','แตะ Group ในกราฟวงกลม หรือเลือกสินค้าในเครื่องมือเจาะบิล รายการเต็มบิลอาจมากกว่ายอดที่ตรงตัวกรอง'],['quality','5. ตรวจความหมายก่อนสรุป','ดูฐาน VAT หน่วยสินค้า และผลเทียบต้นฉบับ — ขีดแปลว่าไม่มีฐานคำนวณ ไม่ใช่ศูนย์'],['workspace','6. ทำงานร่วมกัน','สร้างทีมและเพิ่มบัญชีสมาชิก ตั้งเป้าหมายจริง หรือคืนชุดข้อมูลย้อนหลังได้ตามสิทธิ์']];
 for(const [key,title,text]of instructions){const card=make('article',undefined,'ux-help-card');card.append(make('h3',title),make('p',text));const b=btn(paths[key]?key:'overview','ไปที่ส่วนนี้','ux-help-link');b.onclick=()=>{if(views.some(v=>v[0]===key)){drawer.close();showView(key);if(key==='overview')openFilters()}else selectTool(key)};card.append(b);help.append(card)}
 const suite=document.querySelector('.bi-suite');if(suite&&!suite.children.length)suite.remove();
 function selectTool(key){if(!panels.has(key))return;currentTool=key;const meta=tools.find(t=>t[0]===key);$('uxInspectorTitle').textContent=meta[1];$('uxInspectorSubtitle').textContent=meta[2];for(const [k,panel]of panels)panel.hidden=k!==key;for(const tab of tablist.children){const active=tab.dataset.tool===key;tab.setAttribute('aria-selected',String(active));tab.tabIndex=active?0:-1}toolBody.scrollTop=0;sidebar.querySelectorAll('[data-ux-tool]').forEach(b=>{b.classList.toggle('is-open',b.dataset.uxTool===key&&drawer.open);b.setAttribute('aria-expanded',String(b.dataset.uxTool===key&&drawer.open))});if(key==='workspace'&&drawer.open)window.dispatchEvent(new CustomEvent('bic:workspace-open'));}
 function openTool(key,trigger){lastTrigger=trigger||document.activeElement;if(!drawer.open){$('uxInspectorTitle').textContent=tools.find(t=>t[0]===key)?.[1]||'เครื่องมือ';drawer.showModal();document.body.classList.add('ux-inspector-open')}selectTool(key);oldToggle.setAttribute('aria-expanded',String(key==='import'));close.focus();}
 function toggleTool(key,trigger){if(drawer.open&&currentTool===key)drawer.close();else openTool(key,trigger)}
 drawer.addEventListener('close',()=>{document.body.classList.remove('ux-inspector-open');sidebar.querySelectorAll('[data-ux-tool]').forEach(b=>{b.classList.remove('is-open');b.setAttribute('aria-expanded','false')});oldToggle.setAttribute('aria-expanded','false');sidebar.classList.remove('open');lastTrigger?.isConnected&&lastTrigger.focus()});
 drawer.addEventListener('click',e=>{if(e.target!==drawer)return;const r=drawer.getBoundingClientRect();if(e.clientX<r.left||e.clientX>r.right||e.clientY<r.top||e.clientY>r.bottom)drawer.close()});
 tablist.addEventListener('keydown',e=>{const keys=['ArrowLeft','ArrowRight','Home','End'];if(!keys.includes(e.key))return;e.preventDefault();const buttons=[...tablist.children],i=buttons.indexOf(document.activeElement);const next=e.key==='Home'?0:e.key==='End'?buttons.length-1:(i+(e.key==='ArrowRight'?1:-1)+buttons.length)%buttons.length;selectTool(buttons[next].dataset.tool);buttons[next].focus();buttons[next].scrollIntoView({block:'nearest',inline:'nearest'})});
 function resizeCharts(){document.querySelectorAll('canvas').forEach(c=>Chart.getChart(c)?.resize())}
 function expandFold(el){if(el.dataset.mobileOpen!=='true')el.querySelector(':scope>.mobile-fold-toggle')?.click();}
 function showView(key){if(!views.some(v=>v[0]===key))return;currentView=key;document.body.dataset.uxView=key;
  $('kpis').hidden=key!=='overview';document.querySelector('.chartarea').hidden=!['overview','trends'].includes(key);$('groupChartPanel').hidden=key!=='groups';document.querySelector('.tablepanel').hidden=key!=='details';
  document.querySelectorAll('[data-ux-view]').forEach(b=>{const active=b.dataset.uxView===key;b.classList.toggle('is-active',active);if(active)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  const names={overview:'ภาพรวมยอดขาย',trends:'แนวโน้มและช่วงเวลาขาย',groups:'สัดส่วนยอดขายตาม Group',details:'รายละเอียดการขาย'};$('uxPageTitle').textContent=names[key];
  if(key==='trends')expandFold(document.querySelector('.chartarea'));if(key==='groups')expandFold($('groupChartPanel'));if(key==='details')expandFold(document.querySelector('.tablepanel'));
  document.querySelectorAll('.mobile-bottom-nav button').forEach(b=>{if(b.dataset.uxView===key)b.setAttribute('aria-current','page');else b.removeAttribute('aria-current')});
  screenReaderStatus.textContent='มุมมอง '+names[key];requestAnimationFrame(()=>requestAnimationFrame(resizeCharts));
 }
 const bottom=document.querySelector('.mobile-bottom-nav');bottom.replaceChildren();
 for(const [key,label]of views){const b=btn(key,({groups:'Group',details:'รายการ'})[key]||label,'ux-bottom-button');b.dataset.uxView=key;b.dataset.destination=key==='trends'?'mobileTrends':key==='groups'?'mobileGroups':key==='details'?'mobilePerformance':'overview';b.onclick=()=>{showView(key);main.scrollIntoView({block:'start',behavior:'instant'})};bottom.append(b)}
 const more=btn('menu','เครื่องมือ','ux-bottom-button');more.id='uxMobileTools';more.setAttribute('aria-haspopup','dialog');more.onclick=()=>toggleTool(currentTool,more);bottom.append(more);
 // The global filter remains one shared form, collapsed on desktop and mobile.
 const filters=document.querySelector('.global-filters'),filterToggle=filters.querySelector(':scope>.mobile-fold-toggle'),filterContent=filters.querySelector(':scope>.mobile-fold-content');
 function syncFilter(){const open=filters.dataset.mobileOpen==='true';filterToggle.setAttribute('aria-expanded',String(open));filterContent.inert=!open;}
 filterToggle.addEventListener('click',syncFilter);syncFilter();
 function openFilters(){if(filters.dataset.mobileOpen!=='true')filterToggle.click();filters.scrollIntoView({block:'start',behavior:'instant'})}
 const viewFilter=btn('filter','ตัวกรอง','ux-view-filter');viewFilter.id='uxOpenFilters';viewFilter.onclick=openFilters;viewbar.append(viewFilter);
 const toast=btn('activity','มีปัญหาเกี่ยวกับข้อมูล · เปิดดูรายละเอียด','ux-alert-toast');toast.hidden=true;toast.id='uxAlertToast';toast.onclick=()=>openTool('activity',toast);document.body.append(toast);
 let updateQueued=false;
 function scheduleUpdate(){if(updateQueued)return;updateQueued=true;queueMicrotask(()=>{updateQueued=false;updateContext()})}
 function updateContext(){const d=api.getData(),v=api.getView();const label=d.isDemo?'ข้อมูลจำลอง':d.origin==='cloud'?'บันทึกบน Cloud':d.origin==='cache'?'ข้อมูลจากแคช':d.rows.length?'ข้อมูลบนอุปกรณ์':'ยังไม่มีข้อมูล';health.querySelector('span').textContent=label;health.dataset.state=d.isDemo?'demo':d.origin==='cloud'?'cloud':'local';health.title='เปิดสถานะข้อมูลและการซิงก์';
  $('uxActivitySource').textContent=d.source||'ยังไม่ได้เลือกไฟล์';$('uxActivityContext').textContent=`${d.rows.length.toLocaleString('en-US')} รายการในชุด · ${label} · ใช้ทีละชุด ไม่บวกประวัติเก่า`;
  $('uxSourceLine').textContent=d.rows.length?`${d.source||'ชุดข้อมูลล่าสุด'}${d.isDemo?' · ข้อมูลจำลอง ไม่ใช่ยอดขายจริง':''}`:'เริ่มต้นโดยนำเข้าข้อมูล หรือเข้าสู่ระบบเพื่อเปิดชุดล่าสุด';
  const warning=!!$('dataNotice').querySelector('summary');document.querySelectorAll('[data-ux-tool="quality"]').forEach(b=>{b.dataset.attention=String(warning);b.title=warning?'คุณภาพข้อมูล · มีข้อควรตรวจ':'คุณภาพข้อมูล'});
  const error=$('cloudMessage').querySelector('.error')||$('message').querySelector('.error');toast.hidden=!error;toast.title=error?.textContent||'';health.classList.toggle('has-error',!!error);
  for(const delta of document.querySelectorAll('.kpi .delta'))if(delta.textContent.includes('ไม่มีข้อมูลช่วงก่อนหน้า'))delta.hidden=true;
  const active=api.getExplore();context.replaceChildren();const bits=[];if(active)bits.push('เจาะ '+(active.name||active.value));if(v.hourDrill!==null)bits.push(`ช่วง ${String(v.hourDrill).padStart(2,'0')}:00–${String(v.hourDrill).padStart(2,'0')}:59`);context.hidden=!bits.length;
  if(bits.length){context.append(make('span',bits.join(' · ')));if(active){const clear=make('button','ล้างการเจาะสินค้า/Group');clear.type='button';clear.onclick=()=>api.setExplore(null);context.append(clear)}if(v.hourDrill!==null){const clear=make('button','ล้างชั่วโมง');clear.type='button';clear.onclick=()=>$('clearHourDrill').click();context.append(clear)}}
  if(v.hourDrill!==null&&v.hourDrill!==lastHour)showView('details');lastHour=v.hourDrill;
 }
 api.subscribe(scheduleUpdate);for(const id of ['cloudMessage','message','dataNotice','cloudStatus'])new MutationObserver(scheduleUpdate).observe($(id),{childList:true,subtree:true,characterData:true});
 window.addEventListener('bic:explore',()=>openTool('explore',document.activeElement));window.addEventListener('bic:hour-selected',()=>showView('details'));
 window.addEventListener('resize',()=>{syncFilter();requestAnimationFrame(resizeCharts)});
 // Provide one entry point for contextual actions and tests, not another data store.
 window.BIC_UX={openTool,closeTool:()=>drawer.close(),showView,getState:()=>({view:currentView,tool:currentTool,open:drawer.open})};
 showView('overview');updateContext();
}
