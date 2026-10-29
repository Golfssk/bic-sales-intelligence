# BIC · Sales Intelligence

Spotify-inspired dark retail dashboard. **Vite SPA + Supabase Auth/Postgres + Vercel**.
This release keeps the existing dashboard calculation engine and separates Cloud integration into a module.
Not affiliated with Spotify or Lotus’s. Uses Arial + embedded Noto Sans Thai, not proprietary Spotify fonts.

## Local development

```bash
npm ci
npm run dev
```

Node.js 22.12+ recommended. `npm run build` produces `dist/`.
The app opens with the latest dataset for the signed-in account, or an empty view. DEMO is explicit and is never saved to Cloud.

## Deploy on Vercel

1. Import `Golfssk/bic-sales-intelligence` at https://vercel.com/new.
2. Framework: **Vite**, repository root, build `npm run build`, output `dist`.
3. Production project is **gknqdodyvejvdlaxucrs** at https://gknqdodyvejvdlaxucrs.supabase.co.
   Its browser-safe publishable key and URL are built into `src/cloud-config.js`, so every device uses the same project without manual configuration.
4. Optional public Vercel variables are supported only for this project. Old project environment variables and browser settings are ignored.
5. Never put service-role keys, secret API keys, database passwords or personal tokens in source or VITE_* variables.

## One-time account setup (administrator)

The database schema is in `supabase/setup.sql`; it has already been applied to the project above.

1. Supabase project → **Authentication → Users → Add user → Create new user**.
2. Choose the intended user's email and a strong password. Confirm the email only for an identity the administrator has verified. This is not an email invitation or OTP flow.
3. Enable the Email provider with password sign-in. The app does not register accounts. For internal use, disable public signups after provisioning users.
4. On the website, open **เข้าสู่ระบบ** and sign in with that email and password. No email link or SMTP delivery is required for password sign-in. Account recovery still requires a configured provider/email process.
5. Use the **same account** on mobile and computer. Accounts are isolated, not a shared-team workspace.

No old-project records or Auth users are migrated automatically. Do not delete the old project until a deliberate migration has been verified.

## Import → automatic Cloud save → latest-only display

- Sign in, then choose Excel/CSV. Valid real data automatically uploads; no separate Save click is needed.
- Wait for **CLOUD · บันทึกชุดล่าสุดแล้ว** before closing the page. Reading a file successfully is not confirmation that it reached Cloud.
- If not signed in, imported data stays local. Sign in to upload the current session's import.
- Invalid core rows or failed uploads **do not replace the prior Cloud dataset**. Fix the file or use the retry button. Source files should be retained.
- New uploads replace the active view; historical snapshots are retained separately, never added to the current totals.
- Opening/reloading the app or returning to its tab checks for the latest Cloud snapshot. It is not a continuously updating realtime subscription.
- Stale browser caches are never automatically pushed based on device timestamps.
- Data library shows only the latest snapshot. Delete permanently removes that snapshot and its rows; the preceding historical snapshot can then become latest.
- Normalized row content is hashed for deduplication per account. Reuploading the same dataset reactivates the existing snapshot.
- Cloud limits: **25,000 rows** and **4.9 MB normalized JSON** per snapshot. Local file limit: 40 MB.
- Original Excel/CSV files are not stored in Supabase Storage; validated normalized records are stored in Postgres.
- Test credentials and synthetic data in browser mocks are not real production accounts. Real cross-device acceptance requires a provisioned account.

## Security model

- `bic_imports`: owner, name, hash, row count, metadata.
- `bic_sales_rows`: normalized JSONB line items linked to a snapshot.
- `bic_ingest`: bounded, atomic RPC. Assigns owner from `auth.uid()`, never a caller-supplied owner.
- RLS restricts reads/deletes to the authenticated owner. Direct row inserts/updates are denied.
- Anonymous users cannot read or write Cloud records.
- Deleting a snapshot cascades to its rows.
- Each account has a **private workspace**. This is not a shared-team data model; add memberships/RLS before enabling team sharing.
- Sessions are remembered in the browser. Sign out on shared devices.
- Public URL/key config is stored in localStorage. Latest non-demo sales data is cached in IndexedDB, isolated by project + account (or local guest). A new valid upload replaces the cached dataset; invalid uploads preserve it. Signing out clears the active account cache and display. Do not use shared browser profiles for private sales data.
- Vercel sets CSP, anti-framing, MIME and referrer-policy headers. HTTPS endpoints are allowed for user-configured Supabase projects; do not add untrusted third-party scripts.
- GitHub/Vercel tokens and database secrets do not belong in this repository.

## Supported data and formulas

Required Thai columns: `วันที่เอกสาร`, `เลขที่เอกสาร`, `คืนสินค้า`, `จำนวน`, `มูลค่าขาย`, `มูลค่าขายรวม Vat.`.
Optional columns from the provided schema enrich product/store/time/discount reporting.
Header must appear within the first 50 rows. Duplicate headers are rejected.

