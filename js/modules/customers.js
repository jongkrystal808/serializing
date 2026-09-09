export const CUSTOMER_KEYS = Object.freeze({
  YINGBANG: "yingbang",
  LUNFEI: "lunfei",
  BNG: "bng",
  CHG: "chg",
  HMG: "hmg",
  CLG: "clg"
});

export const WORK_ORDER_CUSTOMER_KEYS = Object.freeze([
  CUSTOMER_KEYS.YINGBANG,
  CUSTOMER_KEYS.LUNFEI,
  CUSTOMER_KEYS.BNG,
  CUSTOMER_KEYS.CHG
]);

export const MODEL_CUSTOMER_KEYS = Object.freeze([
  CUSTOMER_KEYS.HMG,
  CUSTOMER_KEYS.CLG
]);

// 【用途】驗證並取得由 index.html 初始化的客戶設定集合。
export function getCustomerRegistry() {
  const registry = globalThis.window?.CUSTOMERS;
  if (!registry || typeof registry !== "object" || Array.isArray(registry)) {
    throw new Error("CUSTOMERS 尚未初始化，請確認客戶設定在 app.js 載入前完成。");
  }
  const missingKeys = Object.values(CUSTOMER_KEYS).filter((key) => {
    const profile = registry[key];
    return !profile || typeof profile !== "object";
  });
  if (missingKeys.length > 0) {
    throw new Error(`CUSTOMERS 缺少必要客戶設定：${missingKeys.join(", ")}`);
  }
  return registry;
}

// 【用途】以集中驗證過的 registry 取得單一客戶設定。
export function getCustomerProfileByKey(customerKey) {
  const key = String(customerKey ?? "").trim();
  return key ? getCustomerRegistry()[key] || null : null;
}
