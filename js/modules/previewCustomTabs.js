import { readJsonStorage, writeJsonStorage } from "./storage.js";

// 【用途】建立自訂預覽頁籤控制器，集中處理純文字持久化、遷移與 CRUD。
export function createPreviewCustomTabsController({
  storageKey,
  getCustomers,
  rerenderCustomerPreview,
  activatePreviewPane
}) {
  // 【用途】取得目前客戶設定集合。
  function getCustomerMap() {
    const customers = typeof getCustomers === "function" ? getCustomers() : {};
    return customers && typeof customers === "object" ? customers : {};
  }

  // 【用途】讀取本機儲存的自訂頁籤設定（依客戶分組）。
  function readStoredTabs() {
    const parsed = readJsonStorage(storageKey, {});
    return parsed && typeof parsed === "object" ? parsed : {};
  }

  // 【用途】保存本機自訂頁籤設定。
  function writeStoredTabs(data) {
    writeJsonStorage(storageKey, data || {});
  }

  // 【用途】把舊版自訂頁籤 HTML 安全轉為純文字，遷移時不插入頁面。
  function convertHtmlToText(html) {
    const documentValue = new DOMParser().parseFromString(String(html ?? ""), "text/html");
    documentValue.body.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
    return String(documentValue.body.textContent ?? "").trim();
  }

  // 【用途】將 localStorage 頁籤限制為結構化純文字欄位。
  function normalizeStoredTab(item) {
    if (!item || typeof item !== "object") {
      return null;
    }
    const id = String(item.id || item.key || item.tabId || "").trim();
    const label = String(item.label || item.name || item.tabName || "").trim();
    if (!id || !label) {
      return null;
    }
    const explicitText = String(item.text || item.contentText || "").trim();
    const legacyHtml = String(item.html || item.contentHtml || "");
    return {
      id,
      label,
      text: explicitText || convertHtmlToText(legacyHtml)
    };
  }

  // 【用途】取得指定客戶設定，若不存在則回傳 null。
  function getCustomerProfile(customerKey) {
    const key = String(customerKey ?? "").trim();
    return key ? getCustomerMap()[key] || null : null;
  }

  // 【用途】取得客戶可編輯的自訂頁籤陣列。
  function getEditableTabs(customerKey) {
    const profile = getCustomerProfile(customerKey);
    if (!profile) {
      return [];
    }
    if (!Array.isArray(profile.extraPreviewTabs)) {
      profile.extraPreviewTabs = [];
    }
    return profile.extraPreviewTabs;
  }

  // 【用途】將 raw id 轉成預覽 pane 使用的標準 id。
  function normalizePaneId(rawId, index = 0) {
    const base = String(rawId ?? "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, "-")
      .replace(/^-+|-+$/g, "");
    return `custom-${base || `tab-${index + 1}`}`;
  }

  // 【用途】取得客戶固定自訂頁籤數量。
  function getFixedTabCount(customerKey) {
    const profile = getCustomerProfile(customerKey);
    return profile && Array.isArray(profile.previewCustomTabs)
      ? profile.previewCustomTabs.length
      : 0;
  }

  // 【用途】依 pane id 反查可編輯頁籤索引。
  function findEditableTabIndex(customerKey, paneId) {
    const targetPaneId = String(paneId ?? "").trim();
    const tabs = getEditableTabs(customerKey);
    if (!targetPaneId || tabs.length === 0) {
      return -1;
    }
    const fixedCount = getFixedTabCount(customerKey);
    return tabs.findIndex((item, index) => {
      const rawId = item?.id || item?.key || item?.tabId;
      return normalizePaneId(rawId, fixedCount + index) === targetPaneId;
    });
  }

  // 【用途】將指定客戶目前的自訂頁籤寫回 localStorage。
  function persist(customerKey) {
    const key = String(customerKey ?? "").trim();
    if (!key) {
      return;
    }
    const store = readStoredTabs();
    store[key] = getEditableTabs(key);
    writeStoredTabs(store);
  }

  // 【用途】啟動時載入並清除舊版可執行 HTML 資料。
  function hydrate() {
    const store = readStoredTabs();
    const customerMap = getCustomerMap();
    Object.keys(customerMap).forEach((key) => {
      const profile = getCustomerProfile(key);
      if (!profile) {
        return;
      }
      profile.extraPreviewTabs = Array.isArray(store[key])
        ? store[key].map(normalizeStoredTab).filter(Boolean)
        : [];
      persist(key);
    });
  }

  // 【用途】新增客戶自訂頁籤並重新顯示新頁籤。
  async function onAdd(customerKey) {
    const key = String(customerKey ?? "").trim();
    if (!getCustomerProfile(key)) {
      return;
    }
    const labelInput = window.prompt("請輸入頁籤名稱（例如：備註）", "備註");
    if (labelInput === null) {
      return;
    }
    const label = String(labelInput).trim();
    if (!label) {
      window.alert("頁籤名稱不可為空。");
      return;
    }
    const tabs = getEditableTabs(key);
    const newId = `user-${Date.now()}`;
    tabs.push({ id: newId, label, text: "" });
    const newPaneId = normalizePaneId(newId, getFixedTabCount(key) + tabs.length - 1);
    persist(key);
    await rerenderCustomerPreview(key);
    activatePreviewPane(key, newPaneId);
  }

  // 【用途】移除指定的客戶自訂頁籤。
  async function onRemove(customerKey, tabId, tabItemId) {
    const key = String(customerKey ?? "").trim();
    const targetTabId = String(tabId ?? "").trim();
    const targetItemId = String(tabItemId ?? "").trim();
    const tabs = getEditableTabs(key);
    if (!key || !targetTabId || tabs.length === 0) {
      return;
    }
    const targetIndex = targetItemId
      ? tabs.findIndex((item) => String(item?.id || item?.key || item?.tabId || "").trim() === targetItemId)
      : findEditableTabIndex(key, targetTabId);
    if (targetIndex < 0 || !window.confirm("確定移除此自訂頁籤？")) {
      return;
    }
    const profile = getCustomerProfile(key);
    if (!profile) {
      return;
    }
    profile.extraPreviewTabs = tabs.filter((_, index) => index !== targetIndex);
    persist(key);
    await rerenderCustomerPreview(key);
  }

  // 【用途】以純文字格式儲存指定自訂頁籤內容。
  function onEdit(customerKey, tabId, tabItemId, textContent) {
    const key = String(customerKey ?? "").trim();
    const targetTabId = String(tabId ?? "").trim();
    const targetItemId = String(tabItemId ?? "").trim();
    const tabs = getEditableTabs(key);
    if (!key || !targetTabId || tabs.length === 0) {
      return;
    }
    const targetIndex = targetItemId
      ? tabs.findIndex((item) => String(item?.id || item?.key || item?.tabId || "").trim() === targetItemId)
      : findEditableTabIndex(key, targetTabId);
    if (targetIndex < 0) {
      return;
    }
    tabs[targetIndex] = {
      id: String(tabs[targetIndex].id || tabs[targetIndex].key || tabs[targetIndex].tabId || "").trim(),
      label: String(tabs[targetIndex].label || tabs[targetIndex].name || tabs[targetIndex].tabName || "").trim(),
      text: String(textContent ?? "")
    };
    persist(key);
  }

  return { hydrate, onAdd, onRemove, onEdit };
}
