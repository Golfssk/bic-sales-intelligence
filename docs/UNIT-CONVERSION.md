# Ice cream UNIT → CUP

## Explicit business rule

The owner requested **2 UNIT = 1 CUP** for ice cream. Imports accept UNIT, UNI and UNITS (case/outer whitespace insensitive). Existing CUP quantities remain unchanged. Examples: 6 UNIT → 3 CUP; 1 UNIT → 0.5 CUP; a return of -3 UNI → -1.5 CUP. Stored results are not rounded.

Only ice cream recognized by the existing baseline exact-name/family rules is converted. Mutable team Group mappings do not grant physical conversion to unrelated products. G, KG, PC, unknown units and UNIT on other products are unchanged. No grams-to-cups equivalence is invented. Mixed-unit totals still do not represent total physical pieces.

## Traceability and consistency

- Normalized rows retain `sourceQty`, `sourceUnit`, and `unitConversion: icecream-unit-to-cup-v1`; display fields become `qty = sourceQty / 2`, `unit = CUP`.
- Existing CUP plus converted UNIT for the same SKU/name consolidate in CUP item summaries. All quantity charts, filters, receipt lines and summary CSV exports use the same normalized rows. Quantity/UPT may change as expected.
- SKU, dates, documents, signed sales, VAT, discount, return amounts, TC and financial ratios are unchanged. The conversion is not a price adjustment.
- The quality panel shows both displayed-unit totals and original-source-unit totals. Source footer quantity reconciliation and the Cloud upload gate use the original quantities, never the derived CUP total. Monetary reconciliation remains unchanged. Receipt details show the original quantity/unit alongside conversion evidence.
- A visible note identifies converted rows. The audit JSON includes conversion summary and both unit tables.

## Cache and Cloud

The rule runs on CSV/XLSX normalization and dataset activation. A versioned marker plus verified source quantity prevents repeated conversion after cache/Cloud reload. New valid uploads retain both original and displayed fields in the existing JSONB payload; no database migration is needed. Legacy raw snapshots are converted when loaded for viewing, without silently rewriting that stored snapshot or automatically uploading it again. This does not migrate one Supabase project to another.

## Verification

`npm test` includes aliases, unrelated products, untouched units, signs/fractions, source-footer checks, monetary invariance and idempotent serialized round trips. `tests/browser-units.cjs` uses synthetic CSV/XLSX and mocked Supabase: CUP filtering, item merging, receipt evidence, CSV export, atomic persistence, separate mobile restore, legacy snapshot restore and responsive layout. No real sales or live account credentials are used.

```sh
npm test
npm run build
npm run dev -- --port 4180
TEST_BASE_URL=http://localhost:4180 node tests/browser-units.cjs
```
