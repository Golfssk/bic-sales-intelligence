/** Product names stay unchanged; classification is computed at render time. */
export const GROUPS = [
  "Gelato & Ice Cream",
  "Slushy",
  "Coffee & Tea",
  "Bakery",
  "Fresh Coconut",
  "DSB Sauces & Condiments",
  "Other Beverages & Retail",
  "Unmapped / รอตรวจสอบ",
];
export const GROUP_COLORS = [
  "#1ed760",
  "#53d6c5",
  "#559ee8",
  "#eac26b",
  "#c58fdd",
  "#df9255",
  "#91a5ad",
  "#777777",
];
export const normalizeProduct = (name) =>
  String(name ?? "")
    .normalize("NFKC")
    .replace(/\u0e4d\u0e32/g, "ำ")
    .toLocaleLowerCase("en")
    .replace(/[–—−]/g, "-")
    .replace(/[\s\u200b\u00a0]+/g, "")
    .trim();
const EXACT = [
  [
    "Gelato & Ice Cream",
    [
      "เจลลาโต้เกาลัดซีอิ๊ว",
      "เจลลาโต้คาราเมลซีอิ๊ว + เต้าเจี้ยว",
      "เจลลาโต้พิสตาชิโอ",
      "เจลลาโต้เปียกปูนใบเตย",
      "เจลลาโต้โยเกิร์ต",
      "เจลลาโต้ชาไทย",
      "เจลลาโต้มะพร้าว",
      "เจลลาโต้ขนมเปี๊ยะไข่เค็ม",
      "ไอศกรีมรสซีอิ๊วดำ(ถ้วย)",
    ],
  ],
  [
    "Slushy",
    [
      "มะพร้าวสลัชซี่",
      "มะม่วงสลัชซี่",
      "กาแฟมะพร้าวสลัชซี่",
      "มัทฉะมะพร้าวสลัชซี่",
      "โกโก้มะพร้าวสลัชซี่",
    ],
  ],
  [
    "Coffee & Tea",
    ["อเมริกาโน่", "ลาเต้", "คาปูชิโน่", "มอคค่า", "มัทฉะลาเต้", "โกโก้"],
  ],
  [
    "Bakery",
    [
      "ครัวซองต์เนยสด",
      "ครัวซองต์สตอเบอรี่",
      "ครัวซองต์ช็อกโกแลต",
      "ครัวซอง นมสดฮอกไกโด",
    ],
  ],
  ["Fresh Coconut", ["มะพร้าวลูก laser 1ลูก"]],
  ["Other Beverages & Retail", ["สินค้า 17 บาท", "เบียร์ช้างใหญ่"]],
];
let overrides = new Map();
export function setMappingOverrides(mapping={}) {
  overrides = new Map(Object.entries(mapping).filter(([,group])=>GROUPS.includes(group)).map(([name,group])=>[normalizeProduct(name),group]));
  cache.clear();
}
const exactMap = new Map(
  EXACT.flatMap(([group, names]) =>
    names.map((name) => [normalizeProduct(name), group]),
  ),
);
// Specific product families outrank ingredients: gelato sauce flavours are not condiment bottles.
const RULES = [
  [
    "Gelato & Ice Cream",
    /^(?:เจลลาโต้|เจลาโต้|เจลาโต|gelato)|ไอศกรีม|ไอติม|icecream/i,
    "กลุ่มเจลลาโต้/ไอศกรีม",
  ],
  ["Slushy", /สลัช|สเลอป|slush/i, "ชื่อผลิตภัณฑ์สลัชซี่"],
  [
    "Bakery",
    /ครัวซอง|croissant|เบเกอรี่|คุกกี้|cookie|เค้ก|cake|บราวนี่|brownie|มัฟฟิน|muffin|ขนมปัง|bread/i,
    "กลุ่มเบเกอรี่",
  ],
  [
    "Fresh Coconut",
    /^มะพร้าว(?:ลูก|น้ำหอม(?:ลูก)?)(?:laser|เลเซอร์|\d|ลูก|$)|^freshcoconut/i,
    "มะพร้าวสดแบบลูก",
  ],
  [
    "Coffee & Tea",
    /^(?:อเมริกาโน่|อเมริกาโน|americano|ลาเต้|latte|คาปูชิโน่|cappuccino|มอคค่า|มอคคา|mocha|มัทฉะ|matcha|โกโก้|cocoa|กาแฟ|coffee|เอสเพรสโซ่|espresso|ชาไทย|ชาเขียว|ชาดำ|ชามะนาว|ชานม|ชาพีช|ชาอู่หลง)/i,
    "กลุ่มกาแฟ ชา และโกโก้",
  ],
  [
    "DSB Sauces & Condiments",
    /^(?:ซีอิ๊ว|เต้าเจี้ยว|ซอสหอยนางรม|ซอสเห็ดหอม|ซอสปรุงรส|ซอสพริก|ซอสยากินิกุ|น้ำจิ้มสุกี้|น้ำจิ้มไก่|น้ำจิ้มบ๊วย|น้ำจิ้มแจ่ว|น้ำจิ้มเต้าเจี้ยว|น้ำจิ้มซีฟู้ด|น้ำปลาวีแกน|น้ำปลา|soy(?:sauce)?|oystersauce|sriracha|yakiniku)|(?:คีโต|keto|วีแกน|vegan|เจ)(?:.*)(?:ซอส|น้ำจิ้ม|ซีอิ๊ว|น้ำปลา)/i,
    "ตระกูลซอส เครื่องปรุง คีโต/วีแกนตามแมปปิ้ง",
  ],
  [
    "Other Beverages & Retail",
    /^(?:น้ำดื่ม|น้ำแร่|เป๊ปซี่|pepsi|โค้ก|coke|coca-cola|สิงห์เลม่อนโซดา|สิงห์เลมอนโซดา|เอสเพลย์|estplay|มิรินด้า|mirinda|โออิชิ|oishi|จับใจ|ไวตามิ้ลค์|vitamilk|c-vit|cvit|ซีวิต|m-?150|กระทิงแดง|redbull|คาราบาวแดง|carabao|เบียร์ช้าง|สินค้า17บาท)/i,
    "กลุ่มเครื่องดื่มสำเร็จรูปและสินค้าปลีก",
  ],
];
const cache = new Map();
export function classifyProduct(name) {
  const key = normalizeProduct(name);
  if (cache.has(key)) return cache.get(key);
  let result;
  if(overrides.has(key)) return {group:overrides.get(key),method:'Workspace mapping',reason:'ผู้ดูแลกำหนดในทีม'};
  if (exactMap.has(key))
    result = {
      group: exactMap.get(key),
      method: "Exact mapping",
      reason: "ตรงกับชื่อที่ระบุ",
    };
  else {
    const rule = RULES.find(([, pattern]) => pattern.test(key));
    result = rule
      ? { group: rule[0], method: "Family rule", reason: rule[2] }
      : {
          group: GROUPS.at(-1),
          method: "Unmapped",
          reason: "ยังไม่มีหลักฐานจัดหมวดหมู่ — โปรดตรวจสอบ",
        };
  }
  cache.set(key, result);
  return result;
}
export function groupSales(rows, value) {
  const map = new Map(
    GROUPS.map((group) => [
      group,
      { group, sales: 0, normal: 0, returns: 0, rows: 0, products: new Set() },
    ]),
  );
  for (const row of rows) {
    const entry = map.get(classifyProduct(row.name).group),
      v = value(row);
    entry.sales += v;
    entry.rows++;
    entry.products.add(row.sku + "|" + row.name);
    if (row.status === "N") entry.normal += v;
    else entry.returns += v;
  }
  const result = [...map.values()]
    .filter((r) => r.rows > 0)
    .map((r) => ({ ...r, products: r.products.size }));
  const total = result.reduce((sum, r) => sum + r.sales, 0);
  return {
    total,
    groups: result.map((r) => ({
      ...r,
      share: total > 0 ? (r.sales / total) * 100 : null,
    })),
    negative: result.some((r) => r.sales < 0),
  };
}
