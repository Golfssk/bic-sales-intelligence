import { isIceCreamProduct } from './product-groups.js';

// Explicit owner-approved equivalence. No conversion is inferred for grams,
// other product families, or unknown unit labels. Never round stored quantities.
export const ICE_CREAM_UNIT_RULE = 'icecream-unit-to-cup-v1';
const unitCode = unit => String(unit ?? '').normalize('NFKC').trim().toUpperCase();
const sourceUnits = new Set(['UNIT', 'UNITS', 'UNI']);
export function hasIceCreamConversion(row) {
  return row.unitConversion === ICE_CREAM_UNIT_RULE &&
    row.unit === 'CUP' && Number.isFinite(row.sourceQty) &&
    sourceUnits.has(unitCode(row.sourceUnit)) && row.qty === row.sourceQty / 2;
}
export function convertIceCreamUnit(row) {
  if (hasIceCreamConversion(row) || !Number.isFinite(row.qty) ||
      !isIceCreamProduct(row.name) || !sourceUnits.has(unitCode(row.unit))) return row;
  return { ...row, sourceQty: row.qty, sourceUnit: row.unit,
    qty: row.qty / 2, unit: 'CUP', unitConversion: ICE_CREAM_UNIT_RULE };
}
export function normalizeUnitRows(rows) {
  let changed = false;
  const normalized = rows.map(row => { const next = convertIceCreamUnit(row); changed ||= next !== row; return next; });
  return changed ? normalized : rows;
}
export const sourceFieldValue = (row, field) => field === 'qty' && hasIceCreamConversion(row) ? row.sourceQty : row[field];
export const sourceUnit = row => hasIceCreamConversion(row) ? row.sourceUnit : row.unit;
export function conversionSummary(rows) {
  const converted = rows.filter(hasIceCreamConversion);
  return { rule: ICE_CREAM_UNIT_RULE, factor: .5, targetUnit: 'CUP',
    rows: converted.length, sourceQty: converted.reduce((n,r)=>n+r.sourceQty,0),
    cupQty: converted.reduce((n,r)=>n+r.qty,0) };
}
