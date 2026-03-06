import { getActiveCustomerKey } from "../config.js";

const DB_NAME = "sn_generator_db";
const STORE_NAME = "settings";
const HANDLE_KEY_PREFIX = "source_file_handle";

function getHandleKey() {
  return `${HANDLE_KEY_PREFIX}_${getActiveCustomerKey()}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, 1);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error || new Error("IndexedDB 開啟失敗"));
  });
}

function runStoreAction(mode, action) {
  return openDb().then((db) =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, mode);
      const store = tx.objectStore(STORE_NAME);
      action(store, resolve, reject);
      tx.oncomplete = () => db.close();
      tx.onerror = () => reject(tx.error || new Error("IndexedDB 操作失敗"));
    })
  );
}

function getFilePickerOptions() {
  return {
    multiple: false,
    types: [{
      description: "Excel Files",
      accept: {
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet": [".xlsx"],
        "application/vnd.ms-excel": [".xls"]
      }
    }]
  };
}

async function ensureReadPermission(handle) {
  if (typeof handle.queryPermission !== "function") {
    return true;
  }
  const status = await handle.queryPermission({ mode: "read" });
  if (status === "granted") {
    return true;
  }
  if (typeof handle.requestPermission !== "function") {
    return false;
  }
  const next = await handle.requestPermission({ mode: "read" });
  return next === "granted";
}

export function supportsSourceBinding() {
  return (
    typeof window !== "undefined" &&
    typeof window.showOpenFilePicker === "function" &&
    typeof window.indexedDB !== "undefined" &&
    window.isSecureContext
  );
}

export function getBoundHandle() {
  const key = getHandleKey();
  return runStoreAction("readonly", (store, resolve, reject) => {
    const request = store.get(key);
    request.onsuccess = () => resolve(request.result || null);
    request.onerror = () => reject(request.error || new Error("讀取綁定檔失敗"));
  });
}

export function saveBoundHandle(handle) {
  const key = getHandleKey();
  return runStoreAction("readwrite", (store, resolve, reject) => {
    const request = store.put(handle, key);
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error || new Error("儲存綁定檔失敗"));
  });
}

export async function getBoundFile() {
  const handle = await getBoundHandle();
  if (!handle) {
    return null;
  }
  const granted = await ensureReadPermission(handle);
  if (!granted) {
    return null;
  }
  return handle.getFile();
}

export async function pickAndBindFile() {
  const [handle] = await window.showOpenFilePicker(getFilePickerOptions());
  if (!handle) {
    return null;
  }
  await saveBoundHandle(handle);
  return handle.getFile();
}