- Date filter / weekday use **วันที่เอกสาร**; hours use **วันที่สร้างข้อมูล** independently.
- CE/BE dates, DD/MM/YYYY, ISO date, Excel serials, formatted leading zeros and UTF-8/Windows-874 CSV are supported.
- Blank summary rows without document numbers and invalid core rows are excluded with a quality report.
- Missing times are not invented as midnight. They remain in daily/KPI totals but not Hourly/Matrix/hour-filtered results.
- Return signs are preserved, not silently converted. Positive Y values raise a warning.
- Identical rows are reported but not deleted automatically.
- Sales = signed SUM of selected VAT basis.
- Return rate = ABS(Y total) / N total × 100, not net sales as denominator.
- Discount = discount on N / before-discount amount on N. Falls back to `มูลค่าขายก่อนส่วนลด` only if the primary column is absent. VAT toggle does not invent a new tax basis for discounts.
- TC = distinct (store, document) on N; TA = Net Sales/TC; UPT = net quantity/TC. No denominator means —.
- Mixed units must not be read as total physical pieces.
- Per-day KPIs use selected calendar days, including days without rows, with the weekday filter applied.
- Previous-window comparisons use an equal number of days only if the loaded date extent covers the prior window; rates use percentage points (pp).
- Missing chart buckets are null, not zero. Variance uses the arithmetic mean of calculable bucket values. Weekday charts show totals, not per-day averages.
- TC may overlap across product/time groups, so group counts are not additive.
- Share uses signed filtered net sales before table search and can be negative or exceed 100%.
- Return reason uses the cancellation-note field on Y and is not independently verified.
- CSV export covers all matching groups, not just the visible page, and escapes text that could trigger spreadsheet formulas.

The full KPI definitions are also available inside the dashboard.

## Testing

```bash
npm test         # local PostgreSQL WASM RLS/RPC + safe-key configuration tests
npm run build
```

Database tests use PGlite, not your live Supabase project. Real Vercel/Auth/SMTP needs a deployment smoke test after setup.
Optional GitHub Actions template: `docs/ci-workflow.example.yml`. Move it to `.github/workflows/ci.yml` only when the GitHub connection has Workflows write permission.

Current browser checks covered Excel, Thai CSV encodings, VAT/date/hour/return filters, expected KPI totals, matrix reconciliation, sorting/search/export and mobile layout.
The real file `262202_2026-10-22_1736.xlsx` was not supplied and is not included. Reconcile with actual POS totals before business use.

## Source layout

```text
index.html            Dashboard markup
src/dashboard.js      Existing import/filter/KPI/chart/table engine + Cloud adapter
src/cloud.js          Supabase Auth, config dialog, snapshots, paginated reads
src/base.css          Base responsive styles and embedded Thai font
src/theme.css         Spotify-inspired surfaces, green accent and pill components
supabase/setup.sql    Tables, RLS and atomic import RPC
tests/                Database and configuration tests
vercel.json           Build, routing and response headers
```

## Libraries

Vite (MIT), Supabase JS (MIT), Chart.js (MIT), SheetJS CE 0.20.3 (Apache-2.0; official pinned distribution), Noto Sans Thai (SIL OFL 1.1).

## Latest dataset + Group release

- Startup is empty or restores the most recent real dataset; sample data is **opt-in only**.
- “Latest” means the **entire latest uploaded file**, not just the last calendar day. A valid new file replaces the view; rows are never appended to an old file.
- Without Supabase: the latest file persists only in this browser's IndexedDB. It is not a global default for other visitors/devices.
- With configured Supabase + authenticated account: imports auto-save; startup automatically opens that account's latest activated Cloud dataset. Manual Save is available for retry. Offline/failed saves remain local and show an error.
- Re-uploading identical content reactivates that snapshot as latest without duplicate sales rows. Older snapshots are retained privately in the DB, but the app library/view exposes only the latest. No destructive bulk delete is performed.
- **Migration required:** re-run `supabase/setup.sql` on an existing BIC project to add `activated_at` and the updated atomic ingest RPC. Do not run against unrelated business projects. No live Supabase migration was applied by this release.
- Latest is **per account**, not shared across accounts; team-wide sharing requires an explicit membership/RLS design.
- Product Groups follow supplied exact names first, then ordered family rules. Gelato/slushy/bakery take precedence over sauce ingredients. Unknown products stay in `Unmapped / รอตรวจสอบ` and remain included in totals. Item view exports Group and Mapping provenance.
- Group pie and table both use signed filtered Net Sales on the selected VAT basis; product search does not change the denominator. If any group is negative or the total is not positive, no misleading pie is drawn; the signed table remains available.
- KPI order: Total Sales, Net quantity, Transaction · TC, Basket size · TA, Return, Discount rate.
- Real POS workbook is not included in source or GitHub. The latest attachment was a screenshot only, which cannot supply line-item data.

## Global filter bar

Date range, weekday, store, product Group and transaction type are always visible above the KPI cards (including mobile). They share the original single filter state and update KPIs, all charts, group share and performance tables together. Additional hour/unit/VAT controls expand within the same bar; Reset restores all filters. The sidebar now handles file import only. Numeric metrics retain one fixed decimal place.

## Regression checks

`npm test` covers private atomic SQL ingestion, deduplication, project selection,
validation and existing product mapping. `npm run build` builds the SPA.
With the development server running on port 4174, run
`node tests/browser-cloud.cjs` for synthetic mocked password-login, automatic
upload, latest-only mobile restore, failure/retry and invalid-import checks.
It never writes to production. Set `CHROMIUM_PATH` if Chromium is not on PATH.

## Mobile workspace

At 760px and below the UI uses collapsible filters, charts, group sales and
performance sections. A bottom navigation bar opens the overview, charts or
details. Existing data-level tabs become a collapsible picker; item and group
rows are displayed as cards with expandable extra fields. Search, sorting,
CSV export and pagination still use the original calculation engine. Hourly
matrix retains its horizontally scrollable table, with the store name pinned.
Clicking an hour opens the item details section automatically. Desktop keeps
its original tables and tab controls. No Cloud schema or formula changes.

Start the development server and run `node tests/browser-mobile.cjs` for
synthetic mobile interaction tests at 320–1440px and high-DPI screenshots.
Set `CHROMIUM_PATH`, `TEST_BASE_URL` or `SMOKE_OUTPUT` as needed.
