export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

export function parseArrow(cellValue) {
  const text = String(cellValue ?? "").trim();
  const arrowPattern = /(?:->|→|>)/;
  if (!arrowPattern.test(text)) {
    return text;
  }

  const parts = text
    .split(arrowPattern)
    .map((part) => part.trim())
    .filter((part) => part.length > 0);

  return parts.length > 0 ? parts[parts.length - 1] : "";
}
