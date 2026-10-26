import Chart from "chart.js/auto";
import { GROUPS, GROUP_COLORS, groupSales } from "./product-groups";
let chart = null;
const fmt = (v) =>
  v == null
    ? "—"
    : new Intl.NumberFormat("en-US", { maximumFractionDigits: 2 }).format(v);
const esc = (v) =>
  String(v ?? "").replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function renderGroupChart(rows, vat = true) {
  const root = document.getElementById("groupChartPanel");
  if (!root) return;
  const result = groupSales(rows, (r) => (vat ? r.inc : r.ex));
  if (chart) {
    chart.destroy();
    chart = null;
  }
  const usable = result.groups.filter((g) => g.sales > 0),
    valid = result.total > 0 && !result.negative;
  document.getElementById("groupSalesTotal").textContent =
    "฿" + fmt(result.total);
  document.getElementById("groupChartBasis").textContent =
    `Net sales · ${vat ? "Inc. VAT" : "Ex. VAT"} · ตามตัวกรองทั้งหมด`;
  const canvas = document.getElementById("groupPie"),
    note = document.getElementById("groupPieEmpty");
  canvas.hidden = !valid;
  note.hidden = valid;
  note.textContent = result.negative
    ? "Pie ไม่แสดงเมื่อมี Group ยอดสุทธิติดลบ เพราะสัดส่วนวงกลมจะทำให้เข้าใจผิด ดูยอด signed จริงในตารางด้านข้าง หรือเลือกเฉพาะขายปกติ (N)"
    : result.total <= 0
      ? "ยังไม่มีฐานยอดขายบวกสำหรับคำนวณ Pie chart · อัปโหลดข้อมูลจริงหรือปรับตัวกรอง"
      : "";
  if (valid) {
    chart = new Chart(canvas, {
      type: "pie",
      data: {
        labels: usable.map((g) => g.group),
        datasets: [
          {
            data: usable.map((g) => g.sales),
            backgroundColor: usable.map(
              (g) => GROUP_COLORS[GROUPS.indexOf(g.group)],
            ),
            borderColor: "#181818",
            borderWidth: 3,
            hoverOffset: 8,
          },
        ],
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        animation: false,
        plugins: {
          legend: { display: false },
          tooltip: {
            callbacks: {
              label: (c) =>
                ` ฿${fmt(c.parsed)} · ${fmt((c.parsed / result.total) * 100)}%`,
            },
          },
        },
      },
    });
  }
  const body = document.getElementById("groupShareBody");
  body.innerHTML =
    result.groups
      .map(
        (g) =>
          `<tr><td><span class="group-swatch" style="background:${GROUP_COLORS[GROUPS.indexOf(g.group)]}"></span>${esc(g.group)}</td><td class="num ${g.sales < 0 ? "neg" : ""}">${fmt(g.sales)}</td><td class="num">${fmt(g.share)}${g.share === null ? "" : "%"}</td><td class="num">${fmt(g.products)}</td></tr>`,
      )
      .join("") || '<tr><td colspan="4" class="empty">ยังไม่มีข้อมูล</td></tr>';
  const unmapped = result.groups.find((g) => g.group === GROUPS.at(-1));
  document.getElementById("mappingNotice").textContent = unmapped
    ? `รอตรวจสอบ ${fmt(unmapped.products)} สินค้า · ยอด ฿${fmt(unmapped.sales)} (รวมในยอดทั้งหมด ไม่ถูกตัดออก)`
    : rows.length
      ? "จัดกลุ่มได้ครบ · ชื่อที่อยู่นอก exact mapping ใช้ Family rule ที่ตรวจสอบได้"
      : "ใช้แมปปิ้งที่กำหนดและ Family rule · สินค้าที่ยังไม่แน่ใจจะแสดง Unmapped";
  canvas.setAttribute(
    "aria-label",
    "สัดส่วนยอดขายสุทธิราย Group ดูยอดและเปอร์เซ็นต์จากตารางข้างกราฟ",
  );
  return result;
}
