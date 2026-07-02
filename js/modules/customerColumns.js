import { normalizeText } from "./utils.js";

export function resolveCustomerColumnKey(customerKey, row, columnCode) {
  const profile = window.CUSTOMERS?.[customerKey] || null;
  const columns = profile?.columns || {};
  const columnAliases = profile?.columnAliases || {};
  if (!row) {
    return columns[columnCode] || null;
  }

  const keys = Object.keys(row);
  const primaryName = columns[columnCode];
  if (primaryName && keys.includes(primaryName)) {
    return primaryName;
  }

  const normalizedPrimaryName = normalizeText(primaryName);
  if (normalizedPrimaryName) {
    const normalizedMatch = keys.find((key) => normalizeText(key) === normalizedPrimaryName);
    if (normalizedMatch) {
      return normalizedMatch;
    }
  }

  const candidates = columnAliases[columnCode] || [];
  for (const candidate of candidates) {
    const found = keys.find((key) => normalizeText(key) === normalizeText(candidate));
    if (found) {
      return found;
    }
  }

  return null;
}

export function getRowValueByCustomerColumnCode(customerKey, row, columnCode) {
  const key = resolveCustomerColumnKey(customerKey, row, columnCode);
  return String(row?.[key] ?? "").trim();
}
