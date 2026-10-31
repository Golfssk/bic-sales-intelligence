# BIC · Sales Intelligence

Spotify-inspired dark retail analytics workbench. **Vite SPA + Supabase Auth/Postgres + Vercel**.
The workbench keeps the existing calculation engine and separates analysis views from on-demand workspace tools. See [UX workbench](docs/UX-WORKBENCH.md) and [design system](docs/DESIGN-SYSTEM.md).
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

The base schema and `supabase/migrations/20261030_bi_workspaces.sql` have been applied to the project above. Do not rerun base setup on an existing database. For a brand-new empty database only, run `setup.sql`, then `20261030_bi_workspaces.sql`, then `20261031_monthly_batched_imports.sql`, in that order. Existing databases apply only the new monthly/batch migration after the workspace migration.

1. Supabase project → **Authentication → Users → Add user → Create new user**.
2. Choose the intended user's email and a strong password. Confirm the email only for an identity the administrator has verified. This is not an email invitation or OTP flow.
3. Enable the Email provider with password sign-in. The app does not register accounts. For internal use, disable public signups after provisioning users.
4. On the website, open **เข้าสู่ระบบ** and sign in with that email and password. No email link or SMTP delivery is required for password sign-in. Account recovery still requires a configured provider/email process.
5. Use the **same account** on mobile and computer for private snapshots, or select the same team workspace with separate member accounts. Existing private files are never automatically shared.

No old-project records or Auth users are migrated automatically. Do not delete the old project until a deliberate migration has been verified.

## Import → staged monthly Cloud save → cross-month analysis

- Sign in, then choose Excel/CSV. Valid real data automatically uploads; no separate Save click is needed.
- Open **สถานะข้อมูล** and wait for **CLOUD · บันทึกชุดล่าสุดแล้ว** before closing the page. Reading a file successfully is not confirmation that it reached Cloud.
- If not signed in, imported data stays local. Sign in to upload the current session's import.
- Invalid core rows or failed uploads **do not replace the prior Cloud dataset**. Fix the file or use the retry button. Source files should be retained.
- New uploads replace the active view; historical snapshots are retained separately, never added to the current totals.
- Opening/reloading the app or returning to its tab checks for the latest Cloud snapshot. It is not a continuously updating realtime subscription.
- Stale browser caches are never automatically pushed based on device timestamps.
- Data library lists monthly snapshots (up to the most recent 120). Select one version per month and analyze up to 12 months together. Delete permanently removes the selected snapshot and its rows; the preceding historical version can then become available.
- Normalized row content is hashed for deduplication per account. Reuploading the same dataset reactivates the existing snapshot.
- Cloud capacity: **250,000 rows per monthly Dataset**. Uploads use **2,000-row batches** (each batch remains below the RPC payload bound); the browser no longer sends a 250k-row JSON payload in one request. Local file limit: 40 MB.
- Each Cloud Dataset is restricted to one document-date month (`YYYY-MM`). Monthly snapshots remain separate and independently versioned. Data library can select up to 12 distinct months and load them into one analysis session; this combines rows in memory for reporting and never rewrites or adds one month into another stored Dataset.
- The default page restore remains the most recently activated single monthly Dataset. Use **Data library → select months → Analyze selected months** for cross-month reporting. Choose only one version for each month.
- Original Excel/CSV files are not stored in Supabase Storage; validated normalized records are stored in Postgres.
- Test credentials and synthetic data in browser mocks are not real production accounts. Real cross-device acceptance requires a provisioned account.

## Security model

