import { hasIceCreamConversion } from "./unit-conversion.js";
import { measures, reconcile, periodComparison, receipts, targetMatch, billKey } from './bi-core.js';
import { GROUPS, classifyProduct, setMappingOverrides } from './product-groups.js';
import './bi.css';
const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const fmt=v=>v==null||!Number.isFinite(v)?'—':new Intl.NumberFormat('en-US',{minimumFractionDigits:1,maximumFractionDigits:1}).format(v);
const day=ms=>new Date(ms).toISOString().slice(0,10);
const dateTime=v=>v?new Date(v).toLocaleString('th-TH'):'ไม่ทราบ';
const $=id=>document.getElementById(id);
const row=(...cells)=>'<tr>'+cells.map(c=>'<td>'+c+'</td>').join('')+'</tr>';
const table=(headers,body)=>'<div class="bi-scroll"><table><thead>'+row(...headers.map(esc))+'</thead><tbody>'+body+'</tbody></table></div>';
const button=(id,text)=>`<button type="button" id="${id}" class="bi-btn">${esc(text)}</button>`;
export function initBI(api){
 let settings={mapping:{},targets:[],timeMeaning:'unverified'}, snapshot=null, explorerPage=0, bills=[], comparison=null;
 const root=document.createElement('section');root.className='bi-suite';root.setAttribute('aria-label','วิเคราะห์และตรวจสอบข้อมูล');
 root.innerHTML=`<details class="bi-panel" open id="biDecision"><summary><span class="bi-eyebrow">DECISION DESK</span><strong>ภาพรวมเพื่อการตัดสินใจ</strong><span>เปรียบเทียบช่วงเวลา · เป้าหมายจริงของทีม</span></summary><div class="bi-content"><div class="bi-controls"><label>เทียบกับ<select id="biCompare"><option value="previous">ช่วงก่อนหน้า จำนวนวันเท่ากัน</option><option value="week">เลื่อนย้อนหลัง 7 วัน</option><option value="custom">กำหนดช่วงเอง</option></select></label><label id="biCustomFrom" hidden>เริ่มช่วงเปรียบเทียบ<input id="biPrevFrom" type="date"></label><label id="biCustomTo" hidden>สิ้นสุดช่วงเปรียบเทียบ<input id="biPrevTo" type="date"></label></div><label class="bi-check"><input type="checkbox" id="biExclude"> ตัดวันล่าสุดของไฟล์ออกจากการเปรียบเทียบ (หากวันนั้นยังไม่ครบ)</label><div id="biComparison" aria-live="polite"></div><div id="biTarget" class="bi-callout"></div></div></details>
 <details class="bi-panel" id="biQuality"><summary><span class="bi-eyebrow">TRUST & DEFINITIONS</span><strong>ตรวจสอบตัวเลขและแหล่งข้อมูล</strong><span id="biQualityHint">ยอดต้นฉบับ · หน่วย · ฐาน VAT</span></summary><div class="bi-content" id="biAudit"></div></details>
 <details class="bi-panel" id="biExplore"><summary><span class="bi-eyebrow">EXPLORE</span><strong>เจาะสินค้าและบิล</strong><span>แตะ Group ในกราฟวงกลม หรือตารางเพื่อกรองทั้ง Dashboard</span></summary><div class="bi-content"><div id="biBreadcrumb" class="bi-callout"></div><div class="bi-controls"><label>เจาะสินค้า<select id="biProduct"><option value="">ทุกสินค้าในตัวกรอง</option></select></label><label>เจาะสาขา<select id="biStore"><option value="">ทุกสาขาในตัวกรอง</option></select></label></div><label>ค้นหาเลขบิล / สาขา<input id="biBillSearch" type="search" placeholder="ค้นหาในบิลที่ตรงตัวกรอง"></label><p class="bi-muted" id="biReceiptInfo"></p><div id="biBills"></div><div class="bi-pager">${button('biBillPrev','ก่อนหน้า')}<span id="biBillPage"></span>${button('biBillNext','ถัดไป')}</div></div></details>`;
 $('kpis').after(root);
 if(matchMedia('(max-width:760px)').matches)$('biDecision').open=false;
 const refresh=()=>render();
 ['biCompare','biPrevFrom','biPrevTo','biExclude'].forEach(id=>$(id).addEventListener('change',refresh));
 function render(){
  const d=api.getData(), v=api.getView(), m=measures(v.filtered,v.basis), custom=$('biCompare').value==='custom';
  $('biCustomFrom').hidden=$('biCustomTo').hidden=!custom;
  comparison=periodComparison(d.rows,api.selectRange,{...v,mode:$('biCompare').value,customFrom:$('biPrevFrom').value,customTo:$('biPrevTo').value,excludeLatest:$('biExclude').checked});
  const c=comparison;
  if(!c.available)$('biComparison').innerHTML=`<p class="bi-callout">${esc(c.reason)}</p>`;
  else{
   const metrics=[['sales','ยอดขายสุทธิ','THB'],['tc','บิลขายปกติ · TC','บิล'],['ta','ยอดเฉลี่ยต่อบิล · TA','THB/บิล'],['qty','จำนวนสุทธิ','หน่วยแสดงผล (ไอศกรีม UNIT → CUP)'],['returnRate','Return rate','%'],['discountRate','Discount rate','%']];
   $('biComparison').innerHTML=`<p class="bi-callout">ยอดขายสุทธิ ฿${fmt(c.current.sales)} · ${c.changes.sales==null?'ยังคำนวณการเปลี่ยนแปลงจากฐานเดิมไม่ได้':'เปลี่ยน '+fmt(c.changes.sales)+'% จากช่วงเทียบ'} · TC ${fmt(c.current.tc)} บิล · TA ฿${fmt(c.current.ta)}</p><p>ปัจจุบัน ${day(c.lo)} – ${day(c.hi)} · เทียบ ${day(c.prevLo)} – ${day(c.prevHi)}</p>`+table(['ตัวชี้วัด','ปัจจุบัน','ช่วงเทียบ','เปลี่ยนแปลง'],metrics.map(([key,label,unit])=>row(esc(label)+`<small>${esc(unit)}</small>`,fmt(c.current[key]),fmt(c.previous[key]),fmt(c.changes[key])+(c.changes[key]==null?'':key.endsWith('Rate')?' pp':'%'))).join(''))+`<p class="bi-muted">${!c.equalDays?'⚠ จำนวนวันต่างกัน ไม่ใช่การเทียบแบบเท่ากัน · ':''}${c.overlap?'⚠ ช่วงเวลาทับซ้อนกัน · ':''}การครอบคลุมอิงวันแรก–วันสุดท้ายในไฟล์ ไม่ยืนยันว่าไฟล์ไม่มีวันขาด ต้องตรวจความครบถ้วนจาก POS · ไม่อนุมานสาเหตุของการเพิ่ม/ลด</p>`;
  }
  const target=targetMatch(settings.targets,v);
  $('biTarget').textContent=target?`เป้าหมายทีม ฿${fmt(target.value)} · ทำได้ ${fmt(m.sales/target.value*100)}% · ส่วนต่าง ฿${fmt(m.sales-target.value)} · ใช้ช่วงวันที่และฐาน VAT เดียวกัน`:'ยังไม่มีเป้าหมายที่ตรงช่วงวันที่ / ฐาน VAT / ตัวกรองนี้ · ผู้ดูแลตั้งเป้าหมายจริงในระบบทีมได้ ไม่เฉลี่ยหรือสมมติเป้าหมายให้';
  renderAudit(d,v);renderExplore(d,v);
 }
 function renderAudit(d,v){
  const a=reconcile(d.rows,d.schema,d.issues), schema=d.schema, issues=d.issues, discount=measures(d.rows).discountRate;
  const controls=a.sourceUnambiguous&&a.controls.length?table(['ฟิลด์ต้นฉบับ','ยอดรวมแถวจริง','ยอดสรุปท้ายไฟล์','ผลต่าง','ผลตรวจ'],a.controls.map(c=>row(esc(c.field==='qty'?'qty · หน่วยต้นฉบับ':c.field),fmt(c.actual),fmt(c.expected),fmt(c.diff),c.pass?'ตรง (±0.05)':!c.complete?'ข้อมูลรายแถวไม่ครบ':'ไม่ตรง — ตรวจต้นฉบับ')).join('')):'<p class="bi-callout">ยังยืนยันยอดกับสรุปต้นฉบับไม่ได้: '+(a.sourceUnambiguous?'ไม่มีแถวสรุปท้ายไฟล์ที่ใช้เป็นตัวควบคุม':'พบสรุปหลายแถว ไม่ใช้ยอดใดแทนโดยคาดเดา')+' · ผลรวมบนหน้าเดียวกันไม่ใช่หลักฐานตรวจสอบอิสระ</p>';
  $('biQualityHint').textContent=`${fmt(a.rows)} แถวจริง · ${fmt(a.rejected)} จุดตัดแถว · ${a.controls.length&&a.sourceUnambiguous?a.controls.some(c=>!c.pass)?'พบผลต่างต้นฉบับ':'มีผลเทียบต้นฉบับ':'ยังไม่มีผลเทียบต้นฉบับ'}`;
  $('biAudit').innerHTML=`<p><strong>${esc(d.source||'ยังไม่มีไฟล์')}</strong> · ${esc(d.origin||'none')} ${d.isDemo?'· ข้อมูลตัวอย่าง ไม่ใช่ยอดจริง':''}</p><p class="bi-muted">เวลาแคช/บันทึก: ${esc(dateTime(d.cachedAt))} (ไม่ใช่วันที่ขาย)${snapshot&&d.origin==='cloud'?' · Snapshot: '+esc(snapshot.id)+' · ผู้อัปโหลด: '+esc(snapshot.owner_id||'ไม่ทราบ'):''}</p><p>ขอบเขตตรวจสอบ: <strong>ทั้งไฟล์</strong> ไม่ใช่เฉพาะตัวกรองปัจจุบัน · รับ ${fmt(a.rows)} แถว / ${fmt(a.products)} ชื่อสินค้า / ${fmt(a.itemUnits)} SKU+ชื่อ+หน่วย / ${fmt(a.receipts)} บิลแยก N และ Y</p>${controls}<h3>ตรวจ VAT รายแถว</h3><p>${a.vatRows?`${fmt(a.vatRows)} แถวมี VAT แยก · พบ ${fmt(a.vatErrors)} แถวที่ ex + VAT ไม่ตรง inc เกิน 0.05 บาท`:'ชุดนี้ไม่มี VAT แยก จึงยังตรวจสมการ ex + VAT = inc อย่างอิสระไม่ได้'}</p><h3>จำนวนสุทธิตามหน่วยแสดงผล</h3>${table(['หน่วยแสดงผล','จำนวนสุทธิ'],a.units.map(u=>row(esc(u.unit),fmt(u.qty))).join(''))}<p class="bi-callout">กฎไอศกรีม: 2 UNIT / UNI = 1 CUP · ${fmt(a.unitConversion.rows)} แถวแปลง ${fmt(a.unitConversion.sourceQty)} UNIT เป็น ${fmt(a.unitConversion.cupQty)} CUP สุทธิ · CUP เดิมและ G คงเดิม · ไม่เปลี่ยนยอดเงิน</p><h3>จำนวนตามหน่วยต้นฉบับ POS</h3>${table(['หน่วยต้นฉบับ','จำนวนต้นฉบับ'],a.sourceUnits.map(u=>row(esc(u.unit),fmt(u.qty))).join(''))}<p class="bi-muted">ตรวจจำนวนกับสรุปท้ายไฟล์โดยใช้ค่าต้นฉบับก่อนแปลง · เก็บ sourceQty / sourceUnit ทุกแถวที่แปลงไว้ตรวจย้อนหลัง · ไม่รวม G เป็น CUP · COUNTA คือจำนวนแถว ไม่ใช่ SUM จำนวนสินค้า</p><h3>ข้อควรตรวจ</h3><p>ไม่มีเลขเอกสาร ${fmt(issues.noDoc||0)} · วันที่/ตัวเลข/สถานะไม่ถูกต้อง ${fmt((issues.date||0)+(issues.number||0)+(issues.status||0))} · ไม่ระบุเวลา ${fmt(issues.time||0)} · คืนเป็นบวก ${fmt(issues.sign||0)} · แถวเหมือนกัน ${fmt(issues.duplicate||0)} (คงไว้ ไม่ลบเอง)</p><h3>นิยามที่ใช้</h3><ul><li>Sales = ยอดขาย N + ยอดคืน Y ตามเครื่องหมายต้นฉบับ</li><li>TC = เลขเอกสาร N ไม่ซ้ำแยกตามสาขา · TA = ยอดสุทธิ ÷ TC</li><li>Return rate = |มูลค่า Y| ÷ มูลค่า N บนฐาน VAT เดียวกัน</li><li>Discount rate = SUM ส่วนลด N ÷ SUM มูลค่าขายก่อนส่วนลด N แบบไม่รวม VAT ทั้งคู่ · ${discount==null?'ยังไม่มีฐานที่ครบ กรุณาอัปโหลดไฟล์ต้นฉบับใหม่':'มีฐานคำนวณครบ'}</li><li>เวลาในกราฟ: ${settings.timeMeaning==='sale'?'ผู้ดูแลยืนยันว่าเป็นเวลาขาย':settings.timeMeaning==='recorded'?'เวลาบันทึกรายการ ไม่ใช่เวลาซื้อของลูกค้า':'ยังไม่ยืนยันความหมายจาก POS — ห้ามสรุปว่าเป็นเวลาซื้อของลูกค้าจนกว่าจะยืนยัน'}</li></ul>${button('biExportAudit','ดาวน์โหลดผลตรวจ JSON')}`;
  $('biExportAudit').onclick=()=>download('dashboard-audit.json',JSON.stringify({generatedAt:new Date().toISOString(),source:d.source,scope:'whole imported file',snapshot:d.origin==='cloud'?(snapshot?.id||null):null,audit:a,issues,discountBasis:'ex VAT / ex VAT',timeMeaning:settings.timeMeaning},null,2),'application/json');
 }
 function renderExplore(d,v){
  const active=api.getExplore();$('biBreadcrumb').innerHTML=active?`เจาะ ${esc(active.name||active.value)} · อิงตัวกรองรวมทั้งหมด ${button('biClearExplore','ล้างการเจาะ กลับภาพรวม')}`:'ยังไม่ได้เจาะเพิ่มเติม · เลือกสินค้า/สาขาด้านล่าง หรือแตะ Group ใน Pie / ตาราง · ตัวกรองรวมยังทำงานร่วมกัน';
  if(active)$('biClearExplore').onclick=()=>api.setExplore(null);
  // Options follow the full imported dictionary so users can switch after cross-filtering.
  const products=[...new Map(d.rows.map(r=>[JSON.stringify([r.sku,r.name]),r])).entries()].sort((a,b)=>a[1].name.localeCompare(b[1].name,'th'));
  $('biProduct').innerHTML='<option value="">เลือกสินค้าเพื่อเจาะ</option>'+products.map(([key,r])=>`<option value="${esc(key)}">${esc(r.name)} · ${esc(r.sku)}</option>`).join('');
  $('biStore').innerHTML='<option value="">เลือกสาขาเพื่อเจาะ</option>'+[...new Map(d.rows.map(r=>[r.store,r.storeLabel])).entries()].map(([key,label])=>`<option value="${esc(key)}">${esc(label)}</option>`).join('');
  if(active?.kind==='sku')$('biProduct').value=JSON.stringify([active.value,active.name]);
  if(active?.kind==='store')$('biStore').value=active.value;
  bills=receipts(v.filtered,v.basis);renderBills();
 }
 function renderBills(){
  const q=$('biBillSearch').value.trim().toLocaleLowerCase();const found=bills.filter(b=>(b.doc+' '+b.store).toLocaleLowerCase().includes(q));const pages=Math.max(1,Math.ceil(found.length/20));explorerPage=Math.min(explorerPage,pages-1);
  const shown=found.slice(explorerPage*20,explorerPage*20+20);
  $('biReceiptInfo').textContent=`${fmt(found.length)} บิลที่ตรงตัวกรอง · ยอดในรายการนี้เป็นเฉพาะแถวที่กรอง · เปิดบิลเพื่อดูรายการเต็ม N หรือ Y แยกกัน`;
  $('biBills').innerHTML=table(['วันที่','บิล / สาขา','ประเภท','ยอดที่ตรงตัวกรอง'],shown.map((b,i)=>row(esc(b.date),`<button type="button" class="bi-link" data-bill="${i}">${esc(b.doc)}<small>${esc(b.store)}</small></button>`,esc(b.status),fmt(b.sales))).join('')||row('ยังไม่มีบิล','','',''));
  $('biBills').querySelectorAll('[data-bill]').forEach(el=>el.onclick=()=>openBill(shown[+el.dataset.bill]));
  $('biBillPage').textContent=`${explorerPage+1} / ${pages}`;$('biBillPrev').disabled=explorerPage===0;$('biBillNext').disabled=explorerPage>=pages-1;
 }
 function openBill(b){
  const v=api.getView(), all=api.getData().rows.filter(r=>billKey(r)===b.key), dialog=document.createElement('dialog');dialog.className='bi-dialog';
  dialog.innerHTML=`<div class="bi-dialog-head"><h2>บิล ${esc(b.doc)}</h2>${button('biCloseBill','ปิด')}</div><p>${esc(b.store)} · ${esc(b.status)} · ${esc(b.date)}</p><p class="bi-callout">ยอดที่ตรงตัวกรอง ฿${fmt(b.sales)} · ยอดเต็มบิล ฿${fmt(all.reduce((s,r)=>s+r[v.basis],0))} · ${v.basis==='inc'?'รวม':'ไม่รวม'} VAT</p><p class="bi-muted">รายการเต็มด้านล่างไม่จำกัดสินค้า/ชั่วโมงตามตัวกรอง เพื่อให้เห็นบริบทบิลเดิม · แสดงเฉพาะข้อมูลที่อยู่ในไฟล์ที่โหลด ไม่รับรองว่าเป็นใบเสร็จ POS ฉบับเต็ม</p>${table(['สินค้า / SKU','หน่วย','จำนวน','ยอด THB'],all.map(r=>row(esc(r.name)+'<small>'+esc(r.sku)+'</small>',esc(r.unit)+(hasIceCreamConversion(r)?'<small>ต้นฉบับ '+fmt(r.sourceQty)+' '+esc(r.sourceUnit)+' → '+fmt(r.qty)+' CUP</small>':''),fmt(r.qty),fmt(r[v.basis]))).join(''))}`;
  document.body.append(dialog);dialog.addEventListener('close',()=>dialog.remove());dialog.querySelector('button').onclick=()=>dialog.close();dialog.showModal();
 }
 $('biProduct').onchange=e=>{if(!e.target.value)return api.setExplore(null);const [value,name]=JSON.parse(e.target.value);explorerPage=0;api.setExplore({kind:'sku',value,name})};
 $('biStore').onchange=e=>{explorerPage=0;api.setExplore(e.target.value?{kind:'store',value:e.target.value}:null)};
 $('biBillSearch').oninput=()=>{explorerPage=0;renderBills()};$('biBillPrev').onclick=()=>{explorerPage--;renderBills()};$('biBillNext').onclick=()=>{explorerPage++;renderBills()};
 window.addEventListener('bic:explore',e=>{api.setExplore(e.detail);$('biExplore').open=true});
 $('groupShareBody').addEventListener('click',e=>{const r=e.target.closest('[data-bi-group]');if(r)window.dispatchEvent(new CustomEvent('bic:explore',{detail:{kind:'group',value:r.dataset.biGroup}}))});
 window.addEventListener('bic:snapshot',e=>{snapshot=e.detail;render()});
 window.addEventListener('bic:cloud-context',()=>{snapshot=null});
 api.subscribe(render);
 initWorkspace(api,config=>{settings=config;render()});render();
}
function download(name,content,type){const url=URL.createObjectURL(new Blob([content],{type})),a=document.createElement('a');a.href=url;a.download=name;a.click();setTimeout(()=>URL.revokeObjectURL(url),1000)}

