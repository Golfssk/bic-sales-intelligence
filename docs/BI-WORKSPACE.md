# BI decision desk and shared workspaces

## User workflow (Thai)

1. เปิดเว็บและเข้าสู่ระบบบัญชีเดิม ข้อมูลส่วนตัวเดิมยังอยู่ ไม่ถูกแชร์เอง
2. ในเครื่องมือด้านข้าง เปิดแท็บ **เปรียบเทียบ** (ภาพรวมเพื่อการตัดสินใจ) เลือกช่วงก่อนหน้า / ย้อนหลัง 7 วัน / กำหนดเอง ใช้ตัวกรองรวมเดียวกัน ถ้าช่วงเทียบไม่อยู่ในไฟล์จะไม่แสดง 0% แทนข้อมูลที่ขาด
3. เปิด **ตรวจสอบตัวเลขและแหล่งข้อมูล** เพื่อเทียบสรุปท้ายไฟล์ ตรวจ VAT และแยกจำนวนตามหน่วย สามารถดาวน์โหลดผลตรวจ JSON ได้ การเปรียบเทียบผลรวมบนหน้าเดียวกันไม่ใช่ independent source reconciliation
4. เปิด **เจาะสินค้าและบิล** หรือแตะ Group ใน Pie / ตาราง ยอดทั้ง Dashboard เปลี่ยนตามตัวกรองนั้น เปิดเลขบิลเพื่อดูแถวเต็มในไฟล์ พร้อมยอดที่ตรงตัวกรองเทียบยอดเต็มบิล N/Y แยกกัน กดล้างการเจาะเพื่อกลับภาพรวม
5. ด้านล่างเปิด **ทีม เป้าหมาย และประวัติข้อมูล** สร้างทีมถ้าต้องการแชร์ จากนั้นเลือกทีมและอัปโหลดไฟล์ที่ต้องการแชร์ใหม่ การสร้างทีมไม่ย้ายไฟล์ส่วนตัว
6. Admin เพิ่มอีเมลบัญชีที่มีอยู่แล้วใน Supabase project นี้ เลือก Admin/Uploader/Viewer หากยังไม่มีบัญชี ให้ผู้ดูแลสร้างใน Supabase Authentication ก่อน ไม่ใช้รหัสผ่านบัญชี Admin ร่วมกัน
7. คอมและมือถือเลือกทีมเดียวกัน โดยแต่ละคนใช้บัญชีตัวเอง รอขึ้น CLOUD ก่อนปิดหน้า การกลับมาที่แท็บ/เปิดหน้าใหม่เช็กชุดล่าสุด ไม่ใช่ realtime subscription ต่อเนื่อง
8. Admin ตั้งเป้าหมายจริงโดยระบุช่วงวันที่และฐาน VAT เป้าหมายจะแสดงเฉพาะช่วงและฐานตรงกัน เมื่อไม่ได้กรองย่อย ไม่สร้าง/เฉลี่ยเป้าหมายขึ้นเอง
9. Admin แก้ชื่อสินค้า -> Group กลาง (มีผลทุก SKU ที่ชื่อ normalized เดียวกัน) และยืนยันว่าเวลา POS คือเวลาขายหรือเวลาบันทึก หากไม่ยืนยันให้คง unverified
10. ประวัติแสดงชุดเก่าได้ แต่ Dashboard ใช้ทีละหนึ่งชุด Admin/Uploader สามารถยืนยันคืนชุดเก่าเป็นชุดล่าสุด ทั้งทีมจะเห็นชุดนั้น ไม่บวกซ้ำ

## Data safeguards

- Compatible ex-VAT discount numerator and denominator. Legacy snapshots missing `beforeEx` require reimport; no backfilled guesses.
- Numeric display is one decimal; calculations retain original precision.
- Core-rejected imports and mismatched/incomplete explicit footer controls do not replace the Cloud snapshot. Ambiguous multiple footers cannot prove reconciliation and are labeled unverified.
- COUNTA counts rows, not units. Ice cream UNIT/UNI/UNITS use the owner-approved 2:1 CUP equivalence; G and other products are unchanged. Original unit/quantity are retained and used to reconcile source footers. Displayed and source-unit totals are separate in the quality panel. See [unit conversion](UNIT-CONVERSION.md).
- Before/after mapping/target settings are audited, using optimistic version locking to prevent overwriting another admin's edits. Refresh the workspace after a version conflict before retrying.
- Receipt drill-through only proves the lines in the loaded file; it is not a certified complete POS receipt.
- Comparison coverage uses file min/max dates, not an independent completeness manifest. Missing dates require verification with POS. Custom unequal/overlapping windows are labeled; zero baselines display —.
- Date exclusion affects the comparison panel only; KPI/global filters remain unchanged. Targets follow the global exact date range, not the excluded comparison range.
- Settings are fetched on sign-in/scope switch and reopening workspace; returning to an open workspace refreshes them. Not a live subscription.

## Roles and database

- Private: owner only, default for existing users and snapshots.
- Admin: members, central config, upload/restore, explicit deletion via API.
- Uploader: read + validated atomic upload/restore; cannot change members/settings/delete.
- Viewer: read only, enforced by PostgreSQL RLS and RPC checks, not just UI.
- Members must already have an Auth account. There is no public registration/invitation endpoint in this UI.
- No real dataset or account credentials are in the repository. `tests/browser-*.cjs` use synthetic fixtures and mocked Supabase responses. `tests/workspaces.test.js` validates real SQL in an isolated PGlite database.

Fresh empty database: run `supabase/setup.sql`, then `supabase/migrations/20261030_bi_workspaces.sql`. Existing project: migration only, once. Do not rerun setup.sql after adding workspaces, as it restores legacy owner-only policies/functions.

## Verification

```sh
npm test
npm run build
npm run dev -- --port 4176
TEST_BASE_URL=http://localhost:4176 node tests/browser-bi.cjs
TEST_BASE_URL=http://localhost:4176 node tests/browser-mobile.cjs
TEST_BASE_URL=http://localhost:4176 node tests/browser-cloud.cjs
```

Tests do not create live users, share private data or invent targets. SQL has been applied live separately; user-facing workspace membership and targets require the actual administrator's choices.

## Security review notes

The Supabase security advisor reports the authenticated SECURITY DEFINER RPCs. This is intentional for bounded atomic operations with explicit `auth.uid()`/workspace-role checks, pinned search paths, no anonymous execute, and no direct settings/member writes. The SQL tests exercise allowed/denied roles, cross-team isolation, last-admin protection and stale settings versions. See the [Supabase SECURITY DEFINER advisory](https://supabase.com/docs/guides/database/database-linter?lint=0029_authenticated_security_definer_function_executable).

The live Auth advisor also reports **Leaked Password Protection disabled**. The project owner should enable it when available for the plan in Authentication password security; this release does not change the project's Auth policy. See [password protection guidance](https://supabase.com/docs/guides/auth/password-security#password-strength-and-leaked-password-protection).
