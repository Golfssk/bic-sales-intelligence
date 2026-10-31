import { createClient } from "@supabase/supabase-js";
import baseSQL from "../supabase/setup.sql?raw";
import teamSQL from "../supabase/migrations/20261030_bi_workspaces.sql?raw";
import monthlySQL from "../supabase/migrations/20261031_monthly_batched_imports.sql?raw";
const setupSQL=baseSQL+"\n"+teamSQL+"\n"+monthlySQL;
import { PROJECT_URL, PROJECT_CONFIG, pickProjectConfig, uploadProblem } from "./cloud-config.js";
const STORAGE = "bic.project.v1";
export function validateConfig(c) {
  let url;
  try {
    url = new URL(c.url);
  } catch {
    throw Error("Project URL ไม่ถูกต้อง");
  }
  if (url.protocol !== "https:") throw Error("Project URL ต้องเป็น HTTPS");
  if (
    url.pathname !== "/" ||
    url.search ||
    url.hash ||
    url.username ||
    url.password
  )
    throw Error("ใช้ URL หลักของ Supabase project");
  const key = String(c.key || "").trim();
  if (key.startsWith("sb_secret_"))
    throw Error("ห้ามใช้ Secret key ใช้ Publishable key เท่านั้น");
  if (key.startsWith("eyJ")) {
    try {
      const p = JSON.parse(
        atob(key.split(".")[1].replace(/-/g, "+").replace(/_/g, "/")),
      );
      if (p.role !== "anon") throw Error();
    } catch {
      throw Error("ใช้ anon key เท่านั้น ห้ามใช้ service_role");
    }
  } else if (!key.startsWith("sb_publishable_"))
    throw Error("ต้องใช้ sb_publishable_… หรือ legacy anon key");
  return { url: url.origin, key };
}
const el = (tag, text, cls) => {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  if (cls) e.className = cls;
  return e;
};
export function initCloud(api) {
  let client = null,
    user = null,
    config = null,
    library = [],
    currentId = null,
    lastRows = api.getData().rows,
    busy = false,
    generation = 0,
    subscription = null,
    pendingSave = false,
    saveFailed = false,
    restoring = false,
    workspace = null,
    scopeUser = null;
  const $ = (id) => document.getElementById(id),
    message = (text, error = false) => {
      const p = el("div", text, "cloud-notice" + (error ? " error" : ""));
      $("cloudMessage").replaceChildren(p);
    };
  const errorText = (e) =>
    ["42P01", "PGRST202", "PGRST205"].includes(e.code)
      ? "ยังไม่ได้สร้างฐานข้อมูล: เปิด Connect Supabase → Copy setup SQL แล้วรันใน SQL Editor"
      : e.code === "23505"
        ? "ชุดข้อมูลนี้บันทึกแล้ว กรุณาเปิดจาก Data library"
        : e.message || "เชื่อมต่อไม่สำเร็จ";
  const updateUI = () => {
    const d = api.getData();
    if (d.rows !== lastRows) {
      currentId = null;
      lastRows = d.rows;
    }
    const save = $("cloudSave");
    save.hidden = !!currentId || (!!user && !saveFailed) || d.isDemo;
    save.disabled = busy;
    save.textContent = !config ? "ตั้งค่า Cloud" : !user ? "เข้าสู่ระบบเพื่ออัปโหลด" : "ลองอัปโหลดอีกครั้ง";
    const viewer = workspace?.role === 'viewer';
    if(viewer) save.hidden=true;
    $("file").disabled = busy || viewer;
    $("cloudAuth").textContent = user ? "ออกจากระบบ" : "เข้าสู่ระบบ";
    $("cloudAuth").disabled = busy;
    $("cloudSetup").disabled = busy;
    $("cloudLibrary").disabled = busy;
    $("cloudStatus").textContent = busy
      ? "กำลังทำงาน…"
      : currentId
        ? "CLOUD · บันทึกชุดล่าสุดแล้ว · เปิดบนมือถือด้วยบัญชีเดียวกัน"
        : user
          ? "อัปโหลดอัตโนมัติพร้อมใช้งาน · " + user.email
          : config
            ? "เข้าสู่ระบบด้วยอีเมลและรหัสผ่านเพื่อใช้ข้อมูลข้ามอุปกรณ์"
            : "ยังไม่ได้เชื่อม Project ใหม่ · ข้อมูลยังอยู่บนเครื่องนี้";
    $("cloudStatus").classList.toggle("connected", !!user);
  };
  const makeDialog = (title) => {
    const d = el("dialog");
    const h = el("div", undefined, "dialog-head");
    h.append(el("h2", title));
    const close = el("button", "×", "dialog-close");
    close.setAttribute("aria-label", "ปิดหน้าต่าง");
    close.onclick = () => d.close();
    h.append(close);
    d.append(h);
    d.addEventListener("close", () => d.remove());
    document.body.append(d);
    d.showModal();
    return d;
  };
  async function refreshLibrary() {
    const gen = generation, activeClient = client;
    let query = activeClient
      .from("bic_imports")
      .select("id,name,row_count,meta,content_hash,period_key,created_at,activated_at,workspace_id,owner_id");
    query = workspace ? query.eq("workspace_id",workspace.id) : query.is("workspace_id",null);
    const {data,error} = await query
      .order("activated_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(120);
    if (error) throw error;
    if (gen !== generation) return [];
    library = data;
    return data;
  }
  function announceSession() {
    window.dispatchEvent(new CustomEvent("bic:cloud-context"));
    window.dispatchEvent(
      new CustomEvent("bic:session-ready", {
        detail: { project: (config?.url || PROJECT_URL)+(workspace ? "::team:"+workspace.id : ""), user: user?.id },
      }),
    );
  }
  async function chooseScope() {
    if(!user || scopeUser===user.id) return;
    const uid=user.id, gen=generation, activeClient=client;
    const preferred=localStorage.getItem('bic.workspace.'+uid);
    let next=null;
    if(preferred) {
      const {data,error}=await activeClient.from('bic_workspaces').select('id,name').eq('id',preferred).maybeSingle();
      if(error) throw error;
      if(gen!==generation || user?.id!==uid)return;
      if(data){const role=await activeClient.rpc('bic_role',{p_workspace:data.id}); if(role.error)throw role.error; if(role.data)next={...data,role:role.data};}
      else localStorage.removeItem('bic.workspace.'+uid);
    }
    if(gen!==generation || user?.id!==uid)return;
    workspace=next;scopeUser=uid;announceSession();
  }
  async function restoreCloud() {
    if (restoring || busy || !client || !user) return;
    restoring = true;
    const gen = generation, ref = api.getData().rows;
    try {
      await chooseScope();
      await refreshLibrary();
      if (gen !== generation) return;
      const d = api.getData();
      // Only a new, intentional import may replace cloud data. Never auto-push
      // cached rows based on device timestamps: device clocks can be wrong.
      if (d.origin === "local" && !d.isDemo && d.rows.length) {
        setTimeout(saveLatest, 0);
        return;
      }
      if (library.length && currentId !== library[0].id &&
          (d.rows === ref || d.origin === "cache") && d.origin !== "local")
        await openSnapshot(library[0], null, true);
    } catch (e) {
      if (gen === generation) message(errorText(e), true);
    } finally {
      if (gen === generation) restoring = false;
    }
  }

  async function connect(c) {
    generation++;
    subscription?.unsubscribe();
    if (client) client.auth.stopAutoRefresh();
    config = c;
    scopeUser = null;
    user = null;
    currentId = null;
    library = [];
    busy = false;
    restoring = false;
    pendingSave = false;
    saveFailed = false;
    if (!c) {
      client = null;
      updateUI();
      announceSession();
      return;
    }
    client = createClient(c.url, c.key, {
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        detectSessionInUrl: true,
      },
    });
    const my = generation;
    const { data } = client.auth.onAuthStateChange((event, session) => {
      if (my !== generation) return;
      const old = user;
      user = session?.user || null;
      if (event === "SIGNED_OUT" && old) {
        workspace=null; scopeUser=null;
        api.clearData();
        library = [];
        currentId = null;
      }
      updateUI();
      // Auth callbacks must not await another Supabase request inside the auth lock.
      if (event === "SIGNED_OUT") {
        announceSession();
      }
      if (event === "SIGNED_IN" && old?.id !== user?.id) {
        if (old && old.id !== user?.id) api.clearData();
        setTimeout(() => restoreCloud(), 0);
      }
    });
    subscription = data.subscription;
    const { data: session, error } = await client.auth.getSession();
    if (my !== generation) return;
    if (error) throw error;
    user = session.session?.user || null;
    updateUI();
    if(!user) announceSession();
    if (user) {
      await restoreCloud();
    }
  }
  function setupDialog() {
    const d = makeDialog("Connect your workspace.");
    d.append(
      el(
        "p",
        "Project ใหม่: gknqdodyvejvdlaxucrs · ใช้ Publishable key หรือ anon key เท่านั้น ไม่ใช้ Secret key",
        "dialog-copy",
      ),
    );
    const step1 = el("div", undefined, "dialog-step");
    step1.append(el("strong", "01 · Create project & database"));
    const p = el(
      "p",
      "Project นี้ติดตั้งแล้ว ไม่ต้องรัน SQL อีก · SQL ด้านล่างใช้เฉพาะฐานข้อมูลว่างครั้งแรกเท่านั้น ห้ามรันซ้ำกับฐานที่มีระบบทีม ให้ใช้ migration ตาม README",
    );
    const a = el("a", "เปิด Supabase dashboard");
    a.href = "https://supabase.com/dashboard";
    a.target = "_blank";
    a.rel = "noreferrer";
    step1.append(p, a);
    const buttons = el("div", undefined, "dialog-buttons");
    const copy = el("button", "Copy setup SQL", "btn");
    copy.onclick = async () => {
      try {
        await navigator.clipboard.writeText(setupSQL);
        copy.textContent = "Copied ✓";
      } catch {
        note.textContent = "คัดลอกไม่ได้ กรุณาใช้ Download SQL";
      }
    };
    const dl = el("button", "Download SQL", "btn");
    dl.onclick = () => {
      const url = URL.createObjectURL(
          new Blob([setupSQL], { type: "text/plain" }),
        ),
        a = el("a");
      a.href = url;
      a.download = "bic-setup.sql";
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    };
    buttons.append(copy, dl);
    step1.append(buttons);
    d.append(step1);
    const step2 = el("div", undefined, "dialog-step");
    step2.append(
      el("strong", "02 · Auth configuration"),
      el(
        "p",
        "เปิด Email provider แล้วไป Authentication → Users → Add user → Create new user ตั้งอีเมลและรหัสผ่าน ยืนยันอีเมลสำหรับบัญชีที่ผู้ดูแลตรวจสอบแล้ว แอปไม่เปิดสมัครบัญชีสาธารณะ",
      ),
    );
    d.append(step2);
    const form = el("form");
    const field = (title, type, value, placeholder) => {
      const l = el("label", title, "dialog-field"),
        i = el("input");
      i.type = type;
      i.value = value || "";
      i.placeholder = placeholder;
      i.required = true;
      i.autocomplete = "off";
      l.append(i);
      form.append(l);
      return i;
    };
    const url = field(
        "Project URL",
        "url",
        PROJECT_URL,
        PROJECT_URL,
      ),
      key = field("Publishable key", "text", config?.key, "sb_publishable_…");
    key.spellcheck = false;
    url.readOnly = true;
    const note = el("p", "", "dialog-copy");
    const actions = el("div", undefined, "dialog-buttons"),
      save = el("button", "Save connection", "btn primary");
    save.type = "submit";
    const clear = el("button", "ล้างการตั้งค่า", "btn");
    clear.type = "button";
    clear.onclick = async () => {
      try {
        if (client) {
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw error;
        }
        localStorage.removeItem(STORAGE);
        api.clearData();
        await connect(null);
        d.close();
        message(
          "ล้างการตั้งค่าใน browser แล้ว (หากตั้ง env บน Vercel ต้องแก้ที่ Vercel ด้วย)",
        );
      } catch (e) {
        note.textContent = errorText(e);
      }
    };
    actions.append(save, clear);
    form.append(note, actions);
    form.onsubmit = async (e) => {
      e.preventDefault();
      save.disabled = true;
      try {
        const c = validateConfig({
          url: url.value.trim(),
          key: key.value.trim(),
        });
        if (client) {
          const { error } = await client.auth.signOut({ scope: "local" });
          if (error) throw error;
        }
        localStorage.setItem(STORAGE, JSON.stringify(c));
        api.clearData();
        await connect(c);
        d.close();
        authDialog();
      } catch (e) {
        note.textContent = errorText(e);
      } finally {
        save.disabled = false;
      }
    };
    d.append(
      form,
      el(
        "p",
        "เมื่อเข้าสู่ระบบแล้ว ไฟล์จริงที่นำเข้าและผ่านการตรวจจะอัปโหลดอัตโนมัติ ทุกอุปกรณ์ใช้ Project ใหม่เดียวกันโดยอัตโนมัติ",
        "small",
      ),
    );
  }
  function authDialog() {
    if (!client) { setupDialog(); return; }
    const d = makeDialog("เข้าสู่ระบบเด็กสมบูรณ์");
    d.append(el("p", "ใช้อีเมลและรหัสผ่านที่สร้างไว้ใน Project ใหม่ · ไม่ต้องรอลิงก์อีเมล ไฟล์ใหม่จะบันทึกขึ้น Cloud อัตโนมัติ", "dialog-copy"));
    const form = el("form"), emailLabel = el("label", "อีเมล", "dialog-field"), input = el("input"),
      passwordLabel = el("label", "รหัสผ่าน", "dialog-field"), password = el("input"),
      note = el("p", "", "dialog-copy"), button = el("button", "เข้าสู่ระบบ", "btn primary");
    input.id = "cloudEmail"; input.type = "email"; input.autocomplete = "username";
    input.required = true; input.placeholder = "you@company.com";
    password.id = "cloudPassword"; password.type = "password";
    password.autocomplete = "current-password"; password.required = true;
    emailLabel.append(input); passwordLabel.append(password);
    note.setAttribute("role", "alert"); button.type = "submit";
    form.append(emailLabel, passwordLabel,
      el("p", "จดจำการเข้าสู่ระบบในเบราว์เซอร์นี้ · ออกจากระบบเมื่อใช้เครื่องร่วมกับผู้อื่น", "dialog-copy"), note, button);
    form.onsubmit = async (event) => {
      event.preventDefault(); button.disabled = true;
      try {
        const gen = generation, activeClient = client;
        const { data, error } = await activeClient.auth.signInWithPassword({ email: input.value.trim(), password: password.value });
        password.value = "";
        if (error) throw error;
        if (gen !== generation) return;
        user = data.user; updateUI(); d.close();
        message("เข้าสู่ระบบแล้ว · ไฟล์ใหม่จะอัปโหลดอัตโนมัติ");
        setTimeout(restoreCloud, 0);
      } catch (error) {
        password.value = "";
        note.textContent = error.code === "invalid_credentials" || /Invalid login credentials/i.test(error.message)
          ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง ตรวจว่ามีบัญชีนี้ใน Project ใหม่แล้ว" : errorText(error);
      } finally { button.disabled = false; }
    };
    d.append(form);
  }
  async function openSnapshot(item, dialog, automatic = false) {
    if (busy) return;
    busy = true;
    const gen = generation, activeClient = client,
      ref = api.getData().rows;
    updateUI();
    try {
      const rows = [];
      for (let start = 0; start < item.row_count; start += 1000) {
        if (gen !== generation) return;
        const { data, error } = await activeClient
          .from("bic_sales_rows")
          .select("payload")
          .eq("import_id", item.id)
          .order("id", { ascending: true })
          .range(start, start + 999);
        if (error) throw error;
        if (!data.length) throw Error("ข้อมูลไม่ครบหรือไม่มีสิทธิ์เข้าถึง");
        rows.push(...data.map((r) => r.payload));
      }
      if (
        gen !== generation ||
        (automatic &&
          api.getData().rows !== ref &&
          api.getData().origin !== "cache")
      )
        return;
      if (rows.length !== item.row_count)
        throw Error("จำนวนแถวไม่ตรงกับชุดข้อมูล");
      api.loadData({
        rows,
        source: item.name,
        cachedAt: item.activated_at || item.created_at,
        origin: "cloud",
        issues: item.meta?.issues || {},
        schema: item.meta?.schema || {},
      });
      lastRows = api.getData().rows;
      currentId = item.id;
      saveFailed = false;
      window.dispatchEvent(new CustomEvent('bic:snapshot',{detail:item}));
      dialog?.close();
      message("เปิดชุดข้อมูลจาก Supabase แล้ว");
    } catch (e) {
      if (gen === generation) message(errorText(e), true);
    } finally {
      if (gen !== generation) return;
      busy = false;
      updateUI();
      if (pendingSave) {
        pendingSave = false;
        setTimeout(saveLatest, 0);
      }
    }
  }
  async function openSnapshots(items, dialog) {
    if (busy || !items.length) return;
    if (items.length > 12) { message("เลือกได้ไม่เกิน 12 เดือนต่อครั้ง", true); return; }
    const periods = items.map(x => x.period_key).filter(Boolean);
    if (new Set(periods).size !== periods.length) { message("เลือก Dataset ซ้ำเดือน กรุณาเลือกเวอร์ชันเดียวต่อเดือน", true); return; }
    busy = true;
    const gen = generation, activeClient = client, rows = [];
    updateUI();
    try {
      const issues = {};
      const sourceTotals = {};
      for (const item of [...items].sort((a,b) => String(a.period_key).localeCompare(String(b.period_key)))) {
        const itemStart = rows.length;
        for (let start = 0; start < item.row_count; start += 1000) {
          if (gen !== generation) return;
          const { data, error } = await activeClient.from("bic_sales_rows").select("payload")
            .eq("import_id", item.id).order("id", {ascending:true}).range(start,start+999);
          if (error) throw error;
          if (!data.length) throw Error("ข้อมูลไม่ครบหรือไม่มีสิทธิ์เข้าถึง");
          rows.push(...data.map(x => x.payload));
        }
        if (rows.length - itemStart !== item.row_count) throw Error("จำนวนแถวไม่ตรงกับชุดข้อมูล");
        for (const [k,v] of Object.entries(item.meta?.issues || {})) issues[k]=(issues[k]||0)+(Number(v)||0);
        for (const [k,v] of Object.entries(item.meta?.schema?.sourceTotals || {})) {
          if (Number.isFinite(v)) sourceTotals[k]=(sourceTotals[k]||0)+v;
        }
      }
      const expected = items.reduce((n,x)=>n+x.row_count,0);
      if (rows.length !== expected) throw Error("จำนวนแถวรวมไม่ตรงกับ Dataset ที่เลือก");
      if (gen !== generation) return;
      const sorted = [...items].sort((a,b)=>String(a.period_key).localeCompare(String(b.period_key)));
      api.loadData({rows,source:sorted.map(x=>x.period_key || x.name).join(" + "),origin:"cloud",
        cachedAt:new Date().toISOString(),issues,schema:{...(sorted[0]?.meta?.schema || {}),sourceTotals}});
      lastRows=api.getData().rows; currentId=null; saveFailed=false;
      window.dispatchEvent(new CustomEvent("bic:snapshot",{detail:{monthly:true,imports:items}}));
      dialog?.close();
      message("รวมข้อมูลรายเดือนที่เลือกแล้ว · Dashboard วิเคราะห์ข้ามเดือนได้");
    } catch(e) { if(gen===generation) message(errorText(e),true); }
    finally { if(gen===generation){busy=false;updateUI();} }
  }
  async function libraryDialog() {
    if (!client) { setupDialog(); return; }
    if (!user) { authDialog(); return; }
    const d = makeDialog("Monthly datasets");
    const content = el("div", "กำลังโหลด…", "dialog-copy");
    d.append(content);
    try {
      await refreshLibrary();
      content.replaceChildren();
      if (!library.length) content.append(el("p","ยังไม่มีข้อมูล Cloud · เลือกไฟล์รายเดือนเพื่ออัปโหลด"));
      const selected = new Set();
      for (const item of library) {
        const box=el("div",undefined,"cloud-list-item");
        const period=item.period_key || "ไม่ระบุเดือน";
        const check=el("input"); check.type="checkbox"; check.setAttribute("aria-label","เลือก "+period);
        check.onchange=()=>check.checked?selected.add(item.id):selected.delete(item.id);
        box.append(check,el("div",item.name,"cloud-list-title"),
          el("div",`${period} · ${item.row_count.toLocaleString()} rows · ${new Date(item.activated_at || item.created_at).toLocaleString("th-TH")}`,"cloud-list-meta"));
        const actions=el("div",undefined,"cloud-list-actions"),open=el("button","Open month","btn primary"),
          remove=el("button","Delete","btn danger-button");
        open.onclick=()=>openSnapshot(item,d);
        remove.onclick=async()=>{
          if(busy||!confirm(`ลบ “${item.name}” และทุกรายการในชุดถาวร?`))return;
          remove.disabled=true;
          try{
            const {data,error}=await client.from("bic_imports").delete().eq("id",item.id).select("id");
            if(error)throw error;if(!data.length)throw Error("ไม่พบชุดข้อมูลหรือไม่มีสิทธิ์ลบ");
            if(currentId===item.id){api.clearData();currentId=null;}
            box.remove();selected.delete(item.id);message("ลบ Dataset แล้ว");updateUI();
          }catch(e){message(errorText(e),true);remove.disabled=false;}
        };
        actions.append(open);if(!workspace||workspace.role==="admin")actions.append(remove);
        box.append(actions);content.append(box);
      }
      const combine=el("button","Analyze selected months","btn primary");
      combine.onclick=()=>openSnapshots(library.filter(x=>selected.has(x.id)),d);
      content.append(combine,el("p","เลือกได้สูงสุด 12 เดือน · ระบบรวมแถวเพื่อวิเคราะห์ข้ามเดือน โดยไม่แก้ไข Dataset ต้นฉบับ","small"));
    } catch(e){content.textContent=errorText(e);}
  }
  $("cloudSetup").onclick = setupDialog;
  $("cloudLibrary").onclick = libraryDialog;
  $("cloudAuth").onclick = async () => {
    if (!user) {
      authDialog();
      return;
    }
    const { error } = await client.auth.signOut({ scope: "local" });
    if (error) message(errorText(error), true);
    else {
      api.clearData();
      currentId = null;
      user = null;
      updateUI();
      announceSession();
      message("ออกจากระบบแล้ว");
    }
  };
  async function saveLatest() {
    if (!client) {
      setupDialog();
      return;
    }
    if (!user) {
      authDialog();
      return;
    }
    const d = api.getData();
    if (busy) {
      pendingSave = true;
      return;
    }
    if(workspace?.role==='viewer'){message('Viewer ดูรายงานได้อย่างเดียว กรุณาให้ Admin/Uploader อัปโหลด',true);return;}
    if (d.isDemo || !d.rows.length || currentId) return;
    const problem = uploadProblem(d);
    if (problem) { saveFailed = true; message(problem, true); updateUI(); return; }
    const json = JSON.stringify(d.rows), gen = generation, activeClient = client;
    busy = true;
    saveFailed = false;
    message("กำลังอัปโหลดชุดล่าสุด… อย่าปิดหน้านี้จนกว่าจะบันทึกสำเร็จ");
    updateUI();
    try {
      const hash = Array.from(
        new Uint8Array(
          await crypto.subtle.digest("SHA-256", new TextEncoder().encode(json)),
        ),
      )
        .map((b) => b.toString(16).padStart(2, "0"))
        .join("");
      if (gen !== generation) return;
      const periodKey = String(d.rows[0]?.date || "").slice(0,7);
      const {data: sessionId,error: beginError}=await activeClient.rpc("bic_begin_import",{
        p_workspace:workspace?.id || null,p_name:d.source.slice(0,255),p_hash:hash,
        p_expected_rows:d.rows.length,p_period_key:periodKey,p_meta:{issues:d.issues,schema:d.schema}
      });
      if(beginError)throw beginError;
      try {
        for(let offset=0;offset<d.rows.length;offset+=2000){
          if(gen!==generation)throw Error("Session changed during upload");
          const {error}=await activeClient.rpc("bic_append_import_batch",{
            p_session:sessionId,p_offset:offset,p_rows:d.rows.slice(offset,offset+2000)
          });
          if(error)throw error;
          message(`กำลังอัปโหลด ${Math.min(offset+2000,d.rows.length).toLocaleString()} / ${d.rows.length.toLocaleString()} rows…`);
        }
        const {data:id,error}=await activeClient.rpc("bic_complete_import",{p_session:sessionId});
        if(error)throw error;
        if(gen!==generation)return;
      if (gen !== generation) return;
      if (api.getData().rows === d.rows) {
        currentId = id;
        window.dispatchEvent(new CustomEvent('bic:snapshot',{detail:{id,name:d.source,owner_id:user.id,row_count:d.rows.length,activated_at:new Date().toISOString()}}));
        api.markCloudSaved?.(d.rows, new Date().toISOString());
        message(
          `บันทึก Dataset เดือน ${periodKey} บน Cloud แล้ว · สามารถเลือกหลายเดือนเพื่อวิเคราะห์รวมได้`,
        );
      }
      } catch(uploadError) {
        await activeClient.rpc("bic_abort_import",{p_session:sessionId}).catch(()=>{});
        throw uploadError;
      }
    } catch (e) {
      if (gen === generation) {
        saveFailed = true;
        message("อัปโหลดไม่สำเร็จ · ชุด Cloud เดิมยังอยู่ · " + errorText(e), true);
      }
    } finally {
      if (gen !== generation) return;
      busy = false;
      updateUI();
      if (pendingSave) {
        pendingSave = false;
        setTimeout(saveLatest, 0);
      }
    }
  }
  $("cloudSave").onclick = saveLatest;
  let observed = api.getData().rows;
  api.subscribe(() => {
    const d = api.getData(),
      changed = d.rows !== observed;
    observed = d.rows;
    updateUI();
    if (
      changed &&
      d.origin === "local" &&
      !d.isDemo &&
      d.rows.length &&
      client &&
      user && workspace?.role!=="viewer"
    )
      setTimeout(saveLatest, 0);
    else if (changed && d.origin === "local" && !d.isDemo && d.rows.length)
      message("อ่านไฟล์แล้ว แต่ยังไม่ขึ้น Cloud · กรุณาเข้าสู่ระบบ ข้อมูลตอนนี้อยู่บนเครื่องนี้เท่านั้น", true);
  });
  window.addEventListener("focus", () => {
    if (document.visibilityState === "visible") restoreCloud();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") restoreCloud();
  });
  window.BIC_CLOUD = {
    context:()=>({client,user,workspace,currentId,busy}),
    refresh:()=>restoreCloud(),
    open:(item)=>openSnapshot(item,null),
    async restore(id) {
      if(busy||restoring)throw Error('รอ Cloud ทำงานเสร็จก่อนคืนข้อมูล');
      if(!user)throw Error('เข้าสู่ระบบก่อน');
      const gen=generation, activeClient=client;
      busy=true;updateUI();
      try {
        const {error}=await activeClient.rpc('bic_activate_import',{p_import:id});
        if(error)throw error;
        if(gen!==generation)return;
        api.clearData();currentId=null;
      } finally {if(gen===generation){busy=false;updateUI()}}
      if(gen===generation)await restoreCloud();
    },
    async setWorkspace(next) {
      if(busy||restoring)throw Error('รอ Cloud ทำงานเสร็จก่อนเปลี่ยนทีม');
      if(!user)throw Error('เข้าสู่ระบบก่อน');
      if(next) localStorage.setItem('bic.workspace.'+user.id,next.id);
      else localStorage.removeItem('bic.workspace.'+user.id);
      api.clearData();workspace=next;scopeUser=null;
      await connect(config);
    }
  };
  updateUI();
  try {
    const stored = localStorage.getItem(STORAGE),
      url = import.meta.env.VITE_SUPABASE_URL,
      key =
        import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
        import.meta.env.VITE_SUPABASE_ANON_KEY;
    const picked = pickProjectConfig(stored ? JSON.parse(stored) : null, { url, key }) || PROJECT_CONFIG;
    const c = picked ? validateConfig(picked) : null;
    connect(c).catch((e) => message(errorText(e), true));
  } catch (e) {
    message(errorText(e), true);
    announceSession();
  }
}
