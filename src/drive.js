import { DriveSalesStore, DRIVE_FOLDER_URL } from "./drive-store.js";
import { uploadProblem } from "./cloud-config.js";

// Browser Drive mode. The app obtains a short-lived token from Google's own
// consent window; it never saves Google access tokens in browser storage.
export function initDrive(api) {
  const clientId = String(import.meta.env.VITE_GOOGLE_CLIENT_ID || "").trim();
  const $ = (id) => document.getElementById(id);
  let store = null, accessToken = null, expiresAt = 0;
  let busy = false, pendingFile = null, lastRows = api.getData().rows;
  let activeId = null, activeModified = null, savePending = false;

  const notice = document.createElement("div");
  notice.className = "cloud-access-notice";
  notice.setAttribute("role", "status");
  const noticeText = document.createElement("span");
  const noticeAction = document.createElement("button");
  noticeAction.type = "button";
  noticeAction.className = "btn";
  noticeAction.textContent = "เชื่อม Google Drive";
  noticeAction.onclick = () => $("cloudAuth").click();
  notice.append(noticeText, noticeAction);
  document.querySelector("main")?.prepend(notice);

  const setMessage = (txt, error = false) => {
    const node = document.createElement("div");
    node.className = "cloud-notice" + (error ? " error" : "");
    node.textContent = txt;
    $("cloudMessage").replaceChildren(node);
  };
  const isConnected = () => !!store && !!accessToken && Date.now() < expiresAt - 30000;
  function render() {
    const d = api.getData();
    const connected = isConnected();
    $("cloudAuth").textContent = connected ? "เปลี่ยนบัญชี Google" : "เชื่อม Google Drive";
    $("cloudAuth").disabled = busy;
    $("cloudLibrary").disabled = busy;
    $("cloudLibrary").textContent = "เปิดโฟลเดอร์ Sales data";
    $("cloudSetup").disabled = busy;
    $("cloudSetup").textContent = "Google Drive";
    $("file").disabled = busy || !connected;
    $("cloudSave").hidden = !(d.origin === "local" && d.rows.length && pendingFile);
    $("cloudSave").disabled = busy || !connected;
    $("cloudSave").textContent = "บันทึกไฟล์ใหม่ลง Google Drive";
    $("cacheStatus").textContent = "ข้อมูลกลางอยู่ใน Google Drive · ทุกเครื่องต้องใช้บัญชี Google ที่เข้าถึงโฟลเดอร์นี้ได้";
    $("cloudStatus").textContent = busy
      ? "GOOGLE DRIVE · กำลังเชื่อมต่อหรือบันทึกข้อมูล"
      : connected
        ? d.origin === "cloud"
          ? "GOOGLE DRIVE · โหลดข้อมูลชุดล่าสุดแล้ว"
          : "GOOGLE DRIVE · เชื่อมต่อแล้ว · พร้อมอัปโหลดหรือโหลดชุดล่าสุด"
        : "GOOGLE DRIVE · ต้องเชื่อมบัญชี Google ที่ได้รับสิทธิ์";
    $("cloudStatus").classList.toggle("connected", connected);
    notice.hidden = connected && d.rows.length > 0;
    noticeText.textContent = connected
      ? "เชื่อม Google Drive แล้ว แต่ยังไม่มี Dataset ที่โหลดสำเร็จ · ลองโหลดข้อมูลล่าสุดอีกครั้ง"
      : "Dashboard นี้ใช้ Google Drive เป็นแหล่งข้อมูลกลาง · โปรดเชื่อม Google Account ที่ได้รับสิทธิ์โฟลเดอร์ Sales data";
    noticeAction.textContent = connected ? "โหลด Drive อีกครั้ง" : "เชื่อม Google Drive";
    noticeAction.onclick = connected ? restore : () => $("cloudAuth").click();
  }

  async function restore() {
    if (busy || !isConnected()) {render();return;}
    busy = true;
    render();
    setMessage("กำลังตรวจข้อมูลล่าสุดใน Google Drive…");
    try {
      const active = await store.readActive();
      if (!active) {
        api.clearData();
        activeId = null;
        activeModified = null;
        setMessage("ยังไม่พบ BIC_SALES_ACTIVE.json ในโฟลเดอร์ Sales data · กรุณาอัปโหลด Excel ที่เครื่องใดเครื่องหนึ่งก่อน");
        return;
      }
      const data = active.snapshot;
      api.loadData({
        rows:data.rows,
        source:data.source || data.sourceFileName || "Google Drive",
        cachedAt:data.uploadedAt,
        origin:"cloud",
        issues:data.issues || {},
        schema:data.schema || {}
      });
      lastRows = api.getData().rows;
      activeId = active.id;
      activeModified = active.modifiedTime;
      pendingFile = null;
      savePending = false;
      window.dispatchEvent(new CustomEvent("bic:snapshot",{
        detail:{id:active.id,name:data.source,row_count:data.rowCount,origin:"drive"}
      }));
      setMessage("อ่านข้อมูล " + data.rowCount.toLocaleString() + " แถวจาก Google Drive สำเร็จ · " + (data.sourceFileName || data.source));
    } catch (error) {
      setMessage("อ่าน Google Drive ไม่สำเร็จ · " + error.message, true);
      if (error.status === 401) {store=null;accessToken=null;api.clearData();}
    } finally {
      busy = false;
      render();
    }
  }

  function connectGoogle() {
    if (busy) return;
    if (!clientId) {
      setMessage("ยังไม่ได้ตั้งค่า Google OAuth Client ID ใน Vercel จึงไม่สามารถเชื่อมบัญชีได้", true);
      return;
    }
    const oauth = window.google?.accounts?.oauth2;
    if (!oauth?.initTokenClient) {
      setMessage("Google Sign-in กำลังโหลดหรือถูก Browser บล็อก กรุณาลองอีกครั้ง", true);
      return;
    }
    const tokenClient = oauth.initTokenClient({
      client_id:clientId,
      scope:"https://www.googleapis.com/auth/drive",
      callback: async (response) => {
        if (!response || response.error || !response.access_token) {
          setMessage("Google ไม่อนุญาตการเชื่อมต่อ · " + (response?.error || "ไม่ได้รับ Access token"), true);
          return;
        }
        accessToken = response.access_token;
        expiresAt = Date.now() + Number(response.expires_in || 3600) * 1000;
        store = new DriveSalesStore(accessToken);
        try {
          await store.verifyFolder();
          render();
          await restore();
        } catch (error) {
          store = null; accessToken = null; expiresAt = 0;
          api.clearData();
          setMessage("บัญชี Google ไม่มีสิทธิ์อ่านโฟลเดอร์ Sales data หรือยังไม่เปิด Google Drive API · " + error.message,true);
          render();
        }
      },
      error_callback: (error) => setMessage("เปิดหน้าต่าง Google ไม่สำเร็จ · " + (error?.type || "โปรดอนุญาต pop-up"),true)
    });
    tokenClient.requestAccessToken({prompt:"consent"});
  }

  async function saveFile() {
    if (busy || !pendingFile || !isConnected()) return;
    const sourceFile = pendingFile;
    const d = api.getData();
    if (d.origin !== "local" || !d.rows.length || d.isDemo) return;
    const problem = uploadProblem(d);
    if (problem) {setMessage(problem,true);render();return;}
    busy = true;
    render();
    setMessage("กำลังส่ง Excel ต้นฉบับและ Snapshot เข้า Google Drive · กรุณาอย่าปิดหน้านี้…");
    try {
      const done = await store.replaceWithFile(d,sourceFile);
      pendingFile = null;
      savePending = false;
      activeId = done.active.id;
      activeModified = done.active.modifiedTime;
      if (api.getData().rows === d.rows) {
        api.markCloudSaved?.(d.rows,done.snapshot.uploadedAt);
        window.dispatchEvent(new CustomEvent("bic:snapshot",{
          detail:{id:done.active.id,name:d.source,row_count:d.rows.length,origin:"drive"}
        }));
      }
      setMessage("บันทึก Google Drive สำเร็จ · " + d.rows.length.toLocaleString() + " แถว · ไฟล์ล่าสุดถูกแทนที่โดยไม่รวมยอดขายเก่า");
    } catch (error) {
      setMessage("อัปโหลด Google Drive ไม่สำเร็จ · ข้อมูล Snapshot เดิมยังคงอยู่ · " + error.message,true);
      if (error.status === 401) {store=null;accessToken=null;}
    } finally {
      busy = false;
      render();
    }
  }

  // Capture the source File before the existing POS parser resets the file input.
  $("file").addEventListener("change",(event) => {
    pendingFile = event.target.files?.[0] || null;
    savePending = !!pendingFile;
    render();
  },true);
  api.subscribe(() => {
    const d = api.getData();
    if (d.rows === lastRows) {render();return;}
    lastRows = d.rows;
    if (d.origin === "local" && d.rows.length && pendingFile && savePending) {
      savePending = false;
      setTimeout(saveFile,0);
    }
    render();
  });
  $("cloudAuth").onclick = connectGoogle;
  $("cloudSave").onclick = saveFile;
  $("cloudLibrary").onclick = () => window.open(DRIVE_FOLDER_URL,"_blank","noopener,noreferrer");
  $("cloudSetup").onclick = () => window.open(DRIVE_FOLDER_URL,"_blank","noopener,noreferrer");
  window.BIC_CLOUD = {
    context:()=>({mode:"drive",client:null,user:null,workspace:null,busy,currentId:activeId}),
    refresh:restore,
    refreshPublic:restore,
    open:restore,
    restore,
    setWorkspace:async()=>{throw Error("Drive mode ใช้การแชร์สิทธิ์บน Google Drive ไม่ใช่ Supabase Workspace");}
  };
  window.dispatchEvent(new CustomEvent("bic:cloud-context"));
  render();
}
