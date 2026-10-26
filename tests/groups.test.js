import {describe,it,expect} from 'vitest';
import {classifyProduct as c,groupSales,GROUPS} from '../src/product-groups';
const examples=[
 ['Gelato & Ice Cream','เจลลาโต้เกาลัดซีอิ๊ว|เจลลาโต้คาราเมลซีอิ๊ว + เต้าเจี้ยว|เจลลาโต้พิสตาชิโอ|เจลลาโต้เปียกปูนใบเตย|เจลลาโต้โยเกิร์ต|เจลลาโต้ชาไทย|เจลลาโต้มะพร้าว|เจลลาโต้ขนมเปี๊ยะไข่เค็ม|ไอศกรีมรสซีอิ๊วดำ(ถ้วย)'],
 ['Slushy','มะพร้าวสลัชซี่|มะม่วงสลัชซี่|กาแฟมะพร้าวสลัชซี่|มัทฉะมะพร้าวสลัชซี่|โกโก้มะพร้าวสลัชซี่'],
 ['Coffee & Tea','อเมริกาโน่|ลาเต้|คาปูชิโน่|มอคค่า|มัทฉะลาเต้|โกโก้'],
 ['Bakery','ครัวซองต์เนยสด|ครัวซองต์สตอเบอรี่|ครัวซองต์ช็อกโกแลต|ครัวซอง นมสดฮอกไกโด'],
 ['Fresh Coconut','มะพร้าวลูก laser 1ลูก'],
 ['DSB Sauces & Condiments','ซีอิ๊วขาว1 DSB 700ml|ซีอิ๊วขาวเห็ดหอม DSB 300ml|ซีอิ๊วดำ1 DSB|ซีอิ๊วดำฉลากส้ม|ซีอิ๊วหวาน DSB|เต้าเจี้ยว1|เต้าเจี้ยวรสเผ็ด|เต้าเจี้ยวเห็ดหอม|เต้าเจี้ยวฉลากฟ้า|ซอสหอยนางรม DSB|ซอสเห็ดหอม DSB|ซอสปรุงรสฝาเขียว DSB|ซอสปรุงรสฝาเหลือง DSB|น้ำจิ้มสุกี้กต.|น้ำจิ้มไก่|น้ำจิ้มบ๊วย|น้ำจิ้มแจ่ว|น้ำจิ้มเต้าเจี้ยว|ซีอิ๊วคีโต|น้ำปลาคีโต|น้ำจิ้มซีฟู้ดส์ คีโต|น้ำปลาวีแกน|น้ำจิ้มไก่เจ|ซอสพริกเจ|ซีอิ๊วเม็ด (แผงฟอยล์) DSB|ซอสพริกศรีราชาเผ็ด KAI|ซอสยากินิกุ DSB'],
 ['Other Beverages & Retail','น้ำดื่ม DSB 12x350ml|เป๊ปซี่|โค้ก|สิงห์เลม่อนโซดา รสมะนาว|เอส เพลย์|มิรินด้าส้ม|โออิชิ|จับใจ|ไวตามิ้ลค์|C-Vit|M-150|กระทิงแดง|คาราบาวแดง|เบียร์ช้างใหญ่|สินค้า 17 บาท']
];
describe('Auditable product mapping',()=>{
 for(const [group,names] of examples)for(const name of names.split('|'))it(name,()=>expect(c(name).group).toBe(group));
 it('normalizes spacing and retains specificity',()=>{expect(c(' เจลลาโต้คาราเมลซีอิ๊ว + เต้าเจี้ยว ').method).toBe('Exact mapping');expect(c('โกโก้มะพร้าวสลัชซี่ ขนาด L').group).toBe('Slushy')});
 it('does not guess unknown products',()=>expect(c('สินค้าใหม่ไม่รู้จัก').group).toBe(GROUPS.at(-1)));
 it('reconciles net totals, VAT, returns and unknowns',()=>{const rows=[{name:'ลาเต้',sku:'1',status:'N',inc:107,ex:100},{name:'ลาเต้',sku:'1',status:'Y',inc:-21.4,ex:-20},{name:'มะพร้าวสลัชซี่',sku:'2',status:'N',inc:53.5,ex:50},{name:'ใหม่',sku:'3',status:'N',inc:10.7,ex:10}];const a=groupSales(rows,r=>r.inc);expect(a.total).toBeCloseTo(149.8);expect(a.groups.reduce((s,g)=>s+g.share,0)).toBeCloseTo(100);expect(a.groups.find(g=>g.group==='Coffee & Tea').sales).toBeCloseTo(85.6);expect(groupSales(rows,r=>r.ex).total).toBe(140)});
 it('flags negative net groups; no false absolute-value pie',()=>{const a=groupSales([{name:'ลาเต้',sku:'1',status:'Y',inc:-100},{name:'โค้ก',sku:'2',status:'N',inc:200}],r=>r.inc);expect(a.negative).toBe(true);expect(a.groups[0].share).toBe(-100)});
});
