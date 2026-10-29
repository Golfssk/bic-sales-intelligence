# Dashboard workbench

This is a navigation and presentation release. The existing import, filter,
measure, export, Cloud, and authorization engines are reused; no database
migration or production-data update is part of this release.

## Primary views

- **ภาพรวม**: KPI cards and sales trends.
- **แนวโน้ม**: time-series charts and hour drill-through.
- **สัดส่วนสินค้า**: signed Group sales table and eligible pie chart.
- **รายละเอียด**: searchable/sortable breakdowns, item cards and hourly matrix.

Switching views preserves the single global filter state. The global filter
bar opens/closes at the top. Its active scope remains summarized when closed.
Hour and product cross-filters have an explicit context and clear action.

## Workspace tools

Desktop: choose a tool in the left navigation, or use **เครื่องมือ** in the
header. Collapse/expand the left rail using its bottom control.
Mobile: use the bottom **เครื่องมือ** button; **นำเข้า / บัญชี** also opens
its dedicated panel from the brand header. The inspector fills the screen.

Tools use a single modal inspector with tabs:

1. **สถานะข้อมูล**: current dataset, Cloud sync, import outcome, errors and
   detailed quality-warning messages. The main header retains a compact
   provenance/status indicator. Critical upload errors also surface a compact
   main-page alert; hiding the panel does not silently discard failures.
2. **เปรียบเทียบ**: existing Decision Desk, comparison dates and actual targets.
3. **คุณภาพข้อมูล**: existing audit/source checks and measure definitions.
4. **เจาะสินค้าและบิล**: existing product/store drill and full receipt dialog.
5. **ทีมและเป้าหมาย**: roles, central settings, targets and snapshot history.
6. **นำเข้า / บัญชี**: original file control, encoding, sign-in and library.
7. **วิธีใช้งาน**: short task-oriented workflow.

Close with **×**, Escape, or the desktop backdrop. Focus returns to the opener.
Inspector tab keys: Left/Right, Home/End. Native modal dialogs constrain focus.
Switching tools preserves form drafts; opening the team tab refreshes settings.
Opening a nested receipt/sign-in dialog keeps the parent tool available.

## Mobile behavior

Bottom navigation changes the active view rather than jumping through a long
page. Global filters and detailed sections remain collapsible. Table tabs
become a collapsible picker. Search/sort/pagination still use original data;
item/group cards expose extra fields on demand. Hourly matrix keeps its original
horizontal scroll rather than squeezing 24 columns into the viewport.
Charts resize after view/accordion changes and retain device-pixel resolution.

## Verification

`npm test` and `npm run build`. With the local dev server running, run
`tests/browser-workbench.cjs`, `tests/browser-mobile.cjs`,
`tests/browser-bi.cjs`, and `tests/browser-cloud.cjs` using Node.
Set `TEST_BASE_URL` to the local server and `SMOKE_OUTPUT` for screenshots.
Browser fixtures are synthetic/mocked, never production credentials or sales.
Coverage includes 320–1920px, keyboard/focus, nested dialogs, view state,
filters, receipts, retry, invalid imports, role UI and duplicate-ID checks.
Real cross-device authentication remains dependent on provisioned accounts.