function initWorkspace(api,onSettings){
 const root=document.createElement('details');root.className='bi-panel bi-workspace';root.id='biWorkspace';root.innerHTML='<summary><span class="bi-eyebrow">TEAM WORKSPACE</span><strong>ทีม เป้าหมาย และประวัติข้อมูล</strong><span>สิทธิ์ผู้ใช้ · แมปปิ้งกลาง · เปลี่ยนชุดล่าสุดย้อนหลัง</span></summary><div class="bi-content"><p id="biTeamMessage" role="status"></p><div id="biTeamBody"></div></div>';
 document.querySelector('main footer')?.before(root);if(!root.isConnected)document.querySelector('main').append(root);
 let generation=0, config={mapping:{},targets:[],timeMeaning:'unverified'},version=1,ctxKey='',working=false;
 const defaultConfig=()=>({mapping:{},targets:[],timeMeaning:'unverified'});
 const ctx=()=>window.BIC_CLOUD?.context()||{};
 function tell(message,error=false){$('biTeamMessage').textContent=message;$('biTeamMessage').className=error?'bi-error':'bi-muted'}
 async function run(fn){if(working)return;working=true;root.setAttribute('aria-busy','true');try{await fn()}catch(e){tell(e.message||String(e),true)}finally{working=false;root.removeAttribute('aria-busy')}}
 async function call(name,args){const {client}=ctx();const result=await client.rpc(name,args);if(result.error)throw result.error;return result.data}
 async function load(){
  const token=++generation,c=ctx(),key=(c.user?.id||'')+':'+(c.workspace?.id||'');
  if(ctxKey!==key){ctxKey=key;config=defaultConfig();setMappingOverrides({});onSettings(config);api.refresh()}
  if(!c.user||!c.client){$('biTeamBody').innerHTML='<p>เข้าสู่ระบบก่อนเพื่อเลือกพื้นที่ส่วนตัวหรือทีม · บทบาทตรวจสิทธิ์ที่ฐานข้อมูล ไม่ใช่แค่ซ่อนปุ่ม</p>'+button('biTeamLogin','เข้าสู่ระบบ');$('biTeamLogin').onclick=()=>$('cloudAuth')?.click();tell('ยังไม่ได้เข้าสู่ระบบ');return}
  tell('กำลังโหลดพื้นที่ทำงาน…');
  try{
   const results=await Promise.all([c.client.from('bic_workspaces').select('id,name'),c.workspace?c.client.from('bic_workspace_settings').select('config,version').eq('workspace_id',c.workspace.id).single():Promise.resolve({data:null})]);
   if(token!==generation)return;for(const r of results)if(r.error)throw r.error;
   config=results[1].data?.config||defaultConfig();version=results[1].data?.version||1;setMappingOverrides(config.mapping);onSettings(config);api.refresh();
   draw(c,results[0].data||[]);tell(c.workspace?`${c.workspace.name} · ${c.workspace.role} · การตั้งค่าเวอร์ชัน ${version}`:'พื้นที่ส่วนตัว · ไฟล์เดิมยังไม่แชร์ให้ทีม');
  }catch(e){if(token===generation){$('biTeamBody').innerHTML='<p>โหลดทีมไม่สำเร็จ โปรดตรวจการเชื่อมต่อ / migration</p>'+button('biTeamRetry','ลองโหลดใหม่');$('biTeamRetry').onclick=load;tell(e.message,true)}}
 }
 function draw(c,workspaces){
  const admin=c.workspace?.role==='admin',mayUpload=!c.workspace||['admin','uploader'].includes(c.workspace.role);
  $('biTeamBody').innerHTML=`<label>พื้นที่ทำงาน<select id="biWorkspaceSelect"><option value="">ส่วนตัว — ไม่แชร์</option>${workspaces.map(w=>`<option value="${esc(w.id)}">${esc(w.name)}</option>`).join('')}</select></label><p class="bi-muted">ทีมเห็นชุดล่าสุดร่วมกันเมื่อเลือกทีมเดียวกัน · บัญชีเดิมยังใช้พื้นที่ส่วนตัวเป็นค่าเริ่มต้น · การสร้างทีมไม่ย้ายไฟล์ส่วนตัว ต้องเลือกทีมแล้วอัปโหลดไฟล์ที่ตั้งใจแชร์ใหม่</p><details><summary>สร้างทีมใหม่</summary><form id="biCreateTeam"><label>ชื่อทีม<input name="name" maxlength="100" required></label><button class="bi-btn">สร้างทีม และเปิดพื้นที่ทีม</button></form></details>${c.workspace?`<p>สิทธิ์: Admin จัดการสมาชิก/เป้าหมาย/แมปปิ้ง · Uploader อัปโหลดและคืนชุดล่าสุด · Viewer ดูอย่างเดียว</p><details><summary>แมปปิ้งกลางและเป้าหมาย ${admin?'· แก้ไขได้':'· อ่านอย่างเดียว'}</summary><div id="biSettingsView"></div>${admin?`<form id="biMappingForm"><h3>กำหนด Group ตามชื่อ POS</h3><label>ชื่อสินค้าตาม POS<input name="product" list="biProductNames" maxlength="200" required></label><datalist id="biProductNames">${[...new Set(api.getData().rows.map(r=>r.name))].map(n=>`<option value="${esc(n)}">`).join('')}</datalist><label>Group<select name="group">${GROUPS.map(g=>`<option>${esc(g)}</option>`).join('')}</select></label><p class="bi-muted">ใช้กับทุก SKU ที่มีชื่อ normalized เดียวกัน ไม่เปลี่ยนยอดเงินหรือหน่วย · ลบ override เพื่อกลับกฎเดิม</p><button class="bi-btn">บันทึกแมปปิ้งกลาง</button></form><form id="biTargetForm"><h3>เป้าหมายยอดขายจริงของทีม</h3><div class="bi-controls"><label>เริ่ม<input name="from" type="date" required></label><label>สิ้นสุด<input name="to" type="date" required></label><label>ฐาน<select name="basis"><option value="inc">รวม VAT</option><option value="ex">ไม่รวม VAT</option></select></label><label>เป้าหมาย THB<input name="value" type="number" step="0.01" min="0.01" required></label></div><button class="bi-btn">บันทึกเป้าหมายตามช่วงนี้</button></form><form id="biTimeForm"><h3>ยืนยันความหมายของเวลา</h3><label>อ้างอิงจากระบบ POS<select name="time"><option value="unverified">ยังไม่ยืนยัน</option><option value="sale">เวลาขาย</option><option value="recorded">เวลาบันทึกรายการ</option></select></label><button class="bi-btn">บันทึกความหมายเวลา</button></form>`:''}</details>${admin?`<details><summary>จัดการสมาชิกทีม</summary><p class="bi-muted">ระบุอีเมลบัญชีที่มีอยู่แล้วใน Supabase Project นี้ · ไม่สร้างบัญชีหรือส่งคำเชิญเอง · ห้ามให้ Viewer ใช้บัญชี Admin ร่วมกัน</p><div id="biMemberList"></div><form id="biMemberForm"><label>อีเมล<input name="email" type="email" required></label><label>สิทธิ์<select name="role"><option value="viewer">Viewer — ดูอย่างเดียว</option><option value="uploader">Uploader — อัปโหลด</option><option value="admin">Admin — ผู้ดูแล</option><option value="remove">นำสมาชิกออก</option></select></label><button class="bi-btn">บันทึกสิทธิ์สมาชิก</button></form></details>`:''}<details><summary>ประวัติการเปลี่ยนแปลงทีม</summary>${button('biAuditLoad','โหลดประวัติล่าสุด')}<div id="biTeamAudit"></div></details>`:''}<details><summary>ชุดข้อมูลย้อนหลัง ${mayUpload?'· เลือกคืนเป็นชุดล่าสุดได้':'· ดูประวัติได้'}</summary><p class="bi-muted">เก็บประวัติ แต่ Dashboard ใช้ทีละ 1 ชุด ไม่บวกข้อมูลเก่า · การคืนชุดเก่ามีผลกับสมาชิกทั้งทีม</p>${button('biHistoryLoad','โหลดประวัติชุดข้อมูล')}<div id="biImportHistory"></div></details>`;
  $('biWorkspaceSelect').value=c.workspace?.id||'';
  $('biWorkspaceSelect').onchange=e=>run(async()=>{const id=e.target.value;let ws=null;if(id){const role=await call('bic_role',{p_workspace:id});ws={...workspaces.find(w=>w.id===id),role}}await window.BIC_CLOUD.setWorkspace(ws)});
  $('biCreateTeam').onsubmit=e=>{e.preventDefault();const name=new FormData(e.target).get('name').trim();if(!name)return;run(async()=>{const id=await call('bic_create_workspace',{p_name:name});await window.BIC_CLOUD.setWorkspace({id,name,role:'admin'})})};
  if(c.workspace){drawSettings(admin);if(admin){$('biTimeForm').elements.time.value=config.timeMeaning;
   $('biMappingForm').onsubmit=e=>{e.preventDefault();const f=new FormData(e.target),name=f.get('product').trim();if(!name)return;run(()=>save({...config,mapping:{...config.mapping,[name]:f.get('group')}}))};
   $('biTargetForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(f.from>f.to)return tell('วันเริ่มต้องไม่เกินวันสิ้นสุด',true);run(()=>save({...config,targets:[...config.targets.filter(t=>!(t.from===f.from&&t.to===f.to&&t.basis===f.basis)),{...f,value:Number(f.value)}]}))};
   $('biTimeForm').onsubmit=e=>{e.preventDefault();run(()=>save({...config,timeMeaning:new FormData(e.target).get('time')}))};
   $('biMemberForm').onsubmit=e=>{e.preventDefault();const f=Object.fromEntries(new FormData(e.target));if(!confirm(`ยืนยันเปลี่ยนสิทธิ์ ${f.email} เป็น ${f.role}?`))return;run(async()=>{await call('bic_set_member',{p_workspace:c.workspace.id,p_email:f.email,p_role:f.role});tell('บันทึกสิทธิ์แล้ว');await members()})};members().catch(e=>tell(e.message,true));
  }
  $('biAuditLoad').onclick=()=>run(async()=>{const {data,error}=await c.client.from('bic_audit').select('actor,action,details,created_at').eq('workspace_id',c.workspace.id).order('created_at',{ascending:false}).limit(30);if(error)throw error;$('biTeamAudit').innerHTML=table(['เวลา','ผู้กระทำ (ID)','กิจกรรม','รายละเอียด'],data.map(a=>row(esc(dateTime(a.created_at)),esc(a.actor),esc(a.action),'<details><summary>เปิดรายละเอียด</summary><pre>'+esc(JSON.stringify(a.details,null,2))+'</pre></details>')).join('')||row('ยังไม่มีประวัติ','','',''))});}
  $('biHistoryLoad').onclick=()=>run(async()=>{let query=c.client.from('bic_imports').select('id,name,row_count,owner_id,created_at,activated_at');query=c.workspace?query.eq('workspace_id',c.workspace.id):query.is('workspace_id',null);const {data,error}=await query.order('activated_at',{ascending:false}).limit(30);if(error)throw error;$('biImportHistory').innerHTML=table(['ไฟล์','นำเข้า / เปิดใช้ล่าสุด','จำนวนแถว','การทำงาน'],data.map((i,index)=>row(esc(i.name)+'<small>'+esc(i.owner_id)+'</small>',esc(dateTime(i.created_at))+'<small>'+esc(dateTime(i.activated_at))+'</small>',fmt(i.row_count),index===0?'ชุดล่าสุด':mayUpload?`<button class="bi-btn" type="button" data-restore="${esc(i.id)}">คืนเป็นชุดล่าสุด</button>`:'อ่านอย่างเดียว')).join('')||row('ยังไม่มีข้อมูล','','',''));$('biImportHistory').querySelectorAll('[data-restore]').forEach(b=>b.onclick=()=>{if(!confirm('ยืนยันคืนชุดนี้เป็นข้อมูลล่าสุด? ชุดที่บันทึกบน Cloud ยังอยู่ในประวัติ แต่ข้อมูลบนเครื่องที่ยังไม่อัปโหลดจะถูกแทน และสมาชิกทีมจะเห็นชุดที่เลือก'))return;run(async()=>{await window.BIC_CLOUD.restore(b.dataset.restore);tell('คืนชุดข้อมูลล่าสุดแล้ว');$('biImportHistory').replaceChildren()})})});
 }
 function drawSettings(admin){
  $('biSettingsView').innerHTML='<h3>แมปปิ้งที่ผู้ดูแลกำหนด</h3>'+table(['ชื่อ POS','Group',''],Object.entries(config.mapping).map(([name,group],i)=>row(esc(name),esc(group),admin?`<button class="bi-btn" type="button" data-unmap="${i}">กลับกฎเดิม</button>`:'')).join('')||row('ยังไม่มี override','',''))+'<h3>เป้าหมายตามช่วงเวลา</h3>'+table(['ช่วงวันที่ / ฐาน','THB',''],config.targets.map((t,i)=>row(esc(`${t.from} – ${t.to} · ${t.basis}`),fmt(t.value),admin?`<button class="bi-btn" type="button" data-target-remove="${i}">ลบ</button>`:'')).join('')||row('ยังไม่ตั้งเป้าหมาย','',''));
  $('biSettingsView').querySelectorAll('[data-unmap]').forEach(b=>b.onclick=()=>run(async()=>{const next={...config.mapping};delete next[Object.keys(config.mapping)[+b.dataset.unmap]];await save({...config,mapping:next})}));
  $('biSettingsView').querySelectorAll('[data-target-remove]').forEach(b=>b.onclick=()=>run(()=>save({...config,targets:config.targets.filter((_,i)=>i!==+b.dataset.targetRemove)})));
 }
 async function save(next){const c=ctx();await call('bic_save_settings',{p_workspace:c.workspace.id,p_config:next,p_version:version});await load();tell('บันทึกการตั้งค่ากลางแล้ว · มีประวัติก่อน/หลังให้ตรวจสอบ');}
 async function members(){const c=ctx(),key=c.workspace?.id;if(!key)return;const data=await call('bic_list_members',{p_workspace:key});if(ctx().workspace?.id!==key)return;$('biMemberList').innerHTML=table(['อีเมล','สิทธิ์'],data.map(m=>row(esc(m.email),esc(m.role))).join(''))}
 window.addEventListener('bic:cloud-context',load);
 window.addEventListener('bic:workspace-open',()=>{if(!working)load()});
 root.addEventListener('toggle',()=>{if(root.open)load()});
 // Refresh central settings after returning from another device/admin change.
 window.addEventListener('focus',()=>{if(root.open&&!working)load()});
 load();
}
