import { normalizeText } from "./utils.js";

export function findSourceRows(source, query, exactOnly = false) {
  const target = normalizeText(query);
  if (!target) return [];
  const values = (row) => source.column
    ? Object.entries(row).filter(([key]) => normalizeText(key) === normalizeText(source.column)).map(([, value]) => value)
    : Object.values(row);
  const exact = (source.rows || []).filter((row) => values(row).some((value) => {
    const text = String(value ?? "");
    return normalizeText(text) === target || text.split(/[\s,，;；/]+/).some((token) => normalizeText(token.split("*")[0]) === target);
  }));
  return exactOnly || exact.length ? exact : (source.rows || []).filter((row) => values(row).some((value) => normalizeText(value).includes(target)));
}

export function findCustomerSources(entries, query) {
  const target = normalizeText(query);
  if (!target) return [];
  const tagged = (entries || []).map((entry) => ({
    entry,
    keywords: String(entry.customer_keywords || "").split(/[\n,，;；]+/).map(normalizeText).filter(Boolean)
  })).filter(({ keywords }) => keywords.length);
  const exact = tagged.filter(({ keywords }) => keywords.includes(target));
  return (exact.length ? exact : tagged.filter(({ keywords }) => keywords.some((keyword) => keyword.includes(target))))
    .map(({ entry }) => entry);
}
