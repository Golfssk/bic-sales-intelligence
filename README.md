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
The app opens with clearly labelled DEMO data. DEMO is never saved to Cloud.

## 1. Deploy this GitHub repository on Vercel

1. Open https://vercel.com/new and select `Golfssk/bic-sales-intelligence`.
2. Framework: **Vite**; Root Directory: repository root.
3. Build: `npm run build`; Output: `dist` (already configured in `vercel.json`).
4. Deploy. No environment variables are needed to try DEMO or local Excel/CSV import.
5. Copy the deployed HTTPS URL for Supabase Auth configuration below.

To preconfigure the same Supabase project for every browser, optionally set these PUBLIC Vercel environment variables and redeploy:

```text
VITE_SUPABASE_URL=https://YOUR_PROJECT.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_REPLACE_ME
```

NEVER use `service_role`, `sb_secret_…`, database passwords, or personal access tokens in VITE_* variables or source code.
The in-app Connect dialog overrides environment configuration for that browser only.

## 2. Set up Supabase

1. Create a project at https://supabase.com/dashboard.
2. SQL Editor → run the **entire** `supabase/setup.sql` file once.
   The app also offers **Connect Supabase → Copy setup SQL / Download SQL**.
3. Project Settings → API Keys: copy Project URL + **Publishable** key (legacy anon key also supported).
4. Authentication → URL Configuration:
   - Site URL: your actual Vercel URL.
   - Redirect URLs: `https://YOUR_DEPLOYMENT.vercel.app/`.
   - For local development add `http://localhost:5173/`.
5. Enable Email provider; **Invite users** through Authentication → Users.
   The app uses `shouldCreateUser: false` and does not auto-register public visitors.
6. For an internal tool, disable public signups in Supabase once users are provisioned.
7. Production email delivery may require custom SMTP. Check Supabase Auth logs, recipient/rate restrictions and Spam if links do not arrive.
8. Open the app → Connect Supabase → enter URL/Publishable key → Sign in → open the email link in the same browser.

Project configuration alone does not prove SQL/Auth are set up. Cloud operations show actual API errors.

## 3. Import → review → save

- Upload Excel/CSV and verify totals first. It stays **LOCAL** until you click **Save to cloud**.
- Save requires an invited, signed-in Supabase user.
- Data library → Open dataset to reopen a snapshot from another device.
- Data library → Delete permanently removes the snapshot and its rows.
- Imports are separate snapshots, not automatically merged.
- Normalized row content is hashed (SHA-256) to reject duplicate snapshots per user. Changing only the filename does not bypass this check.
- Cloud limits: **25,000 rows** and **4.9 MB normalized JSON** per snapshot. Split larger files.
- Local file upload limit: 40 MB. Local Excel/CSV parsing runs in the browser.
- Original Excel/CSV files are **not** stored in Supabase Storage.

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
