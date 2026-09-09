export function normalizeText(value) {
  return String(value ?? "")
    .trim()
    .replace(/\s+/g, "")
    .toLowerCase();
}

// 【用途】編碼 HTML 文字節點；不得用於 script/style/URL 等其他語境。
export function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

// 【用途】嚴格編碼 HTML 屬性值，並要求呼叫端仍以引號包住屬性。
export function escapeHtmlAttribute(value) {
  return String(value ?? "").replace(/[&<>"'`=\u0000-\u001f\u007f]/g, (character) => {
    const codePoint = character.codePointAt(0).toString(16).toUpperCase();
    return `&#x${codePoint};`;
  });
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

export function normalizeRangeText(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  const cleaned = text.replace(/\s*~\s*/g, "~").replace(/\s+/g, " ").trim();
  if (cleaned.includes("~")) {
    return cleaned.split("~").map((part) => part.trim()).filter(Boolean).join(" ~ ");
  }
  const parts = cleaned.split(" ").filter(Boolean);
  if (parts.length === 2) {
    return `${parts[0]} ~ ${parts[1]}`;
  }
  return cleaned;
}
