import { describe, it, expect, afterEach } from 'vitest';
import { convertIceCreamUnit, normalizeUnitRows, sourceFieldValue, conversionSummary, hasIceCreamConversion } from '../src/unit-conversion.js';
import { reconcile, measures } from '../src/bi-core.js';
import { uploadProblem } from '../src/cloud-config.js';
import { setMappingOverrides } from '../src/product-groups.js';
const row=(extra={})=>({doc:'QA',store:'01',name:'เจลลาโต้เกาลัดซีอิ๊ว',sku:'1',unit:'UNI',qty:6,status:'N',inc:321,ex:300,disc:3,beforeEx:303,vat:21,...extra});
afterEach(()=>setMappingOverrides({}));
describe('Owner-approved ice cream conversion',()=>{
 it.each(['UNI','UNIT','UNITS','unit',' Unit '])('converts %s at exactly 2 source units per CUP',unit=>{
  const original=row({unit}),converted=convertIceCreamUnit(original);expect(converted.unit).toBe('CUP');expect(converted.qty).toBe(3);expect(converted.sourceQty).toBe(6);expect(converted.sourceUnit).toBe(unit);expect(original.unit).toBe(unit);expect(original.qty).toBe(6);
 });
 it('keeps existing CUP, grams and unknown units unchanged',()=>{for(const unit of ['CUP','G','KG','PC','ไม่ระบุหน่วย']){const r=row({unit});expect(convertIceCreamUnit(r)).toBe(r)}});
 it('converts ice cream family names but never unrelated products or editable mapping alone',()=>{
  expect(convertIceCreamUnit(row({name:'Ice cream vanilla'})).qty).toBe(3);
  for(const name of ['ลาเต้','ซอสปรุงรสฝาเขียว','เสื้อ DSB'])expect(convertIceCreamUnit(row({name})).unit).toBe('UNI');
  setMappingOverrides({'เสื้อ DSB':'Gelato & Ice Cream'});expect(convertIceCreamUnit(row({name:'เสื้อ DSB'})).unit).toBe('UNI');
 });
 it('keeps signed returns, zero and fractional source quantities without rounding',()=>{
  for(const qty of [-3,0,1,3,.25])expect(convertIceCreamUnit(row({qty,status:qty<0?'Y':'N'})).qty).toBe(qty/2);
 });
 it('never converts a previously converted Cloud/cache row twice',()=>{
  const once=normalizeUnitRows([row()]);const again=normalizeUnitRows(JSON.parse(JSON.stringify(once)));expect(again[0].qty).toBe(3);expect(again[0].sourceQty).toBe(6);expect(normalizeUnitRows(again)).toBe(again);expect(hasIceCreamConversion(again[0])).toBe(true);
 });
 it('leaves all money, documents and receipt measures unchanged',()=>{
  const original=[row(),row({qty:-2,status:'Y',inc:-107,ex:-100})],converted=normalizeUnitRows(original);
  for(const field of ['inc','ex','disc','beforeEx','vat','doc','sku','status'])expect(converted.map(r=>r[field])).toEqual(original.map(r=>r[field]));
  const a=measures(original),b=measures(converted);for(const field of ['sales','tc','ta','returns','returnRate','discountRate'])expect(b[field]).toBe(a[field]);expect(b.qty).toBe(2);
 });
 it('reconciles raw source quantity with the file footer, not cup-equivalent totals',()=>{
  const rs=normalizeUnitRows([row(),row({unit:'CUP',qty:2}),row({unit:'G',qty:25})]);
  const schema={sourceTotals:{qty:33,inc:963,ex:900}};const audit=reconcile(rs,schema,{summary:1});expect(audit.controls.every(c=>c.pass)).toBe(true);expect(audit.units.find(u=>u.unit==='CUP').qty).toBe(5);expect(audit.sourceUnits.find(u=>u.unit==='UNI').qty).toBe(6);expect(uploadProblem({rows:rs,schema,issues:{summary:1}})).toBeNull();
  expect(uploadProblem({rows:rs,schema:{sourceTotals:{qty:30}},issues:{summary:1}})).toContain('ไม่แทนชุด Cloud เดิม');
 });
 it('does not trust a malformed conversion marker as raw-source evidence',()=>{
  const converted=convertIceCreamUnit(row());converted.sourceQty=100;expect(hasIceCreamConversion(converted)).toBe(false);expect(sourceFieldValue(converted,'qty')).toBe(converted.qty);
 });
 it('summarizes the applied conversion independently of untouched CUP or G rows',()=>{
  const s=conversionSummary(normalizeUnitRows([row({qty:3}),row({qty:-1,status:'Y'}),row({unit:'CUP',qty:4}),row({unit:'G',qty:200})]));expect(s.rows).toBe(2);expect(s.sourceQty).toBe(2);expect(s.cupQty).toBe(1);
 });
});
