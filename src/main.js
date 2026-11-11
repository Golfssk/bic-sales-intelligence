import './base.css';
import './theme.css';
import './dashboard.js';
import { initCloud } from './cloud.js';
import { initDrive } from './drive.js';
import { initLatest } from './latest.js';
import { initMobile } from './mobile.js';
// Keep the existing Supabase dashboard live until the Google OAuth client is
// configured. Once enabled, Google Drive is the only sales-data source.
const driveEnabled =
  import.meta.env.VITE_SALES_BACKEND === "google-drive" &&
  Boolean(import.meta.env.VITE_GOOGLE_CLIENT_ID);
if (driveEnabled) {
  initDrive(window.BIC_APP);
} else {
  initLatest(window.BIC_APP);
  initCloud(window.BIC_APP);
  if (import.meta.env.VITE_SALES_BACKEND === "google-drive") {
    const notice = document.createElement("div");
    notice.className = "cloud-access-notice";
    notice.setAttribute("role", "status");
    notice.textContent = "Google Drive ยังไม่เปิดใช้งาน: รอตั้งค่า Google OAuth Client ID ของบริษัท · ขณะนี้ Dashboard ยังอ่านข้อมูลจาก Supabase เดิม";
    document.querySelector("main")?.prepend(notice);
  }
}
initMobile();
import { initBI } from './bi.js';
initBI(window.BIC_APP);
import { initWorkbench } from './workbench.js';
initWorkbench(window.BIC_APP);
import './spotify.css';

import './appearance.css';
import './appearance.js';
