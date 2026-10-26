// One replaceable dataset per browser/project/account. No sales data in localStorage.
export function initLatest(api) {
  let scope = null,
    epoch = 0,
    last = api.getData().rows;
  const dbp = new Promise((resolve, reject) => {
    const r = indexedDB.open("bic-latest-v1", 1);
    r.onupgradeneeded = () => r.result.createObjectStore("latest");
    r.onsuccess = () => resolve(r.result);
    r.onerror = () => reject(r.error);
  });
  dbp.catch(() => {});
  async function operation(mode, fn) {
    const db = await dbp;
    return new Promise((resolve, reject) => {
      const tx = db.transaction("latest", mode);
      let result;
      const r = fn(tx.objectStore("latest"));
      r.onsuccess = () => {
        result = r.result;
      };
      tx.oncomplete = () => resolve(result);
      tx.onerror = () => reject(tx.error);
      tx.onabort = () => reject(tx.error);
    });
  }
  const warn = () => {
    document.getElementById("cacheStatus").textContent =
      "เก็บใน browser ไม่สำเร็จ · อย่าปิดหน้าก่อน Save to cloud หรือเก็บไฟล์ต้นฉบับ";
  };
  window.addEventListener("bic:session-ready", async (e) => {
    const next =
      (e.detail.project || "offline") + "::" + (e.detail.user || "local");
    if (scope === next) return;
    scope = next;
    const my = ++epoch,
      ref = api.getData().rows;
    try {
      const d = await operation("readonly", (s) => s.get(next));
      if (my !== epoch || api.getData().rows !== ref || ref.length) return;
      if (d?.rows?.length) api.loadData({ ...d, origin: "cache" });
    } catch {
      warn();
    }
  });
  api.subscribe(() => {
    const d = api.getData();
    if (d.rows === last) return;
    last = d.rows;
    ++epoch;
    if (!scope || d.isDemo) return;
    const target = scope;
    if (!d.rows.length) {
      operation("readwrite", (s) => s.delete(target)).catch(warn);
      return;
    }
    if (d.origin === "cache") return;
    operation("readwrite", (s) =>
      s.put({ ...d, savedAt: d.cachedAt || new Date().toISOString() }, target),
    )
      .then(() => {
        if (scope === target && api.getData().rows === d.rows)
          document.getElementById("cacheStatus").textContent =
            "เก็บชุดล่าสุดใน browser นี้แล้ว · อัปโหลดใหม่จะแทนชุดเดิม";
      })
      .catch(warn);
  });
}
