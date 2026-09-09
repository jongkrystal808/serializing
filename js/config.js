import { CUSTOMER_KEYS, getCustomerRegistry } from "./modules/customers.js";
import { readStorageItem, writeStorageItem } from "./modules/storage.js";

const DEFAULT_CUSTOMER_KEY = CUSTOMER_KEYS.YINGBANG;
const ACTIVE_CUSTOMER_STORAGE_KEY = "sn_active_customer";

const CUSTOMERS = getCustomerRegistry();

let activeCustomerKey = readInitialCustomerKey();

function readInitialCustomerKey() {
  const fallback = CUSTOMERS[DEFAULT_CUSTOMER_KEY] ? DEFAULT_CUSTOMER_KEY : Object.keys(CUSTOMERS)[0];
  if (!fallback) {
    return DEFAULT_CUSTOMER_KEY;
  }
  const saved = String(readStorageItem(ACTIVE_CUSTOMER_STORAGE_KEY, "") ?? "").trim();
  if (saved && CUSTOMERS[saved]) {
    return saved;
  }
  return fallback;
}

export function getActiveCustomerKey() {
  return activeCustomerKey;
}

export function getActiveCustomerProfile() {
  return CUSTOMERS[activeCustomerKey] || CUSTOMERS[DEFAULT_CUSTOMER_KEY] || null;
}

export function setActiveCustomerKey(nextKey) {
  const key = String(nextKey ?? "").trim();
  if (!CUSTOMERS[key]) {
    return false;
  }
  activeCustomerKey = key;
  writeStorageItem(ACTIVE_CUSTOMER_STORAGE_KEY, key);
  return true;
}

export function listCustomerProfiles() {
  return Object.values(CUSTOMERS);
}

export function getStoragePrefix(customerKey = activeCustomerKey) {
  const key = String(customerKey ?? "").trim();
  return key ? `${key}_` : "";
}

export const CONFIG = {
  ACTIVE_CUSTOMER_STORAGE_KEY,
  DEFAULT_CUSTOMER_KEY,
  get SHEET_NAME() {
    const profile = getActiveCustomerProfile();
    return profile?.sheetName || "";
  },
  get STORAGE_KEY() {
    return `${getStoragePrefix()}sn_history`;
  },
  get GENERATION_HISTORY_KEY() {
    const profile = getActiveCustomerProfile();
    const suffix = profile?.generationHistoryKey || "sn_generation_history_by_work_order";
    return `${getStoragePrefix()}${suffix}`;
  },
  get COLUMNS() {
    const profile = getActiveCustomerProfile();
    return profile?.columns || {};
  },
  get COLUMN_ALIASES() {
    const profile = getActiveCustomerProfile();
    return profile?.columnAliases || {};
  }
};
