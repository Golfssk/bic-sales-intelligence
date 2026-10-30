import { sourceFieldValue, sourceUnit, conversionSummary } from "./unit-conversion.js";
export const DAY = 86400000;
export const total = (rows, field) => rows.reduce((n,r)=>n+(Number.isFinite(r[field])?r[field]:0),0);
export const billKey = r => JSON.stringify([r.store,r.doc,r.status]);
export function measures(rows,basis='inc') {
  const n=rows.filter(r=>r.status==='N'),y=rows.filter(r=>r.status==='Y');
  const sales=total(rows,basis), tc=new Set(n.map(r=>JSON.stringify([r.store,r.doc]))).size;
  const denominator=total(n,'beforeEx');
  return {sales,tc,ta:tc?sales/tc:null,qty:total(rows,'qty'),returns:total(y,basis),returnRate:total(n,basis)>0?Math.abs(total(y,basis))/total(n,basis)*100:null,discountRate:n.length&&n.every(r=>Number.isFinite(r.disc)&&Number.isFinite(r.beforeEx))&&denominator>0?total(n,'disc')/denominator*100:null};
}
export function reconcile(rows,schema={},issues={}) {
  const units=[...new Set(rows.map(r=>r.unit))].map(unit=>({unit,qty:total(rows.filter(r=>r.unit===unit),'qty')}));
  const rejected=['noDoc','date','number','status'].reduce((n,k)=>n+(issues[k]||0),0);
  const controls=Object.entries(schema.sourceTotals||{}).filter(([,v])=>Number.isFinite(v)).map(([field,expected])=>{
    const actual=rows.reduce((n,r)=>n+(Number.isFinite(sourceFieldValue(r,field))?sourceFieldValue(r,field):0),0),complete=rows.every(r=>Number.isFinite(sourceFieldValue(r,field)));
    return {field,expected,actual,complete,diff:actual-expected,pass:complete&&Math.abs(actual-expected)<=.05};
  });
  const sourceUnits=[...new Set(rows.map(sourceUnit))].map(unit=>({unit,qty:rows.filter(r=>sourceUnit(r)===unit).reduce((n,r)=>n+sourceFieldValue(r,'qty'),0)}));
  const vatRows=rows.filter(r=>Number.isFinite(r.vat));
  const vatErrors=vatRows.filter(r=>Math.abs(r.ex+r.vat-r.inc)>.05).length;
  return {units,sourceUnits,unitConversion:conversionSummary(rows),rejected,controls,vatRows:vatRows.length,vatErrors,rows:rows.length,products:new Set(rows.map(r=>r.name)).size,itemUnits:new Set(rows.map(r=>JSON.stringify([r.sku,r.name,r.unit]))).size,receipts:new Set(rows.map(billKey)).size,ex:total(rows,'ex'),inc:total(rows,'inc'),sourceUnambiguous:(issues.summary||0)<=1};
}
export function periodComparison(all,select,{from,to,basis='inc',mode='previous',customFrom,customTo,excludeLatest=false}) {
  let lo=Date.parse(from),hi=Date.parse(to);
  if(!Number.isFinite(lo)||!Number.isFinite(hi)||hi<lo||!all.length)return {available:false,reason:'เลือกช่วงวันที่ที่ถูกต้องและนำเข้าข้อมูล'};
  let min=Infinity,max=-Infinity;for(const r of all){min=Math.min(min,r.ms);max=Math.max(max,r.ms)}
  if(excludeLatest&&hi===max)hi-=DAY;
  if(hi<lo)return {available:false,reason:'ช่วงที่เลือกเหลือ 0 วันหลังตัดวันล่าสุด'};
  const span=hi-lo+DAY;
  let prevLo=mode==='week'?lo-7*DAY:lo-span,prevHi=mode==='week'?hi-7*DAY:lo-DAY;
  if(mode==='custom'){prevLo=Date.parse(customFrom);prevHi=Date.parse(customTo)}
  const current=measures(select(all,lo,hi),basis);
  if(!Number.isFinite(prevLo)||!Number.isFinite(prevHi)||prevHi<prevLo)return {available:false,current,reason:'เลือกช่วงเปรียบเทียบให้ถูกต้อง'};
  if(lo<min||hi>max||prevLo<min||prevHi>max)return {available:false,current,lo,hi,prevLo,prevHi,reason:'ข้อมูลที่โหลดไม่ครอบคลุมช่วงเปรียบเทียบ — ไม่แสดง 0% แทนข้อมูลที่ขาด'};
  const previous=measures(select(all,prevLo,prevHi),basis);
  const changes=Object.fromEntries(['sales','tc','ta','qty','returnRate','discountRate'].map(k=>[k,current[k]==null||previous[k]==null?null:k.endsWith('Rate')?current[k]-previous[k]:previous[k]===0?null:(current[k]-previous[k])/Math.abs(previous[k])*100]));
  return {available:true,current,previous,changes,lo,hi,prevLo,prevHi,equalDays:hi-lo===prevHi-prevLo,overlap:prevHi>=lo&&prevLo<=hi};
}
export function receipts(rows,basis='inc') {
  const m=new Map();for(const r of rows){const k=billKey(r);if(!m.has(k))m.set(k,{key:k,doc:r.doc,store:r.storeLabel,status:r.status,date:r.date,sales:0,lines:[]});const b=m.get(k);b.sales+=r[basis];b.lines.push(r)}
  return [...m.values()].sort((a,b)=>b.date.localeCompare(a.date)||b.sales-a.sales);
}
export function targetMatch(targets,scope) {
 if(!scope.full)return null;
 return targets.find(t=>t.from===scope.from&&t.to===scope.to&&t.basis===scope.basis)||null;
}
