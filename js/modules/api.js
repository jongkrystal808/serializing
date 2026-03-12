const API_PREFIX = "/api";

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
  return "download.xls";
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
