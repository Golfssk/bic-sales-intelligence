// Google Drive is the canonical sales snapshot store when Drive mode is enabled.
// Tokens are kept in memory, never in localStorage or Supabase.
export const DRIVE_FOLDER_ID = "1Pk90DjApf0qqJ7pjK6RCMX53xqs0OrJM";
export const DRIVE_FOLDER_URL = "https://drive.google.com/drive/folders/" + DRIVE_FOLDER_ID;
export const DRIVE_ACTIVE_NAME = "BIC_SALES_ACTIVE.json";
export const DRIVE_SOURCE_PREFIX = "BIC_SALES_SOURCE_";
export const DRIVE_SNAPSHOT_FORMAT = "bic.sales.snapshot.v1";
const API = "https://www.googleapis.com/drive/v3";
const UPLOAD = "https://www.googleapis.com/upload/drive/v3";

function fileNameExtension(name) {
  const m = String(name || "").toLowerCase().match(/\.(xlsx|xls|csv)$/);
  return m ? m[0] : ".xlsx";
}

function sortFiles(files) {
  return [...files].sort((a,b) =>
    String(b.modifiedTime || "").localeCompare(String(a.modifiedTime || "")));
}

export function summarizeActiveFiles(files) {
  const all = (files || []).filter(f => f && !f.trashed);
  return {
    active: sortFiles(all.filter(f => f.name === DRIVE_ACTIVE_NAME))[0] || null,
    sources: sortFiles(all.filter(f => f.name && f.name.startsWith(DRIVE_SOURCE_PREFIX)))
  };
}

export function validateSalesSnapshot(snapshot) {
  if (!snapshot || snapshot.format !== DRIVE_SNAPSHOT_FORMAT ||
      !Array.isArray(snapshot.rows) || snapshot.rows.length === 0 ||
      snapshot.rowCount !== snapshot.rows.length ||
      !snapshot.rows.every(r => r && typeof r === "object" &&
        typeof r.date === "string" && /^\d{4}-\d{2}-\d{2}$/.test(r.date) &&
        typeof r.doc === "string" && ["N","Y"].includes(r.status) &&
        Number.isFinite(r.inc) && Number.isFinite(r.ex) && Number.isFinite(r.qty)))
    throw Error("ไฟล์ Dashboard ใน Drive ไม่ครบหรือไม่ตรงรูปแบบที่ระบบรองรับ");
  return snapshot;
}

function googleError(resp, detail) {
  let reason = typeof detail === "string" ? detail : detail?.error?.message;
  if (!reason) reason = "Google Drive API error";
  if (resp.status === 401) reason = "สิทธิ์ Google Drive หมดอายุ กรุณาเชื่อมต่อบัญชีอีกครั้ง";
  if (resp.status === 403) reason = "บัญชี Google นี้ไม่มีสิทธิ์ดำเนินการกับโฟลเดอร์ Sales data หรือ Google Drive API ยังไม่เปิดใช้งาน";
  if (resp.status === 404) reason = "ไม่พบโฟลเดอร์หรือไฟล์ Google Drive ที่อนุญาตให้เข้าถึง";
  const err = new Error(reason);
  err.status = resp.status;
  return err;
}

