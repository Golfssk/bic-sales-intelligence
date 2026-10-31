import { sourceFieldValue } from "./unit-conversion.js";
// Public project identity only. Never put privileged API credentials here.
export const PROJECT_REF = "gknqdodyvejvdlaxucrs";
export const PROJECT_URL = `https://${PROJECT_REF}.supabase.co`;
// Browser-safe public key. RLS + authenticated sessions protect all sales records.
export const PROJECT_CONFIG = {url: PROJECT_URL, key: "sb_publishable_v7DCN7ph1tdxglL0w_Gx0w_ePuLm3F6"};

export function pickProjectConfig(stored, env) {
  // Do not reuse the old project's URL/key after migration.
  if (stored?.url === PROJECT_URL && stored.key) return stored;
  if (env?.url === PROJECT_URL && env.key) return env;
  return null;
}

export function uploadProblem(data) {
  if (data.isDemo) return "ข้อมูลจำลองไม่ถูกอัปโหลดขึ้น Cloud";
  if (!data.rows?.length) return "ยังไม่มีข้อมูลจริง กรุณาเลือกไฟล์ Excel / CSV";
  const rejected = ["noDoc", "date", "number", "status"].reduce(
    (sum, key) => sum + (Number(data.issues?.[key]) || 0), 0,
  );
  if (rejected)
    return `พบข้อมูลหลักไม่ถูกต้อง ${rejected} แถว จึงยังไม่แทนชุด Cloud เดิม กรุณาตรวจรายงานคุณภาพและแก้ไฟล์ก่อนอัปโหลดใหม่`;
  if ((data.issues?.summary || 0) <= 1) {
    const controls = Object.entries(data.schema?.sourceTotals || {}).filter(([,v])=>Number.isFinite(v));
    if (controls.some(([field,expected])=>!data.rows.every(r=>Number.isFinite(sourceFieldValue(r,field))) || Math.abs(data.rows.reduce((s,r)=>s+sourceFieldValue(r,field),0)-expected)>.05))
      return "ยอดรวมแถวจริงไม่ตรงหรือข้อมูลไม่ครบเทียบกับสรุปท้ายไฟล์ จึงยังไม่แทนชุด Cloud เดิม กรุณาตรวจผล Reconciliation";
  }
  if (data.rows.length > 250000)
    return "Cloud รองรับไม่เกิน 250,000 รายการต่อ Dataset";
  const periods = new Set(data.rows.map((row) => String(row.date || "").slice(0, 7)));
  if (periods.size !== 1 || !/^\d{4}-(0[1-9]|1[0-2])$/.test([...periods][0] || ""))
    return "กรุณาแยกข้อมูลเป็น Dataset รายเดือน โดยแต่ละชุดต้องมีวันที่อยู่ในเดือนเดียวกัน";
  return null;
}