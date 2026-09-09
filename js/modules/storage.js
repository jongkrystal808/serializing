let storageErrorHandler = null;
const pendingStorageErrors = [];

// 【用途】註冊 localStorage 失敗時的使用者可見通知處理器。
export function setStorageErrorHandler(handler) {
  storageErrorHandler = typeof handler === "function" ? handler : null;
  if (storageErrorHandler) {
    pendingStorageErrors.splice(0).forEach((detail) => storageErrorHandler(detail));
  }
}

// 【用途】統一回報本機儲存錯誤，避免容量或權限錯誤被靜默吞掉。
function reportStorageError(operation, key, error) {
  const detail = {
    operation,
    key: String(key ?? ""),
    error,
    message: operation === "write"
      ? "本機儲存空間不足或無法寫入，這次設定可能不會保留。"
      : "無法讀取本機設定，已改用預設值。"
  };
  console.error(`[localStorage:${operation}] ${detail.key}`, error);
  if (storageErrorHandler) {
    storageErrorHandler(detail);
  } else {
    pendingStorageErrors.push(detail);
  }
}

// 【用途】安全讀取 localStorage；失敗時回傳 fallback 並通知使用者。
export function readStorageItem(key, fallback = null) {
  try {
    if (!globalThis.localStorage) {
      throw new Error("localStorage unavailable");
    }
    const value = globalThis.localStorage.getItem(key);
    return value === null || value === undefined ? fallback : value;
  } catch (error) {
    reportStorageError("read", key, error);
    return fallback;
  }
}

// 【用途】安全寫入 localStorage；回傳是否成功並在失敗時通知使用者。
export function writeStorageItem(key, value) {
  try {
    if (!globalThis.localStorage) {
      throw new Error("localStorage unavailable");
    }
    globalThis.localStorage.setItem(key, value);
    return true;
  } catch (error) {
    reportStorageError("write", key, error);
    return false;
  }
}

// 【用途】讀取 JSON 型本機設定，格式損壞時回報並回傳 fallback。
export function readJsonStorage(key, fallback = {}) {
  const rawValue = readStorageItem(key, "");
  if (!rawValue) {
    return fallback;
  }
  try {
    return JSON.parse(rawValue);
  } catch (error) {
    reportStorageError("parse", key, error);
    return fallback;
  }
}

// 【用途】序列化並寫入 JSON 型本機設定，任何失敗皆回報給使用者。
export function writeJsonStorage(key, value) {
  try {
    return writeStorageItem(key, JSON.stringify(value));
  } catch (error) {
    reportStorageError("write", key, error);
    return false;
  }
}
