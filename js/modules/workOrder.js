import { CONFIG } from "../config.js";
import { normalizeText } from "./utils.js";

export function resolveColumnKey(row, columnCode) {
  if (!row) {
    return CONFIG.COLUMNS[columnCode] || null;
  }

  const keys = Object.keys(row);
  const primaryName = CONFIG.COLUMNS[columnCode];
  if (primaryName && keys.includes(primaryName)) {
    return primaryName;
  }

  const normalizedTarget = normalizeText(primaryName);
  const normalizedMatch = keys.find((key) => normalizeText(key) === normalizedTarget);
  if (normalizedMatch) {
    return normalizedMatch;
  }

  const candidates = CONFIG.COLUMN_ALIASES[columnCode] || [];
  for (const candidate of candidates) {
    const found = keys.find((key) => normalizeText(key) === normalizeText(candidate));
    if (found) {
      return found;
    }
  }

  return null;
}

export function findWorkOrderRows(rows, keyword) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }

  const workOrderKey = resolveColumnKey(rows[0], "WORK_ORDER");
  if (!workOrderKey) {
    return [];
  }

  const normalizedKeyword = normalizeText(keyword);

  function parseWorkOrderTokens(row) {
    const raw = String(row[workOrderKey] ?? "");
    return raw
      .split(/[\s,，;；/]+/)
      .map((part) => String(part).trim())
      .filter(Boolean)
      .map((token) => {
        const [workOrderRaw, qtyRaw] = token.split("*");
        const workOrder = normalizeText(workOrderRaw);
        const qty = Number(String(qtyRaw ?? "").trim());
        return {
          workOrder,
          qty: Number.isInteger(qty) && qty > 0 ? qty : null
        };
      })
      .filter(Boolean);
  }

  const exactMatches = rows.filter((row) => {
    const tokens = parseWorkOrderTokens(row);
    return tokens.some((token) => token.workOrder === normalizedKeyword);
  });
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const partialMatches = rows.filter((row) => {
    const tokens = parseWorkOrderTokens(row);
    return tokens.some((token) => token.workOrder.includes(normalizedKeyword));
  });
  if (partialMatches.length > 0) {
    return partialMatches;
  }

  return rows.filter((row) =>
    Object.values(row).some((value) => normalizeText(value).includes(normalizedKeyword))
  );
}

export function findRowsByColumnCode(rows, columnCode, keyword) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const key = resolveColumnKey(rows[0], columnCode);
  if (!key) {
    return [];
  }
  const normalizedKeyword = normalizeText(keyword);

  function getTokens(row) {
    const raw = String(row[key] ?? "");
    return raw
      .split(/[\s,，;；/]+/)
      .map((part) => normalizeText(part))
      .filter(Boolean);
  }

  const exactMatches = rows.filter((row) => getTokens(row).includes(normalizedKeyword));
  if (exactMatches.length > 0) {
    return exactMatches;
  }

  const partialMatches = rows.filter((row) => getTokens(row).some((token) => token.includes(normalizedKeyword)));
  if (partialMatches.length > 0) {
    return partialMatches;
  }

  return [];
}

export function resolveQtyByPairedSlash(row, query, searchColumnCode, qtyColumnCode) {
  if (!row) {
    return 0;
  }
  const searchKey = resolveColumnKey(row, searchColumnCode);
  const qtyKey = resolveColumnKey(row, qtyColumnCode);
  if (!searchKey || !qtyKey) {
    return 0;
  }

  const normalizedQuery = normalizeText(query);
  const searchRaw = String(row[searchKey] ?? "").trim();
  const qtyRaw = String(row[qtyKey] ?? "").trim();

  const searchSlashTokens = searchRaw.split("/").map((item) => String(item).trim()).filter(Boolean);
  const qtySlashTokens = qtyRaw.split("/").map((item) => String(item).trim()).filter(Boolean);

  if (searchSlashTokens.length > 1 && qtySlashTokens.length > 1) {
    const index = searchSlashTokens.findIndex((token) => normalizeText(token) === normalizedQuery);
    if (index >= 0 && index < qtySlashTokens.length) {
      const parsed = Number(qtySlashTokens[index]);
      if (Number.isInteger(parsed) && parsed > 0) {
        return parsed;
      }
    }
  }

  const parsedQty = Number(qtyRaw);
  return Number.isInteger(parsedQty) && parsedQty > 0 ? parsedQty : 0;
}

export function resolveWorkOrderQty(row, query, fallbackQty) {
  if (!row) {
    return Number(fallbackQty) || 0;
  }

  const workOrderKey = resolveColumnKey(row, "WORK_ORDER");
  if (!workOrderKey) {
    return Number(fallbackQty) || 0;
  }

  const normalizedQuery = normalizeText(query);
  const raw = String(row[workOrderKey] ?? "");
  const tokens = raw
    .split(/[\s,，;；/]+/)
    .map((part) => String(part).trim())
    .filter(Boolean);

  for (const token of tokens) {
    const [workOrderRaw, qtyRaw] = token.split("*");
    if (normalizeText(workOrderRaw) !== normalizedQuery) {
      continue;
    }
    const parsedQty = Number(String(qtyRaw ?? "").trim());
    if (Number.isInteger(parsedQty) && parsedQty > 0) {
      return parsedQty;
    }
  }

  const fallback = Number(fallbackQty);
  return Number.isInteger(fallback) && fallback > 0 ? fallback : 0;
}