- `bic_imports`: owner, name, hash, row count, metadata.
- `bic_sales_rows`: normalized JSONB line items linked to a snapshot.
- `bic_begin_import`, `bic_append_import_batch`, and `bic_complete_import`: authenticated staged-upload RPCs. Each batch is limited to 2,000 rows; the final snapshot is activated only after all expected row indexes are present and verified. The previous active snapshot remains intact when upload fails. Owner is always derived from `auth.uid()`; team uploads additionally require admin/uploader role.
- Incomplete staging sessions are private to their owner/workspace and can be aborted by the uploader. Staging tables have RLS enabled and no direct client grants.
- RLS restricts reads/deletes to the authenticated owner. Direct row inserts/updates are denied.
- Anonymous users cannot read or write Cloud records.
- Deleting a snapshot cascades to its rows.
- Each account starts in a **private workspace**. Team sharing requires intentional workspace selection and membership; server-side RLS/RPC checks enforce admin/uploader/viewer roles. Existing private files are not automatically shared.
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
- Discount = SUM `มูลค่าส่วนลด` on N / SUM `มูลค่าขายก่อนส่วนลด` on N, both ex VAT. Never divide an ex-VAT numerator by an inc-VAT denominator. Older normalized snapshots without `beforeEx` show — until the original file is reimported. VAT toggle does not change this ratio.
- TC = distinct (store, document) on N; TA = Net Sales/TC; UPT = net quantity/TC. No denominator means —.
- Ice cream imports use the owner-approved **2 UNIT / UNI = 1 CUP** rule (also accepts UNITS). Original quantity/unit are retained for audit; existing CUP, grams and other products are unchanged. Monetary fields are never converted. See [unit conversion](docs/UNIT-CONVERSION.md).
- Mixed units must not be read as total physical pieces.
- Per-day KPIs use selected calendar days, including days without rows, with the weekday filter applied.
- Previous-window comparisons use an equal number of days only if the loaded date extent covers the prior window; rates use percentage points (pp).
- Missing chart buckets are null, not zero. Variance uses the arithmetic mean of calculable bucket values. Weekday charts show totals, not per-day averages.
- Sales Rhythm supports hourly, daily, monthly and quarterly aggregation. Monthly/quarterly buckets follow the document date, include empty periods as null, and do not alter the global date/store/Group/transaction filters or sales formulas.
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
src/theme.css         Base dark surfaces and green accent
src/workbench.js      Primary views and modal workspace-tools inspector
src/workbench.css     Responsive desktop rail and mobile workbench
src/spotify.css       Near-black / green presentation, readable contrast and touch controls
src/visual-tokens.js  Shared chart presentation palette
supabase/setup.sql    Tables, RLS and atomic import RPC
tests/                Database and configuration tests
vercel.json           Build, routing and response headers
```

## Libraries

Vite (MIT), Supabase JS (MIT), Chart.js (MIT), SheetJS CE 0.20.3 (Apache-2.0; official pinned distribution), Noto Sans Thai (SIL OFL 1.1).

## Latest dataset, Groups and filters

- A valid upload replaces the entire current dataset; it never appends to old totals.
- Latest activation is scoped to a private account or deliberately selected team workspace.
- Historical snapshots are retained separately; explicit restore is permission-checked.
- Exact/family Group rules retain unmapped products in totals. Signed Group shares use
  the selected VAT basis; product search does not change their denominator.
- Global date, weekday, store, Group and transaction filters share one state across
  views. Expand the top filter bar to edit them; hour/unit/VAT controls remain there.
- Metrics retain one decimal place. Missing denominators remain —, not invented zeroes.
- Current schema/account setup is documented above and in [BI workspace](docs/BI-WORKSPACE.md).

## Regression checks

`npm test` covers private atomic SQL ingestion, deduplication, project selection,
validation and existing product mapping. `npm run build` builds the SPA.
With the development server running on port 4174, run
`node tests/browser-cloud.cjs` for synthetic mocked password-login, automatic
upload, latest-only mobile restore, failure/retry and invalid-import checks.
It never writes to production. Set `CHROMIUM_PATH` if Chromium is not on PATH.

## Responsive workspace

Desktop has a collapsible left rail, four primary analysis views, and a closable
right-side tool inspector. Mobile uses compact bottom navigation and a full-screen
tool sheet. Cloud/import messages, comparison, quality checks, receipts and team
settings live in tool tabs rather than forming a long inline page.
Filters, charts and detail pickers remain expandable. Tables become searchable,
sortable cards on mobile; hourly matrix retains horizontal scrolling. Hour clicks
open the matching item detail view without changing the calculation engine.

See [UX workbench](docs/UX-WORKBENCH.md) for workflows and keyboard controls.
Run `node tests/browser-workbench.cjs` and `node tests/browser-mobile.cjs` against
a local dev server. Set `CHROMIUM_PATH`, `TEST_BASE_URL`, `SMOKE_OUTPUT` as needed.
