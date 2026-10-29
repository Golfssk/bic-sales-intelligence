import {describe,it,expect} from 'vitest';
import {measures,reconcile,periodComparison,receipts,targetMatch} from '../src/bi-core';
const row=(date='2026-10-10',extra={})=>({date,ms:Date.parse(date),day:new Date(date).getUTCDay(),doc:'A',store:'01',storeLabel:'QA',status:'N',unit:'CUP',name:'ลาเต้',sku:'1',qty:2,ex:100,inc:107,vat:7,disc:10,beforeEx:110,...extra});
const select=(rs,lo,hi)=>rs.filter(r=>r.ms>=lo&&r.ms<=hi);
describe('BI definitions and comparisons',()=>{
 it('uses compatible ex-VAT discount bases',()=>expect(measures([row()]).discountRate).toBeCloseTo(10/110*100));
 it('does not manufacture a base for legacy rows',()=>expect(measures([row(undefined,{beforeEx:null})]).discountRate).toBeNull());
 it('separates stores and return receipts',()=>{const rs=[row(),row(undefined,{store:'02'}),row(undefined,{status:'Y',inc:-107,ex:-100,qty:-2})];expect(measures(rs).tc).toBe(2);expect(receipts(rs)).toHaveLength(3)});
 it('separates units and reports mismatched source controls',()=>{const r=reconcile([row(),row(undefined,{unit:'G',qty:30})],{sourceTotals:{inc:500}},{date:1});expect(r.units).toHaveLength(2);expect(r.controls[0].pass).toBe(false);expect(r.rejected).toBe(1)});
 it('reports independent VAT inconsistencies',()=>expect(reconcile([row(undefined,{vat:8})]).vatErrors).toBe(1));
 it('never substitutes zero for absent comparison windows',()=>expect(periodComparison([row()],select,{from:'2026-10-10',to:'2026-10-10'}).available).toBe(false));
 it('computes previous equal-day changes at full precision',()=>{const c=periodComparison([row('2026-10-09'),row('2026-10-10',{inc:214})],select,{from:'2026-10-10',to:'2026-10-10'});expect(c.available).toBe(true);expect(c.changes.sales).toBe(100)});
 it('handles zero denominators and unequal custom periods honestly',()=>{const c=periodComparison([row('2026-10-08',{inc:0}),row('2026-10-09',{inc:0}),row('2026-10-10')],select,{from:'2026-10-10',to:'2026-10-10',mode:'custom',customFrom:'2026-10-08',customTo:'2026-10-09'});expect(c.changes.sales).toBeNull();expect(c.equalDays).toBe(false)});
 it('matches targets only to full matching scope and VAT basis',()=>{const t=[{from:'a',to:'b',basis:'inc',value:100}];expect(targetMatch(t,{from:'a',to:'b',basis:'inc',full:false})).toBeNull();expect(targetMatch(t,{from:'a',to:'b',basis:'ex',full:true})).toBeNull();expect(targetMatch(t,{from:'a',to:'b',basis:'inc',full:true}).value).toBe(100)});
});
it('does not pass a zero source control using missing row fields',()=>expect(reconcile([row(undefined,{disc:null})],{sourceTotals:{disc:0}}).controls[0].pass).toBe(false));
