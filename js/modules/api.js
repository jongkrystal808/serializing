const API_PREFIX = "/api";

export function loadSourceExcelByApi(sourceKey) {
  return requestJson(`/excel/load-source?source_key=${encodeURIComponent(sourceKey)}`);
}

// 【用途】讀取超恩 BIOS/FW 一覽表連結。
export function getVecowLinkByApi() {
  return requestJson("/vecow-link");
}

// 【用途】儲存或移除共用的一覽表連結。
export function saveVecowLinkByApi(url) {
  return requestJson("/vecow-link", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ url })
  });
}

function buildApiError(message, details = null) {
  const error = new Error(String(message || "API 請求失敗"));
  if (details) {
    error.details = details;
  }
  return error;
}

async function parseJsonIfAny(response) {
  const contentType = String(response.headers.get("Content-Type") || "").toLowerCase();
  if (!contentType.includes("application/json")) {
    return null;
  }
  try {
    return await response.json();
  } catch (error) {
    return null;
  }
}

async function requestJson(path, options = {}) {
  const response = await fetch(`${API_PREFIX}${path}`, options);
  const payload = await parseJsonIfAny(response);
  if (!response.ok) {
    if (payload?.error?.message) {
      throw buildApiError(payload.error.message, payload.error.details || null);
    }
    throw buildApiError(`API 請求失敗（HTTP ${response.status}）`);
  }
  if (payload && payload.success === false) {
    throw buildApiError(payload.error?.message || payload.message || "API 回傳失敗", payload.error?.details || null);
  }
  if (!payload || typeof payload !== "object") {
    throw buildApiError("API 回應格式錯誤");
  }
  return payload.data || {};
}

function parseFilenameFromContentDisposition(headerValue) {
  const header = String(headerValue || "");
  const encodedMatch = header.match(/filename\*=UTF-8''([^;]+)/i);
  if (encodedMatch && encodedMatch[1]) {
    try {
      return decodeURIComponent(encodedMatch[1]);
    } catch (error) {
      // ignore decode failures and fallback
    }
  }
  const plainMatch = header.match(/filename="([^"]+)"/i);
  if (plainMatch && plainMatch[1]) {
    return plainMatch[1];
  }
  return "download.xlsx";
}

export async function parseExcelByApi({ customer, sheetName, parseRules, file }) {
  const formData = new FormData();
  formData.append("customer", String(customer ?? "").trim());
  formData.append("sheet_name", String(sheetName ?? "").trim());
  formData.append("parse_rules", Array.isArray(parseRules) ? parseRules.join(",") : "arrow");
  formData.append("file", file);
  return requestJson("/excel/parse", {
    method: "POST",
    body: formData
  });
}

export async function generateSnByApi(payload) {
  return requestJson("/sn/generate", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export function getFzgStatusByApi() {
  return requestJson("/sn/fzg/status");
}

export function resetFzgByApi(payload) {
  return requestJson("/sn/fzg/reset", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function getHistoryByApi(customer) {
  const key = encodeURIComponent(String(customer ?? "").trim());
  return requestJson(`/history/${key}`, {
    method: "GET"
  });
}

export async function upsertHistoryByApi(payload) {
  return requestJson("/history/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function resetHistoryByApi(payload) {
  return requestJson("/history/reset", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function getPrintNoticesByApi() {
  return requestJson("/print-notice", {
    method: "GET"
  });
}

export async function upsertPrintNoticeByApi(payload) {
  return requestJson("/print-notice/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

export async function deletePrintNoticeByApi(payload) {
  return requestJson("/print-notice", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

// 【用途】讀取系統內維護的 KOYA 型號主檔。
export async function getKoyaModelsByApi() {
  return requestJson("/koya-model", {
    method: "GET"
  });
}

// 【用途】新增或修改一筆 KOYA 型號主檔。
export async function upsertKoyaModelByApi(payload) {
  return requestJson("/koya-model/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

// 【用途】刪除一筆 KOYA 型號主檔。
export async function deleteKoyaModelByApi(payload) {
  return requestJson("/koya-model", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

// 【用途】讀取系統內維護的 NYX 型號主檔。
export async function getNyxModelsByApi() {
  return requestJson("/nyx-model", {
    method: "GET"
  });
}

// 【用途】新增或修改一筆 NYX 型號主檔。
export async function upsertNyxModelByApi(payload) {
  return requestJson("/nyx-model/upsert", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

// 【用途】刪除一筆 NYX 型號主檔。
export async function deleteNyxModelByApi(payload) {
  return requestJson("/nyx-model", {
    method: "DELETE",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });
}

// 【用途】讀取指定客戶的月份對照主檔。
export async function getMonthlyReferencesByApi(customer) {
  const key = encodeURIComponent(String(customer ?? "").trim());
  return requestJson(`/monthly-reference/${key}`, { method: "GET" });
}

// 【用途】新增或修改指定客戶的月份對照。
export async function upsertMonthlyReferenceByApi(customer, payload) {
  const key = encodeURIComponent(String(customer ?? "").trim());
  return requestJson(`/monthly-reference/${key}/upsert`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

// 【用途】刪除指定客戶的月份對照。
export async function deleteMonthlyReferenceByApi(customer, payload) {
  const key = encodeURIComponent(String(customer ?? "").trim());
  return requestJson(`/monthly-reference/${key}`, {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function loadDefaultExcelByApi(customer) {
  const key = encodeURIComponent(String(customer ?? "").trim());
  return requestJson(`/excel/load-default?customer=${key}`, {
    method: "GET"
  });
}

export async function getShipmentRefreshStatusByApi() {
  return requestJson("/shipment-refresh", { method: "GET" });
}

export async function startShipmentRefreshByApi() {
  return requestJson("/shipment-refresh/run", { method: "POST" });
}

export async function getShipmentSourcesByApi() {
  return requestJson("/shipment-sources", { method: "GET" });
}

export async function previewShipmentSourceByApi(payload) {
  return requestJson("/shipment-sources/preview", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function createShipmentSourceByApi(payload) {
  return requestJson("/shipment-sources", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function updateShipmentSourceByApi(sourceKey, payload) {
  const key = encodeURIComponent(String(sourceKey ?? "").trim());
  return requestJson(`/shipment-sources/${key}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
}

export async function resetShipmentSourceByApi(sourceKey) {
  const key = encodeURIComponent(String(sourceKey ?? "").trim());
  return requestJson(`/shipment-sources/${key}/reset`, { method: "POST" });
}

export async function exportWorkbookByApi(payload) {
  const response = await fetch(`${API_PREFIX}/export`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const errorPayload = await parseJsonIfAny(response);
    if (errorPayload?.error?.message) {
      throw buildApiError(errorPayload.error.message, errorPayload.error.details || null);
    }
    throw buildApiError(`匯出失敗（HTTP ${response.status}）`);
  }

  const blob = await response.blob();
  const filename = parseFilenameFromContentDisposition(response.headers.get("Content-Disposition"));
  return { blob, filename };
}
