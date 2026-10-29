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
    if (controls.some(([field,expected])=>!data.rows.every(r=>Number.isFinite(r[field])) || Math.abs(data.rows.reduce((s,r)=>s+r[field],0)-expected)>.05))
      return "ยอดรวมแถวจริงไม่ตรงหรือข้อมูลไม่ครบเทียบกับสรุปท้ายไฟล์ จึงยังไม่แทนชุด Cloud เดิม กรุณาตรวจผล Reconciliation";
  }
  if (data.rows.length > 25000)
    return "Cloud รองรับไม่เกิน 25,000 รายการต่อชุด กรุณาแบ่งไฟล์";
  if (new TextEncoder().encode(JSON.stringify(data.rows)).byteLength > 4_900_000)
    return "ข้อมูล Cloud เกินขนาด 4.9 MB กรุณาแบ่งไฟล์";
  return null;
}