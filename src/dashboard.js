import { GROUPS, classifyProduct } from "./product-groups.js";
import { renderGroupChart } from "./group-chart.js";
import * as XLSX from "xlsx";
import Chart from "chart.js/auto";

(() => {
  "use strict";
  const $ = (id) => document.getElementById(id),
    esc = (v) =>
      String(v ?? "").replace(
        /[&<>"']/g,
        (c) =>
          ({
            "&": "&amp;",
            "<": "&lt;",
            ">": "&gt;",
            '"': "&quot;",
            "'": "&#39;",
          })[c],
      );
  const nf = new Intl.NumberFormat("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 }),
    intf = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 });
  const num = (v) => (v === null || !Number.isFinite(v) ? "—" : nf.format(v)),
    compact = (v) =>
      v === null || !Number.isFinite(v)
        ? "—"
        : Math.abs(v) >= 1e6
          ? nf.format(v / 1e6) + "M"
          : Math.abs(v) >= 1e3
            ? nf.format(v / 1e3) + "K"
            : nf.format(v),
    pad = (n) => String(n).padStart(2, "0");
  const DAY = 86400000,
    week = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."],
    weekfull = [
      "อาทิตย์",
      "จันทร์",
      "อังคาร",
      "พุธ",
      "พฤหัสบดี",
      "ศุกร์",
      "เสาร์",
    ];
  let rows = [],
    filtered = [],
    book = null,
    buffer = null,
    source = "",
    dataOrigin = "none",
    cachedAt = null,
    isDemo = false,
    extent = [],
    schema = {},
    issues = {},
    tab = "group",
    sort = { key: "sales", asc: false },
    page = 1,
    tableRows = [],
    columns = [],
    chartBuckets = [],
    charts = [],
    stats = null;
  const req = [
    "วันที่เอกสาร",
    "เลขที่เอกสาร",
    "คืนสินค้า",
    "จำนวน",
    "มูลค่าขาย",
    "มูลค่าขายรวม Vat.",
  ];
  const norm = (v) =>
    String(v ?? "")
      .replace(/\uFEFF/g, "")
      .replace(/\s+/g, " ")
      .trim();
  const iso = (d) =>
    `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
  const dateText = (s) => {
    if (!s) return "—";
    const [y, m, d] = s.split("-");
    return `${d}/${m}/${y}`;
  };
  function parseNumber(v) {
    if (typeof v === "number") return Number.isFinite(v) ? v : null;
    if (v == null || String(v).trim() === "") return null;
    let s = String(v)
      .trim()
      .replace(/[฿,\s\u00a0]/g, "");
    if (/^\(.*\)$/.test(s)) s = "-" + s.slice(1, -1);
    return /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)$/.test(s) &&
      Number.isFinite(Number(s))
      ? Number(s)
      : null;
  }
  function parseDate(v, date1904 = false) {
    if (v == null || v === "") return null;
    let y,
      m,
      d,
      h = null,
      min = 0,
      sec = 0;
    if (typeof v === "number") {
      const p = XLSX.SSF.parse_date_code(v, { date1904 });
      if (!p) return null;
      ({ y, m, d } = p);
      h = p.H;
      min = p.M;
      sec = Math.floor(p.S);
    } else if (v instanceof Date) {
      if (isNaN(v)) return null;
      y = v.getFullYear();
      m = v.getMonth() + 1;
      d = v.getDate();
      h = v.getHours();
      min = v.getMinutes();
      sec = v.getSeconds();
    } else {
      const s = norm(v);
      let p = s.match(
        /^(\d{1,2})[\/-](\d{1,2})[\/-](\d{4})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/,
      );
      if (p) {
        d = +p[1];
        m = +p[2];
        y = +p[3];
        h = p[4] === undefined ? null : +p[4];
        min = +(p[5] || 0);
        sec = +(p[6] || 0);
      } else {
        p = s.match(
          /^(\d{4})-(\d{2})-(\d{2})(?:[ T]+(\d{1,2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?)?$/,
        );
        if (!p) return null;
        y = +p[1];
        m = +p[2];
        d = +p[3];
        h = p[4] === undefined ? null : +p[4];
        min = +(p[5] || 0);
        sec = +(p[6] || 0);
      }
    }
    if (y > 2400) y -= 543;
    if (
      y < 1900 ||
      y > 2200 ||
      m < 1 ||
      m > 12 ||
      d < 1 ||
      d > 31 ||
      (h !== null && (h < 0 || h > 23)) ||
      min > 59 ||
      sec > 59
    )
      return null;
    const dt = new Date(Date.UTC(y, m - 1, d));
    if (dt.getUTCMonth() !== m - 1 || dt.getUTCDate() !== d) return null;
    return { date: iso(dt), day: dt.getUTCDay(), hour: h, ms: +dt };
  }
  function csvParse(text) {
    const first = text.split(/\r?\n/).slice(0, 10).join("\n"),
      delims = [",", ";", "\t"];
    let delim = delims.sort(
      (a, b) => first.split(b).length - first.split(a).length,
    )[0];
    let out = [],
      r = [],
      s = "",
      q = false;
    for (let i = 0; i < text.length; i++) {
      const c = text[i];
      if (c === '"') {
        if (q && text[i + 1] === '"') {
          s += '"';
          i++;
        } else if (q || !s) q = !q;
        else s += c;
      } else if (c === delim && !q) {
        r.push(s);
        s = "";
      } else if ((c === "\n" || c === "\r") && !q) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        r.push(s);
        out.push(r);
        r = [];
        s = "";
      } else s += c;
    }
    if (q) throw Error("CSV มีเครื่องหมายคำพูดปิดไม่ครบ");
    if (s || r.length) {
      r.push(s);
      out.push(r);
    }
    return out;
  }
  function decodeCSV(buf) {
    const mode = $("encoding").value;
    if (mode !== "auto") return new TextDecoder(mode).decode(buf);
    try {
      return new TextDecoder("utf-8", { fatal: true }).decode(buf);
    } catch {
      return new TextDecoder("windows-874").decode(buf);
    }
  }
  function normalizeData(matrix, display, date1904 = false) {
    const hi = matrix
      .slice(0, 50)
      .findIndex(
        (r) =>
          r.map(norm).includes("เลขที่เอกสาร") &&
          r.map(norm).includes("วันที่เอกสาร"),
      );
    if (hi < 0)
      throw Error(
        "ไม่พบหัวตาราง “เลขที่เอกสาร” และ “วันที่เอกสาร” ใน 50 แถวแรก",
      );
    const headers = matrix[hi].map(norm),
      idx = {};
    headers.forEach((h, i) => {
      if (h) idx[h] = i;
    });
    const missing = req.filter((k) => idx[k] === undefined);
    if (missing.length) throw Error("ขาดคอลัมน์จำเป็น: " + missing.join(", "));
    if (
      new Set(headers.filter(Boolean)).size !== headers.filter(Boolean).length
    )
      throw Error("มีชื่อคอลัมน์ซ้ำ กรุณาแก้หัวตารางให้ไม่ซ้ำ");
    const opt = [
      "วันที่สร้างข้อมูล",
      "ร้านค้า",
      "ชื่อร้านค้า",
      "สินค้า",
      "ชื่อสินค้า",
      "หน่วย",
      "มูลค่าส่วนลด",
      "หมายเหตุยกเลิก",
    ];
    const absent = opt.filter((k) => idx[k] === undefined);
    const beforeKey =
      idx["มูลค่าก่อนส่วนลด"] !== undefined
        ? "มูลค่าก่อนส่วนลด"
        : idx["มูลค่าขายก่อนส่วนลด"] !== undefined
          ? "มูลค่าขายก่อนส่วนลด"
          : null;
    const bad = {
        noDoc: 0,
        date: 0,
        number: 0,
        status: 0,
        time: 0,
        sign: 0,
        optionalNumber: 0,
        duplicate: 0,
        blank: 0,
      },
      out = [],
      seen = new Set();
    for (let i = hi + 1; i < matrix.length; i++) {
      const a = matrix[i];
      if (!a || a.every((v) => v == null || norm(v) === "")) {
        bad.blank++;
        continue;
      }
      const get = (k) => a[idx[k]],
        txt = (k) => norm(display?.[i]?.[idx[k]] ?? get(k));
      const doc = txt("เลขที่เอกสาร");
      if (!doc) {
        bad.noDoc++;
        continue;
      }
      const dt = parseDate(get("วันที่เอกสาร"), date1904);
      if (!dt) {
        bad.date++;
        continue;
      }
      const status = norm(get("คืนสินค้า")).toUpperCase();
      if (!["N", "Y"].includes(status)) {
        bad.status++;
        continue;
      }
      const qty = parseNumber(get("จำนวน")),
        ex = parseNumber(get("มูลค่าขาย")),
        inc = parseNumber(get("มูลค่าขายรวม Vat."));
      if ([qty, ex, inc].some((v) => v === null)) {
        bad.number++;
        continue;
      }
      const tm = parseDate(get("วันที่สร้างข้อมูล"), date1904);
      if (!tm || tm.hour === null) bad.time++;
      const disc = parseNumber(get("มูลค่าส่วนลด")),
        before = beforeKey ? parseNumber(get(beforeKey)) : null;
      if (disc === null || before === null) bad.optionalNumber++;
      const store = txt("ร้านค้า") || txt("ชื่อร้านค้า") || "ไม่ระบุสาขา",
        name = txt("ชื่อร้านค้า") || store,
        unit = txt("หน่วย") || "ไม่ระบุหน่วย";
      const fingerprint = JSON.stringify(a);
      if (seen.has(fingerprint)) bad.duplicate++;
      seen.add(fingerprint);
      if (status === "Y" && (inc > 0 || ex > 0 || qty > 0)) bad.sign++;
      out.push({
        doc,
        key: JSON.stringify([store, doc]),
        date: dt.date,
        day: dt.day,
        ms: dt.ms,
        hour: tm?.hour ?? null,
        store,
        storeName: name,
        storeLabel: store === name ? name : `${name} · ${store}`,
        sku: txt("สินค้า") || "ไม่ระบุรหัส",
        name: txt("ชื่อสินค้า") || "ไม่ระบุชื่อสินค้า",
        unit,
        status,
        qty,
        ex,
        inc,
        disc,
        before,
        reason: txt("หมายเหตุยกเลิก") || "ไม่ระบุหมายเหตุ",
        ref: txt("เอกสารอ้างอิง"),
      });
    }
    if (!out.length)
      throw Error(
        "ไม่มีรายการที่ผ่านการตรวจสอบ กรุณาตรวจวันที่ ตัวเลข และสถานะ N/Y",
      );
    return {
      rows: out,
      issues: bad,
      schema: {
        absent,
        beforeKey,
        discount: idx["มูลค่าส่วนลด"] !== undefined,
      },
    };
  }
  function notify(text, error = false) {
    $("message").innerHTML = text
      ? `<div class="notice ${error ? "error" : ""}">${esc(text)}</div>`
      : "";
  }
  function commit(
    result,
    label,
    demo = false,
    origin = "local",
    timestamp = null,
  ) {
    cachedAt = timestamp || new Date().toISOString();
    dataOrigin = demo ? "demo" : origin;
    rows = result.rows;
    issues = result.issues;
    schema = result.schema;
    source = label;
    isDemo = demo;
    extent = [Math.min(...rows.slice(0, 1).map((r) => r.ms)), 0];
    let lo = Infinity,
      hi = -Infinity;
    for (const r of rows) {
      lo = Math.min(lo, r.ms);
      hi = Math.max(hi, r.ms);
    }
    extent = [lo, hi];
    $("filename").textContent = source;
    $("sourceBadge").textContent = demo
      ? "DEMO · ข้อมูลจำลอง"
      : origin === "cloud"
        ? "CLOUD · ข้อมูลล่าสุด"
        : origin === "cache"
          ? "LATEST · ชุดล่าสุดบนเครื่องนี้"
          : "LATEST · ไฟล์ที่อัปโหลดล่าสุด";
    for (const [id, key, label] of [
      ["store", "store", "ทุกสาขา / All stores"],
      ["unit", "unit", "ทุกหน่วย / All units"],
    ]) {
      const map = new Map(
        rows.map((r) => [r[key], id === "store" ? r.storeLabel : r.unit]),
      );
      $(id).replaceChildren(
        new Option(label, "all"),
        ...[...map]
          .sort((a, b) => a[1].localeCompare(b[1], "th"))
          .map(([v, l]) => new Option(l, v)),
      );
    }
    resetFilters();
    notify(
      demo
        ? "กำลังแสดงข้อมูลจำลองสำหรับทดลองฟังก์ชัน ไม่ใช่ยอดขายจากไฟล์จริง"
        : "นำเข้าสำเร็จ · " + intf.format(rows.length) + " รายการ",
    );
    renderNotices();
  }
  function renderNotices() {
    const notes = [];
    const b = issues;
    if (b.noDoc)
      notes.push(`ตัด ${b.noDoc} แถวที่ไม่มีเลขที่เอกสาร (อาจรวมแถวสรุป)`);
    if (b.date || b.number || b.status)
      notes.push(
        `ตัดแถวผิดรูปแบบ: วันที่ ${b.date}, ตัวเลข ${b.number}, สถานะ N/Y ${b.status}`,
      );
    if (b.time)
      notes.push(
        `${b.time} รายการไม่มีเวลาที่ใช้ได้: ไม่รวมใน Hourly/Matrix และไม่รวมเมื่อกรองชั่วโมง`,
      );
    if (b.sign)
      notes.push(
        `${b.sign} รายการคืน Y มีจำนวนหรือยอดบวก: คงเครื่องหมายตามไฟล์ โปรดตรวจสอบก่อนใช้ผล`,
      );
    if (b.optionalNumber)
      notes.push(
        `${b.optionalNumber} รายการไม่มีส่วนลด/ฐานส่วนลดที่ถูกต้อง: Discount rate อาจแสดง —`,
      );
    if (b.duplicate)
      notes.push(
        `พบแถวเหมือนกันทุกช่อง ${b.duplicate} แถว: เก็บไว้ ไม่ลบอัตโนมัติ`,
      );
    if (schema.absent?.length)
      notes.push("ไม่พบคอลัมน์เสริม: " + schema.absent.join(", "));
    if (schema.beforeKey === "มูลค่าขายก่อนส่วนลด")
      notes.push(
        "ฐาน Discount ใช้ “มูลค่าขายก่อนส่วนลด” เพราะไม่มี “มูลค่าก่อนส่วนลด”",
      );
    $("dataNotice").innerHTML = notes.length
      ? `<details class="notice"><summary>รายงานคุณภาพข้อมูล · ${notes.length} ประเด็น (คลิกดู)</summary><ul>${notes.map((n) => `<li>${esc(n)}</li>`).join("")}</ul></details>`
      : "";
  }
  function resetFilters() {
    if (rows.length) {
      $("from").value = iso(new Date(extent[0]));
      $("to").value = iso(new Date(extent[1]));
    } else {
      $("from").value = "";
      $("to").value = "";
    }
    $("hourFrom").value = "0";
    $("hourTo").value = "23";
    for (const k of ["weekday", "store", "return", "unit", "groupFilter"])
      $(k).value = "all";
    $("vat").checked = true;
    $("search").value = "";
    page = 1;
    render();
  }
  const value = (r) => ($("vat").checked ? r.inc : r.ex);
  function selected(rs, lo, hi) {
    const hf = +$("hourFrom").value,
      ht = +$("hourTo").value,
      full = hf === 0 && ht === 23;
    return rs.filter(
      (r) =>
        r.ms >= lo &&
        r.ms <= hi &&
        ($("weekday").value === "all" || r.day === +$("weekday").value) &&
        ($("store").value === "all" || r.store === $("store").value) &&
        ($("return").value === "all" || r.status === $("return").value) &&
        ($("unit").value === "all" || r.unit === $("unit").value) &&
        ($("groupFilter").value === "all" ||
          classifyProduct(r.name).group === $("groupFilter").value) &&
        (full ||
          (r.hour !== null &&
            (hf <= ht
              ? r.hour >= hf && r.hour <= ht
              : r.hour >= hf || r.hour <= ht))),
    );
  }
  function aggregate(rs) {
    let sales = 0,
      normal = 0,
      ret = 0,
      qty = 0,
      disc = 0,
      before = 0,
      discountOK = true;
    const bills = new Set(),
      returns = new Set(),
      units = new Set();
    for (const r of rs) {
      const v = value(r);
      sales += v;
      qty += r.qty;
      units.add(r.unit);
      if (r.status === "N") {
        normal += v;
        bills.add(r.key);
        if (r.disc === null || r.before === null) discountOK = false;
        else {
          disc += r.disc;
          before += r.before;
        }
      } else {
        ret += v;
        returns.add(r.key);
      }
    }
    const tc = bills.size;
    return {
      sales,
      normal,
      ret,
      qty,
      tc,
      returnTC: returns.size,
      ta: tc ? sales / tc : null,
      upt: tc ? qty / tc : null,
      rr: normal > 0 ? (Math.abs(ret) / normal) * 100 : null,
      dr:
        discountOK && schema.discount && before > 0
          ? (disc / before) * 100
          : null,
      unitCount: units.size,
    };
  }
  function calendarDays(lo, hi) {
    let n = 0;
    for (let d = lo; d <= hi; d += DAY)
      if (
        $("weekday").value === "all" ||
        new Date(d).getUTCDay() === +$("weekday").value
      )
        n++;
    return n;
  }
  function delta(a, b, rate = false, lower = false) {
    if (a === null || b === null)
      return '<span class="delta">ไม่มีข้อมูลเปรียบเทียบ</span>';
    if (!rate && b === 0)
      return '<span class="delta">ฐานช่วงก่อนหน้าเป็น 0</span>';
    const d = rate ? a - b : ((a - b) / Math.abs(b)) * 100;
    const good = lower ? d <= 0 : d >= 0;
    return `<span class="delta ${good ? "up" : "down"}">${d > 0 ? "+" : ""}${num(d)}${rate ? " pp" : "%"} จากช่วงก่อน</span>`;
  }
  function updateKPIs(lo, hi) {
    stats = aggregate(filtered);
    const days = calendarDays(lo, hi),
      span = hi - lo + DAY,
      prevlo = lo - span,
      prevhi = lo - DAY,
      covered = rows.length && prevlo >= extent[0] && prevhi <= extent[1];
    const p = covered ? aggregate(selected(rows, prevlo, prevhi)) : null;
    const s = stats;
    const cards = [
      [
        "Total Sales",
        compact(s.sales),
        "sales",
        false,
        false,
        `฿${num(s.sales)} · เฉลี่ย ฿${num(days ? s.sales / days : null)}/วัน`,
      ],
      [
        "Return",
        s.rr === null ? "—" : num(s.rr) + "%",
        "rr",
        true,
        true,
        `คืน ${s.returnTC} บิล · มูลค่า ฿${num(Math.abs(s.ret))}`,
      ],
      [
        "Discount rate",
        s.dr === null ? "—" : num(s.dr) + "%",
        "dr",
        true,
        true,
        "รายการ N · ฐานส่วนลดตามไฟล์",
      ],
      [
        "Net quantity",
        compact(s.qty),
        "qty",
        false,
        false,
        s.unitCount > 1
          ? `${s.unitCount} หน่วยต่างประเภท · ไม่ใช่ชิ้นรวม`
          : "จำนวนสุทธิตามหน่วยสินค้า",
      ],
      [
        "Transaction · TC",
        num(s.tc),
        "tc",
        false,
        false,
        `เฉลี่ย ${num(days ? s.tc / days : null)} บิล/วัน · ${days} วัน`,
      ],
      [
        "Basket size · TA",
        s.ta === null ? "—" : compact(s.ta),
        "ta",
        false,
        false,
        `THB/บิล · UPT ${num(s.upt)}${s.unitCount > 1 ? " (คละหน่วย)" : ""}`,
      ],
    ];
    const ordered = [
      cards[0],
      cards[3],
      cards[4],
      cards[5],
      cards[1],
      cards[2],
    ];
    $("kpis").innerHTML = ordered
      .map(
        ([label, v, k, rate, lower, sub]) =>
          `<article class="kpi"><div class="label">${label}</div><div class="value" title="${esc(num(s[k]))}">${v}</div><div>${p ? delta(s[k], p[k], rate, lower) : '<span class="delta">ไม่มีข้อมูลช่วงก่อนหน้า</span>'}</div><div class="sub">${esc(sub)}</div></article>`,
      )
      .join("");
    $("kpis").dataset.sales = s.sales;
    $("kpis").dataset.tc = s.tc;
  }
  const hoursSelected = () => {
    let arr = [],
      a = +$("hourFrom").value,
      b = +$("hourTo").value;
    for (let i = a; ; i = (i + 1) % 24) {
      arr.push(i);
      if (i === b) break;
    }
    return arr;
  };
  function buckets() {
    const mode = $("period").value,
      map = new Map();
    for (const r of filtered) {
      if (mode === "hourly" && r.hour === null) continue;
      const k = mode === "hourly" ? r.hour : mode === "daily" ? r.date : r.day;
      if (!map.has(k)) map.set(k, []);
      map.get(k).push(r);
    }
    let keys;
    if (mode === "hourly") {
      keys = hoursSelected();
      const active = keys.filter((k) => map.has(k));
      if (active.length) {
        const first = keys.indexOf(active[0]),
          last = keys.indexOf(active.at(-1));
        keys = keys.slice(first, last + 1);
      } else keys = [];
    } else if (mode === "weekday")
      keys = [1, 2, 3, 4, 5, 6, 0].filter(
        (k) => $("weekday").value === "all" || k === +$("weekday").value,
      );
    else {
      keys = [];
      if (filtered.length) {
        let min = Infinity,
          max = -Infinity;
        for (const r of filtered) {
          min = Math.min(min, r.ms);
          max = Math.max(max, r.ms);
        }
        for (let t = min; t <= max; t += DAY) {
          const d = new Date(t);
          if (
            $("weekday").value === "all" ||
            d.getUTCDay() === +$("weekday").value
          )
            keys.push(iso(d));
        }
      }
    }
    return keys.map((k) => ({
      key: k,
      label:
        mode === "hourly"
          ? pad(k) + ":00"
          : mode === "weekday"
            ? weekfull[k]
            : dateText(k),
      s: map.has(k) ? aggregate(map.get(k)) : null,
    }));
  }
  function makeChart(id, type, labels, data, color, unit) {
    const canvas = $(id);
    const count = unit === "บิล";
    const opts = {
      responsive: true,
      maintainAspectRatio: false,
      animation: false,
      layout: { padding: { top: id === "trend" ? 24 : 8, right: 12 } },
      interaction: { mode: "index", intersect: false },
      plugins: {
        legend: { display: false },
        tooltip: {
          callbacks: {
            label: (ctx) =>
              `${ctx.dataset.label}: ${num(ctx.parsed.y)} ${unit}`,
          },
        },
      },
      scales: {
        x: {
          grid: { display: false },
          ticks: {
            color: "#a7a7a7",
            maxRotation: 0,
            autoSkip: true,
            maxTicksLimit: window.innerWidth < 600 ? 5 : 10,
            font: { size: 11 },
          },
        },
        y: {
          beginAtZero: true,
          grace: "15%",
          grid: { color: "#ffffff0d" },
          border: { display: false },
          ticks: {
            color: "#a7a7a7",
            precision: count ? 0 : undefined,
            callback: (v) => compact(v) + (unit === "%" ? "%" : ""),
            font: { size: 11 },
          },
          title: {
            display: true,
            text: unit,
            font: { size: 10 },
            color: "#a7a7a7",
          },
        },
      },
    };
    const chart = new Chart(canvas, {
      type,
      data: {
        labels,
        datasets: [
          {
            label: unit,
            data,
            borderColor: color,
            backgroundColor:
              typeof color === "string"
                ? type === "line"
                  ? color + "18"
                  : color
                : color,
            borderWidth: type === "line" ? 2 : 0,
            pointRadius: labels.length > 50 ? 0 : 3,
            pointHoverRadius: 5,
            tension: 0.2,
            fill: type === "line",
            spanGaps: false,
            borderRadius: 3,
            maxBarThickness: 34,
          },
        ],
      },
      options: opts,
      plugins:
        id === "trend"
          ? [
              {
                id: "labels",
                afterDatasetsDraw(c) {
                  if (c.width < 550 || labels.length > 16) return;
                  const { ctx } = c;
                  ctx.save();
                  ctx.font = "11px Arial";
                  ctx.fillStyle = "#b3b3b3";
                  ctx.textAlign = "center";
                  c.getDatasetMeta(0).data.forEach((p, i) => {
                    if (data[i] !== null) {
                      const pos = p.tooltipPosition();
                      const text = compact(data[i]),
                        half = ctx.measureText(text).width / 2 + 3;
                      ctx.fillText(
                        text,
                        Math.max(half, Math.min(c.width - half, pos.x)),
                        pos.y - 10,
                      );
                    }
                  });
                  ctx.restore();
                },
              },
            ]
          : [],
    });
    charts.push(chart);
    canvas.setAttribute(
      "aria-label",
      `${$(id === "trend" ? "metricTitle" : id === "variance" ? "average" : "chartCaption").textContent}; ${labels.length} ช่วงเวลา ดูค่าตารางด้านล่าง`,
    );
  }
  function updateCharts() {
    charts.forEach((c) => c.destroy());
    charts = [];
    chartBuckets = buckets();
    const metric = $("metric").value,
      labels = chartBuckets.map((b) => b.label),
      vals = chartBuckets.map((b) => (b.s ? b.s[metric] : null)),
      valid = vals.filter((v) => v !== null),
      mean = valid.length
        ? valid.reduce((a, b) => a + b, 0) / valid.length
        : null;
    const variances = vals.map((v) =>
      v === null || mean === null || mean === 0
        ? null
        : ((v - mean) / Math.abs(mean)) * 100,
    );
    const unit =
      metric === "sales"
        ? "THB"
        : metric === "tc"
          ? "บิล"
          : metric === "ta"
            ? "THB/บิล"
            : "หน่วย";
    const title = {
        sales: "ยอดขายสุทธิ",
        tc: "จำนวนบิลขาย",
        ta: "ยอดสุทธิต่อบิลขาย",
        qty: "จำนวนสุทธิ",
      }[metric],
      mode = {
        hourly: "รายชั่วโมง",
        daily: "รายวัน",
        weekday: "รวมตามวันในสัปดาห์",
      }[$("period").value];
    $("metricTitle").textContent = `${title} · ${mode}`;
    $("metricUnit").textContent = unit;
    $("chartCaption").textContent =
      `${mode} · วันที่อิงเอกสาร / ชั่วโมงอิงเวลาสร้าง`;
    if (typeof Chart !== "undefined") {
      Chart.defaults.font.family = "Arial, Thai, sans-serif";
      Chart.defaults.color = "#a7a7a7";
      makeChart("trend", "line", labels, vals, "#1ed760", unit);
      makeChart(
        "variance",
        "bar",
        labels,
        variances,
        variances.map((v) => (v >= 0 ? "#1ed760" : "#f3727f")),
        "%",
      );
      makeChart(
        "transactions",
        "bar",
        labels,
        chartBuckets.map((b) => (b.s ? b.s.tc : null)),
        "#1ed760",
        "บิล",
      );
      makeChart(
        "basket",
        "line",
        labels,
        chartBuckets.map((b) => b.s?.ta ?? null),
        "#cbcbcb",
        "THB/บิล",
      );
    }
    let peak = -Infinity,
      pi = -1;
    vals.forEach((v, i) => {
      if (v !== null && v > peak) {
        peak = v;
        pi = i;
      }
    });
    $("peak").textContent =
      pi >= 0
        ? `สูงสุด ${labels[pi]} · ${num(peak)} ${unit}`
        : "ไม่พบข้อมูลในช่วงเลือก / ไม่มีชั่วโมงที่ใช้ได้";
    $("average").textContent =
      `ค่าเฉลี่ย ${num(mean)} ${unit} · ${valid.length} bucket ที่คำนวณได้`;
    const unknown = filtered.filter((r) => r.hour === null).length;
    $("chartData").innerHTML =
      `<p class="small">ไม่มีเวลาสร้างที่ใช้ได้ ${unknown} รายการ · ยอด ${num(filtered.filter((r) => r.hour === null).reduce((a, r) => a + value(r), 0))} THB ${$("period").value === "hourly" ? "(ไม่แสดงในกราฟรายชั่วโมง)" : ""}</p><table><thead><tr>${["ช่วงเวลา", title + " (" + unit + ")", "Variance (%)", "TC (บิล)", "TA (THB/บิล)"].map((h) => `<th style="padding:10px">${esc(h)}</th>`).join("")}</tr></thead><tbody>${chartBuckets.map((b, i) => `<tr><td>${esc(b.label)}</td><td>${num(vals[i])}</td><td>${num(variances[i])}</td><td>${num(b.s?.tc ?? null)}</td><td>${num(b.s?.ta ?? null)}</td></tr>`).join("")}</tbody></table>`;
  }
  function groupTable() {
    const map = new Map(),
      rs =
        tab === "reason" ? filtered.filter((r) => r.status === "Y") : filtered;
    for (const r of rs) {
      let key =
        tab === "group"
          ? classifyProduct(r.name).group
          : tab === "item"
            ? JSON.stringify([r.sku, r.name, r.unit])
            : tab === "unit"
              ? r.unit
              : tab === "reason"
                ? r.reason
                : r.store;
      if (!map.has(key)) map.set(key, []);
      map.get(key).push(r);
    }
    const denom = stats.sales;
    let result = [];
    for (const [key, rr] of map) {
      const r = rr[0],
        s = aggregate(rr);
      const mapping = classifyProduct(r.name);
      const row = {
        id: key,
        group: mapping.group,
        mapping: mapping.method,
        sku: r.sku,
        name: r.name,
        unit: r.unit,
        label:
          tab === "group"
            ? key
            : tab === "unit"
              ? r.unit
              : tab === "reason"
                ? r.reason
                : r.storeLabel,
        qty: s.qty,
        sales: s.sales,
        share: denom === 0 ? null : (s.sales / denom) * 100,
        tc: s.tc,
        found: new Set(rr.map((r) => JSON.stringify([r.key, r.status]))).size,
        ret: s.ret,
      };
      if (tab === "matrix") {
        for (const h of hoursSelected()) {
          const hr = rr.filter((r) => r.hour === h);
          row["h" + h] = hr.length
            ? hr.reduce((a, r) => a + value(r), 0)
            : null;
        }
        const unknown = rr.filter((r) => r.hour === null);
        row.unknown = unknown.length
          ? unknown.reduce((a, r) => a + value(r), 0)
          : null;
      }
      result.push(row);
    }
    const q = $("search").value.trim().toLocaleLowerCase("th");
    if (q)
      result = result.filter((r) =>
        (tab === "item"
          ? [r.sku, r.name, r.unit, r.group, r.mapping]
          : [r.label]
        ).some((v) => String(v).toLocaleLowerCase("th").includes(q)),
      );
    columns =
      tab === "matrix"
        ? [
            { key: "label", label: "สาขา", text: true },
            ...hoursSelected().map((h) => ({
              key: "h" + h,
              label: pad(h) + ":00",
            })),
            { key: "unknown", label: "ไม่ระบุเวลา" },
            { key: "sales", label: "รวมยอดขาย" },
          ]
        : [
            ...(tab === "item"
              ? [
                  { key: "sku", label: "รหัสสินค้า", text: true },
                  { key: "name", label: "ชื่อสินค้า", text: true },
                  { key: "unit", label: "หน่วย", text: true },
                  { key: "group", label: "Group", text: true },
                  { key: "mapping", label: "Mapping", text: true },
                ]
              : [
                  {
                    key: "label",
                    label:
                      tab === "group"
                        ? "Group"
                        : tab === "store"
                          ? "สาขา"
                          : tab === "unit"
                            ? "หน่วยสินค้า"
                            : "หมายเหตุยกเลิก (Y)",
                    text: true,
                  },
                ]),
            { key: "qty", label: "จำนวนสุทธิ" },
            { key: "sales", label: "Sales (THB)" },
            { key: "share", label: "Share (%)" },
            { key: "found", label: "บิลที่พบ (N+Y)" },
            { key: "ret", label: "Return (THB)" },
          ];
    if (!columns.some((c) => c.key === sort.key))
      sort = { key: "sales", asc: false };
    result.sort((a, b) => {
      const av = a[sort.key],
        bv = b[sort.key];
      if (av === null) return bv === null ? 0 : 1;
      if (bv === null) return -1;
      const c = typeof av === "string" ? av.localeCompare(bv, "th") : av - bv;
      return sort.asc ? c : -c;
    });
    return result;
  }
  function renderTable() {
    tableRows = groupTable();
    const max = Math.ceil(tableRows.length / 40);
    page = Math.min(Math.max(page, 1), max || 1);
    const cols = columns;
    const t = $("performance");
    t.querySelector("thead").innerHTML =
      "<tr>" +
      cols
        .map(
          (c) =>
            `<th class="${c.text ? "" : "num"}" aria-sort="${sort.key === c.key ? (sort.asc ? "ascending" : "descending") : "none"}"><button data-sort="${c.key}">${esc(c.label)}${sort.key === c.key ? (sort.asc ? " ↑" : " ↓") : ""}</button></th>`,
        )
        .join("") +
      "</tr>";
    const visible = tableRows.slice((page - 1) * 40, page * 40);
    t.querySelector("tbody").innerHTML = visible.length
      ? visible
          .map(
            (r) =>
              "<tr>" +
              cols
                .map(
                  (c) =>
                    `<td class="${c.text ? "" : "num " + (r[c.key] < 0 ? "neg" : r[c.key] > 0 ? "pos" : "")}" title="${esc(c.text ? r[c.key] : num(r[c.key]))}">${c.text ? esc(r[c.key]) : num(r[c.key])}</td>`,
                )
                .join("") +
              "</tr>",
          )
          .join("")
      : `<tr><td colspan="${cols.length}" class="empty">${rows.length ? "ไม่พบข้อมูลที่ตรงกับตัวกรอง / คำค้น" : "อัปโหลด Excel / CSV หรือกดทดลองข้อมูลจำลองเพื่อเริ่มต้น"}</td></tr>`;
    t.querySelector("tfoot").innerHTML = "";
    $("rowcount").textContent =
      `${intf.format(tableRows.length)} กลุ่ม · หน้าละ 40 รายการ`;
    $("pageinfo").textContent = `${max ? page : 0} / ${max}`;
    $("prev").disabled = page <= 1;
    $("next").disabled = page >= max;
    $("export").disabled = !tableRows.length;
    $("tableCaption").textContent =
      tab === "matrix"
        ? "ยอดขายสุทธิ (THB) ตามชั่วโมง · รวมคอลัมน์ไม่ระบุเวลา"
        : tab === "reason"
          ? "เฉพาะ Y · หมายเหตุยกเลิกตามไฟล์ ไม่ใช่การยืนยันเหตุคืน"
          : "ทุกยอดอิงตัวกรอง · Share ใช้ยอดสุทธิทั้งหมดก่อนค้นหา";
  }
  function render() {
    const lo = $("from").value ? Date.parse($("from").value + "T00:00:00Z") : 0,
      hi = $("to").value ? Date.parse($("to").value + "T00:00:00Z") : 0;
    if (rows.length && (!lo || !hi || lo > hi)) {
      notify(
        "กรุณาระบุช่วงวันที่ให้ถูกต้อง โดยวันเริ่มต้นต้องไม่เกินวันสิ้นสุด",
        true,
      );
      return;
    }
    if (rows.length && hi - lo > DAY * 3660) {
      notify("กรุณาเลือกช่วงไม่เกิน 10 ปี เพื่อจำกัดปริมาณข้อมูลบนกราฟ", true);
      return;
    }
    if (rows.length && $("message").querySelector(".error")) notify("");
    filtered = rows.length ? selected(rows, lo, hi) : [];
    $("range").textContent = rows.length
      ? `${dateText($("from").value)} — ${dateText($("to").value)}`
      : "ยังไม่มีข้อมูล";
    $("selection").textContent = ` · ${intf.format(filtered.length)} รายการ`;
    $("basis").textContent = `${$("vat").checked ? "รวม" : "ไม่รวม"} VAT · THB`;
    updateKPIs(lo, hi);
    updateCharts();
    renderGroupChart(filtered, $("vat").checked);
    renderTable();
    window.dispatchEvent(new Event("bic:change"));
  }
  async function importFile(file) {
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    if (!["csv", "xlsx", "xls"].includes(ext)) {
      notify("รองรับเฉพาะ .xlsx / .xls / .csv", true);
      return;
    }
    if (file.size > 40 * 1024 * 1024) {
      notify("ไฟล์ใหญ่เกิน 40 MB กรุณาแยกเป็นไฟล์ย่อยก่อน", true);
      return;
    }
    notify("กำลังอ่านไฟล์…");
    $("file").disabled = true;
    try {
      buffer = await file.arrayBuffer();
      let result,
        newbook = null;
      if (ext === "csv") {
        result = normalizeData(csvParse(decodeCSV(buffer)), null);
      } else {
        newbook = XLSX.read(buffer, { type: "array", cellDates: false });
        const candidates = newbook.SheetNames;
        let good = null,
          lastError;
        for (const name of candidates) {
          try {
            const ws = newbook.Sheets[name];
            good = {
              result: normalizeData(
                XLSX.utils.sheet_to_json(ws, {
                  header: 1,
                  raw: true,
                  defval: null,
                }),
                XLSX.utils.sheet_to_json(ws, {
                  header: 1,
                  raw: false,
                  defval: null,
                }),
                !!newbook.Workbook?.WBProps?.date1904,
              ),
              name,
            };
            break;
          } catch (e) {
            lastError = e;
          }
        }
        if (!good) throw lastError || Error("ไม่พบแผ่นข้อมูล");
        result = good.result;
        $("sheet").replaceChildren(...candidates.map((n) => new Option(n, n)));
        $("sheet").value = good.name;
      }
      book = newbook;
      $("sheetField").hidden = !book || book.SheetNames.length < 2;
      commit(result, file.name, false);
    } catch (e) {
      notify("นำเข้าไม่สำเร็จ: " + e.message + " · ข้อมูลเดิมยังคงอยู่", true);
    } finally {
      $("file").disabled = false;
      $("file").value = "";
    }
  }
  function loadDemo() {
    const rr = [];
    let inv = 0;
    const stores = [
        ["00011", "เยาวราช"],
        ["00012", "สีลม"],
        ["00015", "อารีย์"],
      ],
      items = [
        ["P001", "ชาไทยเย็น", "CUP", 65],
        ["P002", "กาแฟลาเต้", "CUP", 85],
        ["P003", "น้ำดื่ม", "BOT", 20],
        ["P004", "ครัวซองต์", "PC", 75],
        ["P005", "ช็อกโกแลตเย็น", "CUP", 80],
        ["P006", "คุกกี้เนย", "PC", 45],
      ];
    let seed = 42871;
    const rand = () => {
      seed = (seed * 16807) % 2147483647;
      return (seed - 1) / 2147483646;
    };
    for (let day = 1; day <= 22; day++) {
      for (let si = 0; si < stores.length; si++) {
        for (let h = 8; h <= 21; h++) {
          const n = Math.round(2 + rand() * 5 + (h >= 11 && h <= 13 ? 4 : 0));
          for (let j = 0; j < n; j++) {
            inv++;
            const status = rand() < 0.035 ? "Y" : "N",
              sgn = status === "Y" ? -1 : 1,
              doc =
                (status === "Y" ? "ACN-" : "ABB-") +
                String(inv).padStart(6, "0"),
              lines = 1 + Math.floor(rand() * 3);
            for (let l = 0; l < lines; l++) {
              const it = items[Math.floor(rand() * items.length)],
                q = 1 + Math.floor(rand() * 2),
                before = it[3] * q,
                discount = rand() < 0.2 ? Math.round(before * 0.1) : 0,
                inc = (before - discount) * sgn,
                ex = Math.round((inc / 1.07) * 100) / 100;
              const dt = parseDate(`${day}/10/2026`);
              rr.push({
                doc,
                key: JSON.stringify([stores[si][0], doc]),
                date: dt.date,
                ms: dt.ms,
                day: dt.day,
                hour: h,
                store: stores[si][0],
                storeName: stores[si][1],
                storeLabel: stores[si][1] + " · " + stores[si][0],
                sku: it[0],
                name: it[1],
                unit: it[2],
                status,
                qty: q * sgn,
                inc,
                ex,
                before: before * sgn,
                disc: discount * sgn,
                reason:
                  status === "Y"
                    ? rand() < 0.5
                      ? "ลูกค้าเปลี่ยนสินค้า"
                      : "บันทึกรายการผิด"
                    : "ไม่ระบุหมายเหตุ",
              });
            }
          }
        }
      }
    }
    book = null;
    $("sheetField").hidden = true;
    commit(
      {
        rows: rr,
        issues: {},
        schema: { discount: true, beforeKey: "มูลค่าก่อนส่วนลด", absent: [] },
      },
      "DEMO · Retail sample · October 2026",
      true,
    );
    $("from").value = "2026-10-15";
    $("to").value = "2026-10-22";
    render();
  }
  function exportCSV() {
    const safe = (v) => {
      let s = String(v ?? "");
      if (/^[=+@\-\t\r\n]/.test(s) && typeof v !== "number") s = "'" + s;
      return '"' + s.replace(/"/g, '""') + '"';
    };
    const lines = [
      columns.map((c) => safe(c.label)).join(","),
      ...tableRows.map((r) =>
        columns.map((c) => safe(r[c.key] ?? "")).join(","),
      ),
    ];
    const blob = new Blob(["\uFEFF" + lines.join("\r\n")], {
        type: "text/csv;charset=utf-8",
      }),
      url = URL.createObjectURL(blob),
      a = document.createElement("a");
    a.href = url;
    a.download = `BIC_${tab}_${$("from").value}_${$("to").value}_${$("vat").checked ? "incVAT" : "exVAT"}.csv`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  for (let h = 0; h < 24; h++) {
    $("hourFrom").add(new Option(pad(h) + ":00", h));
    $("hourTo").add(new Option(pad(h) + ":59", h));
  }
  $("hourTo").value = "23";
  $("file").addEventListener("change", (e) => importFile(e.target.files[0]));
  $("sheet").addEventListener("change", () => {
    if (!book) return;
    try {
      const ws = book.Sheets[$("sheet").value];
      commit(
        normalizeData(
          XLSX.utils.sheet_to_json(ws, { header: 1, raw: true, defval: null }),
          XLSX.utils.sheet_to_json(ws, { header: 1, raw: false, defval: null }),
          !!book.Workbook?.WBProps?.date1904,
        ),
        source + "",
        false,
      );
    } catch (e) {
      notify(
        "ไม่สามารถใช้ Worksheet นี้: " + e.message + " · ข้อมูลเดิมยังคงอยู่",
        true,
      );
    }
  });
  for (const id of [
    "from",
    "to",
    "hourFrom",
    "hourTo",
    "weekday",
    "store",
    "return",
    "unit",
    "vat",
    "period",
    "metric",
    "groupFilter",
  ])
    $(id).addEventListener("change", () => {
      page = 1;
      render();
    });
  $("reset").onclick = resetFilters;
  $("demo").onclick = loadDemo;
  $("toggleFilters").onclick = () => {
    const open = $("sidebar").classList.toggle("open");
    $("toggleFilters").setAttribute("aria-expanded", open);
  };
  let searchTimer;
  $("search").oninput = () => {
    clearTimeout(searchTimer);
    searchTimer = setTimeout(() => {
      page = 1;
      renderTable();
    }, 150);
  };
  document.querySelectorAll("[data-tab]").forEach(
    (b) =>
      (b.onclick = () => {
        tab = b.dataset.tab;
        page = 1;
        sort = { key: "sales", asc: false };
        document.querySelectorAll("[data-tab]").forEach((x) => {
          x.classList.toggle("active", x === b);
          x.setAttribute("aria-pressed", x === b);
        });
        renderTable();
      }),
  );
  $("performance").querySelector("thead").onclick = (e) => {
    const b = e.target.closest("[data-sort]");
    if (!b) return;
    sort =
      sort.key === b.dataset.sort
        ? { key: sort.key, asc: !sort.asc }
        : { key: b.dataset.sort, asc: true };
    page = 1;
    renderTable();
  };
  $("prev").onclick = () => {
    page--;
    renderTable();
  };
  $("next").onclick = () => {
    page++;
    renderTable();
  };
  $("export").onclick = exportCSV;
  window.BIC_APP = {
    getData: () => ({
      rows,
      issues,
      schema,
      source,
      isDemo,
      origin: dataOrigin,
      cachedAt,
    }),
    loadData: (d) => {
      book = null;
      $("sheetField").hidden = true;
      commit(
        { rows: d.rows, issues: d.issues || {}, schema: d.schema || {} },
        d.source || "Latest import",
        false,
        d.origin || "cloud",
        d.savedAt || d.cachedAt,
      );
    },
    clearData: () => {
      dataOrigin = "none";
      rows = [];
      filtered = [];
      schema = {};
      issues = {};
      extent = [];
      source = "";
      isDemo = false;
      $("filename").textContent = "ยังไม่มีไฟล์";
      $("dataNotice").innerHTML = "";
      $("sourceBadge").textContent = "LOCAL";
      resetFilters();
      notify("ออกจากระบบแล้ว ข้อมูลที่เปิดอยู่ถูกล้างจากหน้าจอ");
    },
    subscribe: (fn) => {
      window.addEventListener("bic:change", fn);
      return () => window.removeEventListener("bic:change", fn);
    },
  };
  window.BIC_TEST = {
    parseDate,
    parseNumber,
    normalizeData,
    csvParse,
    aggregate,
    getState: () => ({
      rows,
      filtered,
      stats,
      issues,
      schema,
      chartBuckets,
      tableRows,
    }),
    loadDemo,
  };
  $("groupFilter").append(...GROUPS.map((g) => new Option(g, g)));
  render();
})();