export class DriveSalesStore {
  constructor(accessToken, folderId = DRIVE_FOLDER_ID) {
    if (!accessToken) throw Error("กรุณาเชื่อมบัญชี Google ก่อน");
    this.token = accessToken;
    this.folderId = folderId;
  }
  async call(url, init = {}) {
    const headers = new Headers(init.headers || {});
    headers.set("Authorization", "Bearer " + this.token);
    const response = await fetch(url, {...init, headers, cache:"no-store"});
    if (!response.ok) {
      const detail = await response.json().catch(async () => await response.text().catch(() => ""));
      throw googleError(response,detail);
    }
    return response;
  }
  async verifyFolder(write = false) {
    const fields = "id,name,mimeType,trashed,capabilities(canAddChildren)";
    const url = API + "/files/" + encodeURIComponent(this.folderId) +
      "?fields=" + encodeURIComponent(fields);
    const folder = await (await this.call(url)).json();
    if (folder.trashed || folder.mimeType !== "application/vnd.google-apps.folder")
      throw Error("ปลายทาง Google Drive ไม่ใช่โฟลเดอร์ที่ใช้งานได้");
    if (write && folder.capabilities?.canAddChildren === false)
      throw Error("บัญชี Google นี้มีสิทธิ์อ่าน แต่ไม่สามารถอัปโหลดเข้าโฟลเดอร์ได้");
    return folder;
  }
  async listFiles() {
    const files = [];
    let next = "";
    do {
      const q = "'" + this.folderId.replace(/'/g,"\\'") + "' in parents and trashed = false";
      const params = new URLSearchParams({
        q, spaces:"drive", pageSize:"100",
        fields:"nextPageToken,files(id,name,mimeType,size,modifiedTime,trashed)"
      });
      if(next) params.set("pageToken",next);
      const response = await (await this.call(API + "/files?" + params)).json();
      files.push(...(response.files || []));
      next = response.nextPageToken || "";
    } while(next);
    return files;
  }
  async readActive() {
    await this.verifyFolder();
    const {active} = summarizeActiveFiles(await this.listFiles());
    if (!active) return null;
    const result = await this.call(API + "/files/" + encodeURIComponent(active.id) + "?alt=media");
    const snapshot = validateSalesSnapshot(await result.json());
    return {id:active.id, modifiedTime:active.modifiedTime, snapshot};
  }
  // Resumable sessions support raw Excel up to the parser's 40MB limit and
  // large JSON snapshots without going through Vercel's function body limits.
  async uploadBlob(blob, name, fileId = null) {
    const updating = !!fileId;
    const url = UPLOAD + "/files" + (updating ? "/" + encodeURIComponent(fileId) : "") +
      "?uploadType=resumable&fields=id,name,mimeType,modifiedTime,size";
    const mime = blob.type || "application/octet-stream";
    const metadata = updating ? {name} : {name,mimeType:mime,parents:[this.folderId]};
    const start = await this.call(url,{
      method: updating ? "PATCH" : "POST",
      headers:{
        "Content-Type":"application/json; charset=UTF-8",
        "X-Upload-Content-Type":mime,
        "X-Upload-Content-Length":String(blob.size)
      },
      body:JSON.stringify(metadata)
    });
    const location = start.headers.get("Location");
    if(!location || !location.startsWith("https://"))
      throw Error("Google Drive ไม่ส่ง Upload Session กลับมา โปรดตรวจ Google Drive API / CORS");
    const finished = await this.call(location,{method:"PUT",headers:{"Content-Type":mime},body:blob});
    return await finished.json();
  }
  async replaceWithFile(d, originalFile) {
    if (!originalFile) throw Error("ไม่พบ Excel ต้นฉบับ กรุณาเลือกไฟล์อีกครั้ง");
    await this.verifyFolder(true);
    const files = await this.listFiles();
    const found = summarizeActiveFiles(files);
    // Immutable source uploads keep the previous active snapshot's Excel
    // reference intact even if a later upload fails halfway through.
    const unique = new Date().toISOString().replace(/[:.]/g,"-") + "-" +
      crypto.randomUUID().slice(0,8);
    const sourceName = DRIVE_SOURCE_PREFIX + unique + fileNameExtension(originalFile.name);
    const source = await this.uploadBlob(originalFile,sourceName);
    const payload = {
      format:DRIVE_SNAPSHOT_FORMAT,
      source:d.source,
      sourceFileName:originalFile.name,
      sourceFileId:source.id,
      rowCount:d.rows.length,
      rows:d.rows,
      issues:d.issues || {},
      schema:d.schema || {},
      uploadedAt:new Date().toISOString()
    };
    validateSalesSnapshot(payload);
    const json = new Blob([JSON.stringify(payload)],{type:"application/json"});
    const active = await this.uploadBlob(json,DRIVE_ACTIVE_NAME,found.active?.id || null);
    return {snapshot:payload, active, source};
  }
}
