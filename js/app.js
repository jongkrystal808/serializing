import {
  CONFIG,
  getActiveCustomerKey,
  getActiveCustomerProfile,
  setActiveCustomerKey
} from "./config.js";
import { state, createUiRefs } from "./state.js";
import {
  getDatecode,
  getCurrentWeekNumber2Digits,
  getLunfeiWeekKey,
  buildLunfeiSN,
  getTodayDateText,
  generateBngSerialBundle,
  generateChgExportBundle
} from "./modules/excel.js";
import {
  parseExcelByApi,
  generateSnByApi,
  getHistoryByApi,
  upsertHistoryByApi,
  resetHistoryByApi,
  exportWorkbookByApi
} from "./modules/api.js";
import {
  findWorkOrderRows,
  findRowsByColumnCode,
  resolveColumnKey,
  resolveWorkOrderQty,
  resolveQtyByPairedSlash
} from "./modules/workOrder.js";
import { escapeHtml, normalizeRangeText } from "./modules/utils.js";
import {
  updateStatus,
  renderLoadResult,
  renderSearchNotFound,
  renderSearchSuccess,
  renderLunfeiSearchNotFound,
  renderLunfeiSearchSuccess,
  renderBngSearchNotFound,
  renderBngSearchSuccess,
  renderChgSearchNotFound,
  renderChgSearchSuccess,
  renderHmgSearchNotFound,
  renderHmgSearchSuccess,
  renderClgSearchNotFound,
  renderClgSearchSuccess,
  updateClgPlannedSerialPreviewIn,
  renderSerialHistoryTableIn,
  bindPreviewTabs,
  bindPreviewTabsIn,
  bindCustomTabActionsIn,
  bindSheetCopyCells,
  bindSheetCopyCellsIn,
  bindCopyButtons,
  bindCopyButtonsIn,
  bindClearHistoryButton,
  bindClearHistoryButtonIn,
  bindHistoryResetButtons,
  bindHistoryResetButtonsIn
} from "./modules/ui.js";

const ui = createUiRefs();
const SHARED_PARSE_FALLBACKS = {
  yingbang: { sheetName: "營邦出貨", parseRules: ["arrow"] },
  lunfei: { sheetName: "倫飛出貨", parseRules: ["arrow"] },
  bng: { sheetName: "超恩出貨", parseRules: ["trim"] },
  chg: { sheetName: "KOYA出貨", parseRules: ["trim"] },
  hmg: { sheetName: "Sheet1", parseRules: ["none"] },
  clg: { sheetName: "Sheet1", parseRules: ["trim"] }
};
const PREVIEW_CUSTOM_TABS_STORAGE_KEY = "sn_preview_custom_tabs";
const SHARED_CUSTOMER_KEYS = ["yingbang", "lunfei", "bng", "chg"];
const USAGE_HELP_MESSAGES = {
  "customer-tabs": [
    "客戶頁籤使用方式：",
    "1. 先點選上方客戶頁籤切換當前作業客戶。",
    "2. 切換後，下方資料來源與查詢規則會跟著該客戶改變。",
    "3. 營邦/倫飛/超恩/KOYA 共用上傳檔；赫星與 Cubepilot 為獨立上傳。"
  ].join("\n"),
  "source-config": [
    "資料來源設定使用方式：",
    "1. 點擊「上傳 ... Excel」選擇來源檔案。",
    "2. 上傳完成後，狀態列會顯示載入結果。",
    "3. 需要回看歷史時，點「查看歷史」。"
  ].join("\n"),
  "query-actions": [
    "查詢與操作使用方式：",
    "1. 先完成上傳，再輸入工單 / MO / Model。",
    "2. 點「解析工單」或「查詢機種」（也可按 Enter）。",
    "3. 查詢成功後可點「生成序號 & 匯出」或對應匯出按鈕。"
  ].join("\n"),
  "preview-panel": [
    "預覽窗格使用方式：",
    "1. 這裡會顯示查詢命中的資料與序號預覽。",
    "2. 可切換「預覽 / 表格內容 / 生成歷史」頁籤。",
    "3. 可使用「複製」按鈕或點表格儲存格快速複製內容。"
  ].join("\n")
};

function buildParseTarget(customerKey) {
  const fallback = SHARED_PARSE_FALLBACKS[customerKey] || {};
  const profile = window.CUSTOMERS?.[customerKey] || {};
  const parseRules = Array.isArray(profile.parseRules) && profile.parseRules.length > 0
    ? profile.parseRules
    : (fallback.parseRules || ["trim"]);
  return {
    customer: customerKey,
    sheetName: String(profile.sheetName ?? fallback.sheetName ?? "").trim(),
    parseRules
  };
}

function getSharedParseTargets() {
  return SHARED_CUSTOMER_KEYS.map((customerKey) => buildParseTarget(customerKey));
}

function getClgParseTarget() {
  return buildParseTarget("clg");
}

function getHmgParseTarget() {
  return buildParseTarget("hmg");
}

// 【用途】讀取本機儲存的自訂頁籤設定（依客戶分組）
function readStoredPreviewCustomTabs() {
  try {
    const raw = localStorage.getItem(PREVIEW_CUSTOM_TABS_STORAGE_KEY);
    if (!raw) {
      return {};
    }
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch (error) {
    return {};
  }
}

// 【用途】保存本機自訂頁籤設定
function writeStoredPreviewCustomTabs(data) {
  try {
    localStorage.setItem(PREVIEW_CUSTOM_TABS_STORAGE_KEY, JSON.stringify(data || {}));
  } catch (error) {
    // ignore localStorage errors
  }
}

// 【用途】取得客戶設定物件，若不存在則回傳 null
function getCustomerProfileByKey(customerKey) {
  const key = String(customerKey ?? "").trim();
  if (!key) {
    return null;
  }
  return window.CUSTOMERS?.[key] || null;
}

// 【用途】取得客戶的可編輯自訂頁籤陣列（存放在 extraPreviewTabs）
function getEditableCustomerCustomTabs(customerKey) {
  const profile = getCustomerProfileByKey(customerKey);
  if (!profile) {
    return [];
  }
  if (!Array.isArray(profile.extraPreviewTabs)) {
    profile.extraPreviewTabs = [];
  }
  return profile.extraPreviewTabs;
}

// 【用途】將 raw id 轉成與 ui.js 相同的自訂頁籤 data-tab 格式
function normalizeCustomTabPaneId(rawId, index = 0) {
  const base = String(rawId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = base || `tab-${index + 1}`;
  return `custom-${suffix}`;
}

// 【用途】取得客戶固定自訂頁籤（previewCustomTabs）數量
function getFixedPreviewCustomTabCount(customerKey) {
  const profile = getCustomerProfileByKey(customerKey);
  if (!profile) {
    return 0;
  }
  return Array.isArray(profile.previewCustomTabs) ? profile.previewCustomTabs.length : 0;
}

// 【用途】依頁籤 pane id 反查可編輯自訂頁籤索引
function findEditableCustomTabIndexByPaneId(customerKey, paneId) {
  const key = String(customerKey ?? "").trim();
  const targetPaneId = String(paneId ?? "").trim();
  if (!key || !targetPaneId) {
    return -1;
  }
  const tabs = getEditableCustomerCustomTabs(key);
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return -1;
  }
  const fixedCount = getFixedPreviewCustomTabCount(key);
  return tabs.findIndex((item, index) => {
    const rawId = item?.id || item?.key || item?.tabId;
    const normalizedPaneId = normalizeCustomTabPaneId(rawId, fixedCount + index);
    return normalizedPaneId === targetPaneId;
  });
}

// 【用途】把目前記憶體中的 extraPreviewTabs 寫回 localStorage
function persistEditableCustomerCustomTabs(customerKey) {
  const key = String(customerKey ?? "").trim();
  if (!key) {
    return;
  }
  const store = readStoredPreviewCustomTabs();
  const tabs = getEditableCustomerCustomTabs(key);
  store[key] = tabs;
  writeStoredPreviewCustomTabs(store);
}

// 【用途】啟動時把 localStorage 自訂頁籤回填到客戶設定
function hydrateEditableCustomerCustomTabs() {
  const store = readStoredPreviewCustomTabs();
  const keys = Object.keys(window.CUSTOMERS || {});
  keys.forEach((key) => {
    const profile = getCustomerProfileByKey(key);
    if (!profile) {
      return;
    }
    profile.extraPreviewTabs = Array.isArray(store[key]) ? store[key] : [];
  });
}

function getSafeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "發生未知錯誤";
}

function onUsageHelpClick(event) {
  const trigger = event.target?.closest?.(".help-inline-trigger[data-help-topic]");
  if (!trigger) {
    return;
  }
  event.preventDefault();
  event.stopPropagation();
  const topic = String(trigger.getAttribute("data-help-topic") ?? "").trim();
  const message = USAGE_HELP_MESSAGES[topic] || "目前沒有可用的使用說明。";
  window.alert(message);
}

function getHistoryEntries(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.entries)) {
    return [];
  }
  return snapshot.entries.map((item) => {
    const rawSerial = item?.lastSerial ?? item?.last_serial ?? 0;
    const normalizedSerial = Number(rawSerial);
    return {
      ...item,
      lastSerial: Number.isFinite(normalizedSerial) ? normalizedSerial : 0
    };
  });
}

function getHistoryRecords(snapshot) {
  if (!snapshot || !Array.isArray(snapshot.records)) {
    return [];
  }
  return snapshot.records;
}

function getLastSerialFromEntries(entries, key) {
  const targetKey = String(key ?? "").trim();
  if (!targetKey || !Array.isArray(entries)) {
    return 0;
  }
  const matched = entries.find((entry) => String(entry?.key ?? "").trim() === targetKey);
  const value = Number(matched?.lastSerial ?? matched?.last_serial ?? 0);
  return Number.isInteger(value) && value > 0 ? value : 0;
}

function filterGenerationRecords(records, key) {
  const historyKey = String(key ?? "").trim();
  if (!historyKey || !Array.isArray(records)) {
    return [];
  }
  const suffix = `-${historyKey}`;
  return records
    .filter((item) => String(item?.record ?? "").trim().endsWith(suffix))
    .map((item) => String(item?.record ?? "").trim())
    .filter(Boolean)
    .reverse();
}

async function loadHistorySnapshot(customer) {
  const customerKey = String(customer ?? "").trim();
  if (!customerKey) {
    return { entries: [], records: [] };
  }
  const payload = await getHistoryByApi(customerKey);
  return {
    entries: getHistoryEntries(payload),
    records: getHistoryRecords(payload)
  };
}

function triggerBlobDownload(blob, filename) {
  const fileName = String(filename ?? "").trim() || "download.xls";
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}

function buildYingbangPreviewSN(purchaseOrder, historyKey, entries) {
  const po = String(purchaseOrder ?? "").trim();
  if (!po) {
    return "";
  }
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return "";
  }
  const nextSerial = getLastSerialFromEntries(entries, key) + 1;
  return `${po}1${String(nextSerial).padStart(4, "0")}`;
}

function setSearchEnabled(enabled) {
  const shouldEnable = enabled && !state.isLoading;
  ui.searchInput.disabled = !shouldEnable;
  ui.queryBtn.disabled = !shouldEnable;
}

function setExportEnabled(enabled) {
  ui.exportBtn.disabled = !(enabled && !state.isLoading);
}

function setLoading(isLoading, message = "") {
  state.isLoading = isLoading;
  ui.loadingIndicator.classList.toggle("active", isLoading);
  ui.loadBtn.disabled = isLoading;
  ui.historyBtn.disabled = isLoading;
  setSearchEnabled(state.yingbangRowData.length > 0);
  setExportEnabled(Boolean(state.currentRow));
  if (message) {
    updateStatus(ui, message, false, isLoading);
  }
}

function updateLunfeiStatus(message, isError = false, isLoading = false) {
  ui.lunfeiStatus.textContent = message;
  if (isError) {
    ui.lunfeiStatus.className = "error";
    return;
  }
  if (isLoading) {
    ui.lunfeiStatus.className = "loading";
    return;
  }
  ui.lunfeiStatus.className = "";
}

function setLunfeiLoading(isLoading, message = "") {
  state.isLoading = isLoading;
  ui.lunfeiLoadingIndicator.classList.toggle("active", isLoading);
  ui.lunfeiLoadBtn.disabled = isLoading;
  ui.lunfeiSearchInput.disabled = isLoading || state.lunfeiRowData.length === 0;
  ui.lunfeiQueryBtn.disabled = isLoading || state.lunfeiRowData.length === 0;
  ui.lunfeiExportBtn.disabled = true;
  if (message) {
    updateLunfeiStatus(message, false, isLoading);
  }
}

function updateBngStatus(message, isError = false, isLoading = false) {
  ui.bngStatus.textContent = message;
  if (isError) {
    ui.bngStatus.className = "error";
    return;
  }
  if (isLoading) {
    ui.bngStatus.className = "loading";
    return;
  }
  ui.bngStatus.className = "";
}

function setBngLoading(isLoading, message = "") {
  state.isLoading = isLoading;
  ui.bngLoadingIndicator.classList.toggle("active", isLoading);
  ui.bngLoadBtn.disabled = isLoading;
  ui.bngSearchInput.disabled = isLoading || state.bngRowData.length === 0;
  ui.bngQueryBtn.disabled = isLoading || state.bngRowData.length === 0;
  ui.bngExportBtn.disabled = true;
  setBngPrintEnabled(false);
  if (message) {
    updateBngStatus(message, false, isLoading);
  }
}

// 【用途】統一控制超恩收據列印按鈕啟用狀態
function setBngPrintEnabled(enabled) {
  if (!ui.bngPrintBtn) {
    return;
  }
  ui.bngPrintBtn.disabled = !(enabled && !state.isLoading);
}

function updateChgStatus(message, isError = false, isLoading = false) {
  ui.chgStatus.textContent = message;
  if (isError) {
    ui.chgStatus.className = "error";
    return;
  }
  if (isLoading) {
    ui.chgStatus.className = "loading";
    return;
  }
  ui.chgStatus.className = "";
}

function setChgLoading(isLoading, message = "") {
  state.isLoading = isLoading;
  ui.chgLoadingIndicator.classList.toggle("active", isLoading);
  ui.chgLoadBtn.disabled = isLoading;
  ui.chgSearchInput.disabled = isLoading || state.chgRowData.length === 0;
  ui.chgQueryBtn.disabled = isLoading || state.chgRowData.length === 0;
  ui.chgExportBtn.disabled = true;
  if (message) {
    updateChgStatus(message, false, isLoading);
  }
}

function updateHmgStatus(message, isError = false, isLoading = false) {
  ui.hmgStatus.textContent = message;
  if (isError) {
    ui.hmgStatus.className = "error";
    return;
  }
  if (isLoading) {
    ui.hmgStatus.className = "loading";
    return;
  }
  ui.hmgStatus.className = "";
}

function setHmgLoading(isLoading, message = "") {
  state.isLoading = isLoading;
  ui.hmgLoadingIndicator.classList.toggle("active", isLoading);
  ui.hmgLoadBtn.disabled = isLoading;
  ui.hmgSearchInput.disabled = isLoading || state.hmgRowData.length === 0;
  ui.hmgQueryBtn.disabled = isLoading || state.hmgRowData.length === 0;
  ui.hmgExportBtn.disabled = isLoading || !state.currentRow;
  if (isLoading) {
    hideHmgSuggestPanel();
  }
  if (message) {
    updateHmgStatus(message, false, isLoading);
  }
}

function updateClgStatus(message, isError = false, isLoading = false) {
  ui.clgStatus.textContent = message;
  if (isError) {
    ui.clgStatus.className = "error";
    return;
  }
  if (isLoading) {
    ui.clgStatus.className = "loading";
    return;
  }
  ui.clgStatus.className = "";
}

function setClgLoading(isLoading, message = "") {
  state.isLoading = isLoading;
  ui.clgLoadingIndicator.classList.toggle("active", isLoading);
  ui.clgLoadBtn.disabled = isLoading;
  ui.clgSearchInput.disabled = isLoading || state.clgRowData.length === 0;
  ui.clgQueryBtn.disabled = isLoading || state.clgRowData.length === 0;
  if (isLoading) {
    ui.clgExportBtn.disabled = true;
  } else {
    updateClgExportEnabledBySettings();
  }
  if (isLoading) {
    hideClgSuggestPanel();
  }
  if (message) {
    updateClgStatus(message, false, isLoading);
  }
}

function setAllCustomerLoading(isLoading, message = "") {
  setLoading(isLoading, message);
  setLunfeiLoading(isLoading, message);
  setBngLoading(isLoading, message);
  setChgLoading(isLoading, message);
}

function applyCustomerProfileUi() {
  const profile = getActiveCustomerProfile();
  if (!profile) {
    return;
  }
  if (getActiveCustomerKey() === "yingbang") {
    if (ui.sourceHint) {
      ui.sourceHint.textContent = profile.sourceHint;
    }
    ui.searchInput.placeholder = profile.searchPlaceholder || "輸入工單號";
  }
}

function resetDataForCustomerSwitch() {
  state.currentRow = null;
  state.currentQuery = "";
  state.generatedSNList = [];
  ui.historyPanel.hidden = true;
  ui.lunfeiHistoryPanel.hidden = true;
  ui.bngHistoryPanel.hidden = true;
  ui.chgHistoryPanel.hidden = true;
  ui.hmgHistoryPanel.hidden = true;
  ui.clgHistoryPanel.hidden = true;
  ui.previewPanel.innerHTML = `
    <h2>預覽窗格</h2>
    <p>請先上傳共用 Excel，並輸入工單號後點擊「解析工單」。</p>
  `;
  setSearchEnabled(state.yingbangRowData.length > 0);
  setExportEnabled(false);
  ui.lunfeiSearchInput.disabled = state.lunfeiRowData.length === 0;
  ui.lunfeiQueryBtn.disabled = state.lunfeiRowData.length === 0;
  ui.lunfeiExportBtn.disabled = true;
  ui.bngSearchInput.disabled = state.bngRowData.length === 0;
  ui.bngQueryBtn.disabled = state.bngRowData.length === 0;
  ui.bngExportBtn.disabled = true;
  setBngPrintEnabled(false);
  ui.chgSearchInput.disabled = state.chgRowData.length === 0;
  ui.chgQueryBtn.disabled = state.chgRowData.length === 0;
  ui.chgExportBtn.disabled = true;
  ui.hmgSearchInput.disabled = state.hmgRowData.length === 0;
  ui.hmgQueryBtn.disabled = state.hmgRowData.length === 0;
  ui.hmgExportBtn.disabled = true;
  hideHmgSuggestPanel();
  ui.clgSearchInput.disabled = state.clgRowData.length === 0;
  ui.clgQueryBtn.disabled = state.clgRowData.length === 0;
  updateClgExportEnabledBySettings();
  hideClgSuggestPanel();
}

function updateTabUi() {
  const active = getActiveCustomerKey();
  ui.yingbangTab.classList.toggle("active", active === "yingbang");
  ui.lunfeiTab.classList.toggle("active", active === "lunfei");
  ui.bngTab.classList.toggle("active", active === "bng");
  ui.chgTab.classList.toggle("active", active === "chg");
  ui.hmgTab.classList.toggle("active", active === "hmg");
  ui.clgTab.classList.toggle("active", active === "clg");
  ui.yingbangWorkspace.hidden = active !== "yingbang";
  ui.lunfeiWorkspace.hidden = active !== "lunfei";
  ui.bngWorkspace.hidden = active !== "bng";
  ui.chgWorkspace.hidden = active !== "chg";
  ui.hmgWorkspace.hidden = active !== "hmg";
  ui.clgWorkspace.hidden = active !== "clg";
}

function switchCustomerTab(key) {
  if (getActiveCustomerKey() === key) {
    updateTabUi();
    return;
  }
  if (!setActiveCustomerKey(key)) {
    updateStatus(ui, "客戶切換失敗：設定不存在。", true);
    return;
  }
  updateTabUi();
  applyCustomerProfileUi();
  resetDataForCustomerSwitch();
  if (key === "yingbang") {
    updateStatus(ui, `已切換客戶：${getActiveCustomerProfile().label}`);
    return;
  }
  if (key === "lunfei") {
    updateLunfeiStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
    return;
  }
  if (key === "bng") {
    updateBngStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
    return;
  }
  if (key === "chg") {
    updateChgStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
    return;
  }
  if (key === "hmg") {
    updateHmgStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
    return;
  }
  updateClgStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
}

function getCurrentRowValue(columnCode) {
  if (!state.currentRow) {
    return "";
  }
  const key = resolveColumnKey(state.currentRow, columnCode) || CONFIG.COLUMNS[columnCode];
  return String(state.currentRow[key] ?? "").trim();
}

function getRowValueByHeaderCandidates(row, headers) {
  if (!row || !Array.isArray(headers)) {
    return "";
  }
  const rowKeys = Object.keys(row);
  for (const header of headers) {
    const foundKey = rowKeys.find((key) => String(key).trim().toLowerCase() === String(header).trim().toLowerCase());
    if (foundKey) {
      return String(row[foundKey] ?? "").trim();
    }
  }
  return "";
}

// 【用途】依欄位代碼取得超恩列印用欄位值（支援 alias 對應）
function getBngColumnValue(row, columnCode) {
  if (!row) {
    return "";
  }
  const key = resolveColumnKey(row, columnCode) || CONFIG.COLUMNS[columnCode];
  return String(row[key] ?? "").trim();
}

// 【用途】將超恩機種名稱拆成 Model 與 Remark（Remark 含 " 1." 起始字串）
function splitBngModelAndRemark(modelValue) {
  const text = String(modelValue ?? "").trim();
  const marker = " 1.";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return {
      model: text,
      remark: ""
    };
  }
  return {
    model: text.slice(0, markerIndex).trim(),
    remark: text.slice(markerIndex).trim()
  };
}

// 【用途】組裝超恩收據明細列印資料（對應套印欄位）
function buildBngReceiptPrintPayload(row) {
  const mo = getBngColumnValue(row, "MO");
  const workOrder = getBngColumnValue(row, "WORK_ORDER");
  const modelRaw = getBngColumnValue(row, "MODEL");
  const parsedModel = splitBngModelAndRemark(modelRaw);
  const ddcModel = getRowValueByHeaderCandidates(row, ["DDC Model", "Model", "MODEL"]) || parsedModel.model || modelRaw;
  const partNo = getBngColumnValue(row, "PART_NO");
  const qty = getBngColumnValue(row, "QTY");
  const macQty = getBngColumnValue(row, "MAC_QTY");
  const macRange = normalizeRangeText(getBngColumnValue(row, "MAC_RANGE"));

  return {
    mo,
    ddcModel,
    workOrder,
    model: parsedModel.model,
    macQty,
    partNo,
    macRange,
    qty,
    remark: parsedModel.remark
  };
}

// 【用途】渲染超恩收據明細列印版型（對照客戶套印欄位）
function renderBngReceiptPrintHtml(payload) {
  return `
    <section class="bng-receipt-print-sheet">
      <table class="bng-receipt-print-table">
        <colgroup>
          <col class="bng-receipt-col-1">
          <col class="bng-receipt-col-2">
          <col class="bng-receipt-col-3">
          <col class="bng-receipt-col-4">
          <col class="bng-receipt-col-5">
          <col class="bng-receipt-col-6">
        </colgroup>
        <tbody>
          <tr>
            <th class="bng-receipt-label">MO</th>
            <td class="bng-receipt-value">${escapeHtml(payload.mo)}</td>
            <th class="bng-receipt-label">DDC Model</th>
            <td class="bng-receipt-value">${escapeHtml(payload.ddcModel)}</td>
            <th class="bng-receipt-label">Work Order Number</th>
            <td class="bng-receipt-value">${escapeHtml(payload.workOrder)}</td>
          </tr>
          <tr>
            <th class="bng-receipt-label">Model</th>
            <td class="bng-receipt-value" colspan="2">${escapeHtml(payload.model)}</td>
            <th class="bng-receipt-label">Number of MACs</th>
            <td class="bng-receipt-value">${escapeHtml(payload.macQty)}</td>
            <td class="bng-receipt-unit">PCS</td>
          </tr>
          <tr>
            <th class="bng-receipt-label">Part Number</th>
            <td class="bng-receipt-value" colspan="2">${escapeHtml(payload.partNo)}</td>
            <th class="bng-receipt-label">MAC range</th>
            <td class="bng-receipt-value" colspan="2">${escapeHtml(payload.macRange)}</td>
          </tr>
          <tr>
            <th class="bng-receipt-label">Quantity</th>
            <td class="bng-receipt-value">${escapeHtml(payload.qty)}</td>
            <td class="bng-receipt-unit">pcs</td>
            <th class="bng-receipt-label">Remark</th>
            <td colspan="2" class="bng-receipt-remark">${escapeHtml(payload.remark)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}

// 【用途】掛載超恩收據列印節點並切換成列印模式
function mountBngReceiptPrintView(payload) {
  if (!ui.bngReceiptPrintRoot) {
    throw new Error("找不到超恩收據列印區塊。");
  }
  ui.bngReceiptPrintRoot.innerHTML = renderBngReceiptPrintHtml(payload);
  ui.bngReceiptPrintRoot.hidden = false;
  ui.bngReceiptPrintRoot.setAttribute("aria-hidden", "false");
  document.body.classList.add("printing-bng-receipt");
}

// 【用途】清理超恩收據列印節點，避免影響一般畫面
function cleanupBngReceiptPrintView() {
  document.body.classList.remove("printing-bng-receipt");
  if (!ui.bngReceiptPrintRoot) {
    return;
  }
  ui.bngReceiptPrintRoot.hidden = true;
  ui.bngReceiptPrintRoot.setAttribute("aria-hidden", "true");
  ui.bngReceiptPrintRoot.innerHTML = "";
}

function onCopyError() {
  if (getActiveCustomerKey() === "lunfei") {
    updateLunfeiStatus("複製失敗：瀏覽器不允許剪貼簿存取。", true);
    return;
  }
  if (getActiveCustomerKey() === "bng") {
    updateBngStatus("複製失敗：瀏覽器不允許剪貼簿存取。", true);
    return;
  }
  if (getActiveCustomerKey() === "chg") {
    updateChgStatus("複製失敗：瀏覽器不允許剪貼簿存取。", true);
    return;
  }
  if (getActiveCustomerKey() === "hmg") {
    updateHmgStatus("複製失敗：瀏覽器不允許剪貼簿存取。", true);
    return;
  }
  if (getActiveCustomerKey() === "clg") {
    updateClgStatus("複製失敗：瀏覽器不允許剪貼簿存取。", true);
    return;
  }
  updateStatus(ui, "複製失敗：瀏覽器不允許剪貼簿存取。", true);
}

function getCurrentWorkOrder() {
  return getCurrentRowValue("WORK_ORDER");
}

function getResolvedQty(row, query) {
  const rawQty = row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY];
  return resolveWorkOrderQty(row, query, rawQty);
}

function normalizeClgBase(rawBase) {
  const value = String(rawBase ?? "10").trim();
  if (value === "16") {
    return "16";
  }
  if (value === "cycle_0_6") {
    return "cycle_0_6";
  }
  if (value === "cycle_1_6") {
    return "cycle_1_6";
  }
  return "10";
}

function getClgInputValues() {
  return {
    prefix: String(ui.clgPrefixInput?.value ?? "").trim(),
    startSerial: String(ui.clgStartInput?.value ?? "").trim(),
    countText: String(ui.clgCountInput?.value ?? "").trim(),
    suffix: String(ui.clgSuffixInput?.value ?? "").trim(),
    base: normalizeClgBase(ui.clgBaseSelect?.value)
  };
}

function toBigIntByBase(text, base) {
  const value = String(text ?? "").trim().toUpperCase();
  if (!value) {
    throw new Error("起始流水號不可空白。");
  }
  if (base === "16") {
    if (!/^[0-9A-F]+$/.test(value)) {
      throw new Error("起始流水號格式不正確（16 進制只允許 0-9、A-F）。");
    }
    return BigInt(`0x${value}`);
  }
  if (base === "cycle_0_6") {
    if (!/^\d+$/.test(value)) {
      throw new Error("起始流水號格式不正確（0–6 循環進位制只允許數字）。");
    }
    if (!/[0-6]$/.test(value)) {
      throw new Error("起始流水號格式不正確（0–6 循環進位制個位數必須是 0~6）。");
    }
    return BigInt(value);
  }
  if (base === "cycle_1_6") {
    if (!/^\d+$/.test(value)) {
      throw new Error("起始流水號格式不正確（1–6 循環進位制只允許數字）。");
    }
    if (!/[1-6]$/.test(value)) {
      throw new Error("起始流水號格式不正確（1–6 循環進位制個位數必須是 1~6）。");
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("起始流水號格式不正確（10 進制只允許數字）。");
  }
  return BigInt(value);
}

function formatByBase(valueBigInt, base) {
  if (base === "16") {
    return valueBigInt.toString(16).toUpperCase();
  }
  return valueBigInt.toString(10);
}

function getNextCycle06Value(currentValue) {
  const lastDigit = currentValue % 10n;
  if (lastDigit >= 0n && lastDigit <= 5n) {
    return currentValue + 1n;
  }
  if (lastDigit === 6n) {
    return currentValue + 4n;
  }
  throw new Error("0–6 循環進位制計算失敗：序號個位數必須介於 0~6。");
}

function getNextCycle16Value(currentValue) {
  const lastDigit = currentValue % 10n;
  if (lastDigit >= 1n && lastDigit <= 5n) {
    return currentValue + 1n;
  }
  if (lastDigit === 6n) {
    return currentValue + 5n;
  }
  throw new Error("1–6 循環進位制計算失敗：序號個位數必須介於 1~6。");
}

function getNextClgValue(currentValue, base) {
  if (base === "cycle_0_6") {
    return getNextCycle06Value(currentValue);
  }
  if (base === "cycle_1_6") {
    return getNextCycle16Value(currentValue);
  }
  return currentValue + 1n;
}

// 【用途】Cubepilot：依手動輸入組合前綴/流水號/後綴，支援 10/16/0-6/1-6循環進位制遞增
function buildClgSerialList(inputs) {
  const prefix = String(inputs?.prefix ?? "");
  const startSerial = String(inputs?.startSerial ?? "").trim();
  const suffix = String(inputs?.suffix ?? "");
  const base = normalizeClgBase(inputs?.base);
  const count = Number(inputs?.count);

  if (!startSerial) {
    throw new Error("請輸入起始流水號。");
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("請輸入正確的生成數量。");
  }

  const startValue = toBigIntByBase(startSerial, base);
  const serialWidth = startSerial.length;
  const serials = [];
  let current = startValue;

  for (let index = 0; index < count; index += 1) {
    const core = formatByBase(current, base).padStart(serialWidth, "0");
    serials.push(`${prefix}${core}${suffix}`);
    current = getNextClgValue(current, base);
  }

  return serials;
}

function normalizeClgSearchText(value) {
  return String(value ?? "").toLowerCase();
}

function findClgRowsByModel(rows, keyword) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const modelKey = resolveColumnKey(rows[0], "MODEL");
  if (!modelKey) {
    return [];
  }
  const target = normalizeClgSearchText(keyword);
  return rows.filter((row) => normalizeClgSearchText(row?.[modelKey] ?? "").includes(target));
}

function getClgModelValue(row) {
  return String(row?.[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] ?? "").trim();
}

function normalizeHmgSearchText(value) {
  return String(value ?? "").trim().toLowerCase();
}

function getHmgSearchKeyword(value) {
  const normalized = normalizeHmgSearchText(value);
  if (!normalized) {
    return "";
  }
  return normalized.slice(0, 6);
}

function getHmgModelValue(row) {
  return String(row?.[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] ?? "").trim();
}

function findHmgRowsByModel(rows, keyword) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const modelKey = resolveColumnKey(rows[0], "MODEL");
  if (!modelKey) {
    return [];
  }
  const target = getHmgSearchKeyword(keyword);
  if (!target) {
    return [];
  }
  return rows.filter((row) => normalizeHmgSearchText(row?.[modelKey] ?? "").includes(target));
}

function hideHmgSuggestPanel() {
  state.hmgMatchedRows = [];
  if (!ui.hmgSuggestPanel) {
    return;
  }
  ui.hmgSuggestPanel.hidden = true;
  ui.hmgSuggestPanel.innerHTML = "";
}

function showHmgSuggestPanel(query, matchedRows) {
  if (!ui.hmgSuggestPanel) {
    return;
  }
  const list = Array.isArray(matchedRows) ? matchedRows.slice(0, 20) : [];
  state.hmgMatchedRows = list;
  if (list.length === 0) {
    hideHmgSuggestPanel();
    return;
  }
  const optionsHtml = list
    .map((row, index) => {
      const model = getHmgModelValue(row) || "(空白 Model)";
      return `<button type="button" class="clg-suggest-btn" data-hmg-index="${index}">${escapeHtml(model)}</button>`;
    })
    .join("");
  const hiddenCount = Math.max((matchedRows?.length || 0) - list.length, 0);
  const hiddenText = hiddenCount > 0 ? `<p class="clg-suggest-title">另有 ${hiddenCount} 筆未顯示，請縮小關鍵字。</p>` : "";
  ui.hmgSuggestPanel.innerHTML = `
    <p class="clg-suggest-title">關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請點選一筆：</p>
    <div class="clg-suggest-list">${optionsHtml}</div>
    ${hiddenText}
  `;
  ui.hmgSuggestPanel.hidden = false;
}

function findSingleHmgExactMatch(matchedRows, query) {
  if (!Array.isArray(matchedRows) || matchedRows.length === 0) {
    return null;
  }
  const target = normalizeHmgSearchText(query);
  const exactMatchedRows = matchedRows.filter((row) => normalizeHmgSearchText(getHmgModelValue(row)) === target);
  if (exactMatchedRows.length !== 1) {
    return null;
  }
  return exactMatchedRows[0];
}

function updateHmgExportEnabled() {
  if (!ui.hmgExportBtn) {
    return;
  }
  ui.hmgExportBtn.disabled = state.isLoading || !state.currentRow;
}

async function renderHmgSelectedRow(selectedRow, query, matchCount) {
  state.currentRow = selectedRow;
  const model = getHmgModelValue(selectedRow);
  state.currentQuery = model;
  const historySnapshot = await loadHistorySnapshot("hmg");
  const generationHistory = filterGenerationRecords(historySnapshot.records, model);
  renderHmgSearchSuccess(ui, {
    row: state.currentRow,
    query,
    matchCount,
    resolveColumnKey,
    rowData: state.hmgRowData,
    generationHistory
  });
  bindPreviewTabsIn(ui.hmgPreviewPanel);
  bindSheetCopyCellsIn(ui.hmgPreviewPanel, onCopyError);
  bindCopyButtonsIn(ui.hmgPreviewPanel, onCopyError);
  bindClearHistoryButtonIn(ui.hmgPreviewPanel, "#btn-clear-history-hmg", onHmgClearHistoryClick);
  bindCustomTabActionsIn(ui.hmgPreviewPanel, {
    onAdd: onAddPreviewCustomTab,
    onRemove: onRemovePreviewCustomTab,
    onEdit: onEditPreviewCustomTab
  });
  updateHmgExportEnabled();
  updateHmgStatus(`查詢成功：${model}（命中 ${matchCount} 筆）`);
}

async function onHmgSuggestOptionClick(event) {
  const button = event.target.closest("[data-hmg-index]");
  if (!button) {
    return;
  }
  const index = Number(button.dataset.hmgIndex);
  if (!Number.isInteger(index) || index < 0 || index >= state.hmgMatchedRows.length) {
    return;
  }
  const selectedRow = state.hmgMatchedRows[index];
  const matchCount = state.hmgMatchedRows.length || 1;
  const model = getHmgModelValue(selectedRow);
  ui.hmgSearchInput.value = model;
  hideHmgSuggestPanel();
  try {
    await renderHmgSelectedRow(selectedRow, model, matchCount);
  } catch (error) {
    updateHmgStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

function onHmgSearchInputChange() {
  const query = ui.hmgSearchInput.value.trim();
  state.currentRow = null;
  state.currentQuery = query;
  updateHmgExportEnabled();

  if (!query || state.hmgRowData.length === 0) {
    hideHmgSuggestPanel();
    return;
  }

  const matchedRows = findHmgRowsByModel(state.hmgRowData, query);
  if (matchedRows.length <= 1) {
    hideHmgSuggestPanel();
    return;
  }

  const exactMatchedRow = findSingleHmgExactMatch(matchedRows, query);
  if (exactMatchedRow) {
    hideHmgSuggestPanel();
    return;
  }

  showHmgSuggestPanel(query, matchedRows);
}

function hideClgSuggestPanel() {
  state.clgMatchedRows = [];
  if (!ui.clgSuggestPanel) {
    return;
  }
  ui.clgSuggestPanel.hidden = true;
  ui.clgSuggestPanel.innerHTML = "";
}

function showClgSuggestPanel(query, matchedRows) {
  if (!ui.clgSuggestPanel) {
    return;
  }
  const list = Array.isArray(matchedRows) ? matchedRows.slice(0, 20) : [];
  state.clgMatchedRows = list;
  if (list.length === 0) {
    hideClgSuggestPanel();
    return;
  }
  const optionsHtml = list
    .map((row, index) => {
      const model = getClgModelValue(row) || "(空白機種名)";
      return `<button type="button" class="clg-suggest-btn" data-clg-index="${index}">${escapeHtml(model)}</button>`;
    })
    .join("");
  const hiddenCount = Math.max((matchedRows?.length || 0) - list.length, 0);
  const hiddenText = hiddenCount > 0 ? `<p class="clg-suggest-title">另有 ${hiddenCount} 筆未顯示，請縮小關鍵字。</p>` : "";
  ui.clgSuggestPanel.innerHTML = `
    <p class="clg-suggest-title">關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請點選一筆：</p>
    <div class="clg-suggest-list">${optionsHtml}</div>
    ${hiddenText}
  `;
  ui.clgSuggestPanel.hidden = false;
}

function findSingleClgExactMatch(matchedRows, query) {
  if (!Array.isArray(matchedRows) || matchedRows.length === 0) {
    return null;
  }
  const target = normalizeClgSearchText(query);
  const exactMatchedRows = matchedRows.filter((row) => normalizeClgSearchText(getClgModelValue(row)) === target);
  if (exactMatchedRows.length !== 1) {
    return null;
  }
  return exactMatchedRows[0];
}

async function renderClgSelectedRow(selectedRow, query, matchCount) {
  state.currentRow = selectedRow;
  const model = getClgModelValue(selectedRow);
  state.currentQuery = model;
  const plannedSerialPreview = buildClgPlannedSerialPreview(getClgInputValues());

  const historySnapshot = await loadHistorySnapshot("clg");
  const generationHistory = filterGenerationRecords(historySnapshot.records, model);
  renderClgSearchSuccess(ui, {
    row: state.currentRow,
    query,
    matchCount,
    resolveColumnKey,
    rowData: state.clgRowData,
    plannedSerialPreview,
    generationHistory
  });
  bindPreviewTabsIn(ui.clgPreviewPanel);
  bindSheetCopyCellsIn(ui.clgPreviewPanel, onCopyError);
  bindCopyButtonsIn(ui.clgPreviewPanel, onCopyError);
  bindClearHistoryButtonIn(ui.clgPreviewPanel, "#btn-clear-history-clg", onClgClearHistoryClick);
  bindCustomTabActionsIn(ui.clgPreviewPanel, {
    onAdd: onAddPreviewCustomTab,
    onRemove: onRemovePreviewCustomTab,
    onEdit: onEditPreviewCustomTab
  });
  updateClgExportEnabledBySettings();
  updateClgStatus(`查詢成功：${model}（命中 ${matchCount} 筆）`);
}

async function onClgSuggestOptionClick(event) {
  const button = event.target.closest("[data-clg-index]");
  if (!button) {
    return;
  }
  const index = Number(button.dataset.clgIndex);
  if (!Number.isInteger(index) || index < 0 || index >= state.clgMatchedRows.length) {
    return;
  }
  const selectedRow = state.clgMatchedRows[index];
  const matchCount = state.clgMatchedRows.length || 1;
  const model = getClgModelValue(selectedRow);
  ui.clgSearchInput.value = model;
  hideClgSuggestPanel();
  try {
    await renderClgSelectedRow(selectedRow, model, matchCount);
  } catch (error) {
    updateClgStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

function onClgSearchInputChange() {
  const query = ui.clgSearchInput.value.trim();
  state.currentRow = null;
  state.currentQuery = query;
  updateClgExportEnabledBySettings();

  if (!query || state.clgRowData.length === 0) {
    hideClgSuggestPanel();
    return;
  }

  const matchedRows = findClgRowsByModel(state.clgRowData, query);
  if (matchedRows.length <= 1) {
    hideClgSuggestPanel();
    return;
  }

  const exactMatchedRow = findSingleClgExactMatch(matchedRows, query);
  if (exactMatchedRow) {
    hideClgSuggestPanel();
    return;
  }

  showClgSuggestPanel(query, matchedRows);
}

function onClgSerialSettingsChange() {
  updateClgExportEnabledBySettings();
  refreshClgPlannedSerialPreview();
}

function buildClgPlannedSerialPreview(inputs) {
  const prefix = String(inputs?.prefix ?? "");
  const startSerial = String(inputs?.startSerial ?? "").trim();
  const suffix = String(inputs?.suffix ?? "");
  const base = normalizeClgBase(inputs?.base);
  const count = Number(inputs?.countText);

  try {
    if (!startSerial) {
      throw new Error("請輸入起始流水號，才能預覽序號。");
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("請輸入正確的生成數量，才能預覽序號。");
    }
    const startValue = toBigIntByBase(startSerial, base);
    const serialWidth = startSerial.length;
    const firstTen = [];
    const lastTen = [];
    let current = startValue;

    for (let index = 0; index < count; index += 1) {
      const core = formatByBase(current, base).padStart(serialWidth, "0");
      const serialText = `${prefix}${core}${suffix}`;
      if (firstTen.length < 10) {
        firstTen.push(serialText);
      }
      if (lastTen.length === 10) {
        lastTen.shift();
      }
      lastTen.push(serialText);
      current = getNextClgValue(current, base);
    }

    return {
      total: count,
      firstTen,
      lastTen,
      error: ""
    };
  } catch (error) {
    return {
      total: 0,
      firstTen: [],
      lastTen: [],
      error: getSafeErrorMessage(error)
    };
  }
}

function updateClgExportEnabledBySettings() {
  if (!ui.clgExportBtn) {
    return;
  }
  if (state.isLoading) {
    ui.clgExportBtn.disabled = true;
    return;
  }
  const plannedSerialPreview = buildClgPlannedSerialPreview(getClgInputValues());
  ui.clgExportBtn.disabled = Boolean(plannedSerialPreview.error);
}

function ensureClgManualPreviewRoot() {
  if (!ui.clgPreviewPanel) {
    return;
  }
  const existingRoot = ui.clgPreviewPanel.querySelector("#clg-planned-preview-root");
  if (existingRoot) {
    return;
  }
  ui.clgPreviewPanel.innerHTML = `
    <h2>Cubepilot 預覽窗格</h2>
    <p>未上傳 Cubepilot Excel 也可先使用序號生成設定。</p>
    <div id="clg-planned-preview-root"></div>
  `;
}

function refreshClgPlannedSerialPreview() {
  if (!state.currentRow) {
    ensureClgManualPreviewRoot();
  }
  const plannedSerialPreview = buildClgPlannedSerialPreview(getClgInputValues());
  updateClgPlannedSerialPreviewIn(ui, plannedSerialPreview);
}

function getClgExportFileName() {
  const defaultName = `${String(getActiveCustomerProfile()?.label ?? "Cubepilot")}-SN.xls`;
  const input = window.prompt("請輸入匯出檔名（可含副檔名）", defaultName);
  if (input === null) {
    return "";
  }
  const normalized = String(input).trim();
  if (!normalized) {
    return defaultName;
  }
  return /\.(xls|xlsx)$/i.test(normalized) ? normalized : `${normalized}.xls`;
}

// 【用途】依客戶 key 取得對應預覽 panel 節點
function getPreviewPanelByCustomerKey(customerKey) {
  const key = String(customerKey ?? "").trim();
  if (key === "yingbang") {
    return ui.previewPanel;
  }
  if (key === "lunfei") {
    return ui.lunfeiPreviewPanel;
  }
  if (key === "bng") {
    return ui.bngPreviewPanel;
  }
  if (key === "chg") {
    return ui.chgPreviewPanel;
  }
  if (key === "hmg") {
    return ui.hmgPreviewPanel;
  }
  if (key === "clg") {
    return ui.clgPreviewPanel;
  }
  return null;
}

// 【用途】切換預覽 pane 到指定頁籤
function activatePreviewPane(customerKey, paneId) {
  const panel = getPreviewPanelByCustomerKey(customerKey);
  const targetPaneId = String(paneId ?? "").trim();
  if (!panel || !targetPaneId) {
    return;
  }
  const tab = panel.querySelector(`.preview-tab[data-tab="${targetPaneId}"]`);
  if (!tab) {
    return;
  }
  tab.click();
}

// 【用途】自訂頁籤異動後，依客戶重新渲染目前預覽窗格
async function rerenderCustomerPreview(customerKey) {
  const key = String(customerKey ?? "").trim();
  if (!key) {
    return;
  }

  if (key === "yingbang") {
    const query = ui.searchInput.value.trim() || String(state.currentQuery ?? "").trim();
    if (!query || state.yingbangRowData.length === 0) {
      return;
    }
    const matchedRows = findWorkOrderRows(state.yingbangRowData, query);
    if (matchedRows.length === 0) {
      return;
    }
    state.currentRow = matchedRows[0];
    state.currentQuery = query;
    await refreshSearchPreview(query, matchedRows.length);
    return;
  }

  if (key === "lunfei") {
    const query = ui.lunfeiSearchInput.value.trim() || String(state.currentQuery ?? "").trim();
    if (!query) {
      return;
    }
    ui.lunfeiSearchInput.value = query;
    await performLunfeiSearch();
    return;
  }

  if (key === "bng") {
    const query = ui.bngSearchInput.value.trim() || String(state.currentQuery ?? "").trim();
    if (!query) {
      return;
    }
    ui.bngSearchInput.value = query;
    await performBngSearch();
    return;
  }

  if (key === "chg") {
    const query = ui.chgSearchInput.value.trim() || String(state.currentQuery ?? "").trim();
    if (!query) {
      return;
    }
    ui.chgSearchInput.value = query;
    await performChgSearch();
    return;
  }

  if (key === "hmg") {
    const query = ui.hmgSearchInput.value.trim() || String(state.currentQuery ?? "").trim();
    if (!query) {
      return;
    }
    ui.hmgSearchInput.value = query;
    await performHmgSearch();
    return;
  }

  if (key === "clg") {
    const query = ui.clgSearchInput.value.trim() || String(state.currentQuery ?? "").trim();
    if (!query) {
      return;
    }
    ui.clgSearchInput.value = query;
    await performClgSearch();
  }
}

// 【用途】新增客戶自訂頁籤（先建立標題，內容改在頁籤內直接編輯）
async function onAddPreviewCustomTab(customerKey) {
  const key = String(customerKey ?? "").trim();
  const profile = getCustomerProfileByKey(key);
  if (!profile) {
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
  const tabs = getEditableCustomerCustomTabs(key);
  const fixedCount = getFixedPreviewCustomTabCount(key);
  const newId = `user-${Date.now()}`;
  tabs.push({
    id: newId,
    label,
    html: ""
  });
  const newPaneId = normalizeCustomTabPaneId(newId, fixedCount + tabs.length - 1);
  persistEditableCustomerCustomTabs(key);
  await rerenderCustomerPreview(key);
  activatePreviewPane(key, newPaneId);
}

// 【用途】移除客戶自訂頁籤
async function onRemovePreviewCustomTab(customerKey, tabId, tabItemId) {
  const key = String(customerKey ?? "").trim();
  const targetTabId = String(tabId ?? "").trim();
  const targetItemId = String(tabItemId ?? "").trim();
  if (!key || !targetTabId) {
    return;
  }
  const tabs = getEditableCustomerCustomTabs(key);
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return;
  }
  const targetIndex = targetItemId
    ? tabs.findIndex((item) => String(item?.id || item?.key || item?.tabId || "").trim() === targetItemId)
    : findEditableCustomTabIndexByPaneId(key, targetTabId);
  if (targetIndex < 0) {
    return;
  }
  const nextTabs = tabs.filter((_, index) => index !== targetIndex);
  const confirmed = window.confirm("確定移除此自訂頁籤？");
  if (!confirmed) {
    return;
  }
  const profile = getCustomerProfileByKey(key);
  if (!profile) {
    return;
  }
  profile.extraPreviewTabs = nextTabs;
  persistEditableCustomerCustomTabs(key);
  await rerenderCustomerPreview(key);
}

// 【用途】儲存自訂頁籤內容區的即時編輯結果（HTML）
function onEditPreviewCustomTab(customerKey, tabId, tabItemId, htmlContent) {
  const key = String(customerKey ?? "").trim();
  const targetTabId = String(tabId ?? "").trim();
  const targetItemId = String(tabItemId ?? "").trim();
  if (!key || !targetTabId) {
    return;
  }
  const tabs = getEditableCustomerCustomTabs(key);
  if (!Array.isArray(tabs) || tabs.length === 0) {
    return;
  }
  const targetIndex = targetItemId
    ? tabs.findIndex((item) => String(item?.id || item?.key || item?.tabId || "").trim() === targetItemId)
    : findEditableCustomTabIndexByPaneId(key, targetTabId);
  if (targetIndex < 0) {
    return;
  }
  tabs[targetIndex] = {
    ...tabs[targetIndex],
    html: String(htmlContent ?? "")
  };
  persistEditableCustomerCustomTabs(key);
}

async function refreshSearchPreview(query, matchCount) {
  if (!state.currentRow) {
    return;
  }
  const workOrder = query;
  const purchaseOrder = getCurrentRowValue("PURCHASE_ORDER");
  const resolvedQty = getResolvedQty(state.currentRow, query);
  const historySnapshot = await loadHistorySnapshot("yingbang");
  renderSearchSuccess(ui, {
    row: state.currentRow,
    query,
    matchCount,
    rowData: state.yingbangRowData,
    resolveColumnKey,
    previewSN: buildYingbangPreviewSN(purchaseOrder, workOrder, historySnapshot.entries),
    datecode: getDatecode(),
    resolvedQty,
    workOrderHistory: filterGenerationRecords(historySnapshot.records, workOrder)
  });
  bindPreviewTabs(ui);
  bindCopyButtons(ui, onCopyError);
  bindSheetCopyCells(ui, onCopyError);
  bindClearHistoryButton(ui, onClearHistoryClick);
  bindCustomTabActionsIn(ui.previewPanel, {
    onAdd: onAddPreviewCustomTab,
    onRemove: onRemovePreviewCustomTab,
    onEdit: onEditPreviewCustomTab
  });
}

function buildHistoryRecord(workOrder) {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  const key = String(workOrder ?? "").trim();
  return `${yyyy}-${mm}-${dd}-${key}`;
}

async function onClearHistoryClick() {
  const workOrder = String(state.currentQuery ?? "").trim();
  if (!workOrder) {
    updateStatus(ui, "目前沒有可清空的工單歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空工單 ${workOrder} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  try {
    await resetHistoryByApi({ customer: "yingbang", key: workOrder });
    updateStatus(ui, `已清空工單 ${workOrder} 的歷史序號。`);
    await refreshSearchPreview(workOrder, 1);
  } catch (error) {
    updateStatus(ui, `清空失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onLunfeiClearHistoryClick() {
  const mo = String(state.currentQuery ?? "").trim();
  if (!mo) {
    updateLunfeiStatus("目前沒有可清空的 MO 歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空 MO ${mo} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  const weekKey = getLunfeiWeekKey();
  try {
    await resetHistoryByApi({ customer: "lunfei", key: mo });
    await resetHistoryByApi({ customer: "lunfei", key: weekKey });
    updateLunfeiStatus(`已清空 MO ${mo} 的歷史序號。`);
    await performLunfeiSearch();
  } catch (error) {
    updateLunfeiStatus(`清空失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onBngClearHistoryClick() {
  const mo = String(state.currentQuery ?? "").trim();
  if (!mo) {
    updateBngStatus("目前沒有可清空的 MO 歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空 MO ${mo} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  try {
    await resetHistoryByApi({ customer: "bng", key: mo });
    updateBngStatus(`已清空 MO ${mo} 的歷史序號。`);
    await performBngSearch();
  } catch (error) {
    updateBngStatus(`清空失敗：${getSafeErrorMessage(error)}`, true);
  }
}

// 【用途】列印超恩收據明細（依客戶套印欄位映射）
function onBngPrintReceiptClick() {
  if (!state.currentRow) {
    updateBngStatus("請先查詢 MO 後再列印收據明細。", true);
    return;
  }

  try {
    const payload = buildBngReceiptPrintPayload(state.currentRow);
    mountBngReceiptPrintView(payload);
    window.print();
    updateBngStatus(`已開啟列印：MO ${payload.mo} 收據明細。`);
  } catch (error) {
    updateBngStatus(`列印失敗：${getSafeErrorMessage(error)}`, true);
  } finally {
    cleanupBngReceiptPrintView();
  }
}

async function onChgClearHistoryClick() {
  const workOrder = String(state.currentQuery ?? "").trim();
  if (!workOrder) {
    updateChgStatus("目前沒有可清空的工單歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空工單 ${workOrder} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  try {
    await resetHistoryByApi({ customer: "chg", key: workOrder });
    updateChgStatus(`已清空工單 ${workOrder} 的歷史序號。`);
    await performChgSearch();
  } catch (error) {
    updateChgStatus(`清空失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onHmgClearHistoryClick() {
  const model = String(state.currentQuery ?? "").trim();
  if (!model) {
    updateHmgStatus("目前沒有可清空的 Model 歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空 Model ${model} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  try {
    await resetHistoryByApi({ customer: "hmg", key: model });
    updateHmgStatus(`已清空 Model ${model} 的歷史序號。`);
    await performHmgSearch();
  } catch (error) {
    updateHmgStatus(`清空失敗：${getSafeErrorMessage(error)}`, true);
  }
}

// 【用途】Cubepilot：清空目前機種名對應的流水號歷史
async function onClgClearHistoryClick() {
  const model = String(state.currentQuery ?? "").trim();
  if (!model) {
    updateClgStatus("目前沒有可清空的機種名歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空機種名 ${model} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  try {
    await resetHistoryByApi({ customer: "clg", key: model });
    updateClgStatus(`已清空機種名 ${model} 的歷史序號。`);
    await performClgSearch();
  } catch (error) {
    updateClgStatus(`清空失敗：${getSafeErrorMessage(error)}`, true);
  }
}

function getLunfeiModelAlert(modelValue) {
  const model = String(modelValue ?? "").trim().toUpperCase();
  if (/^BAG017-|^BAG159-|^BAG016-/.test(model)) {
    return {
      message: "請列印所有貼紙（外箱及客人提供的 MAC 除外）\n版本號搜尋位置：H:\\工程-倫飛\\excel\\172.17.1.44\\Common\\工程-倫飛(不可刪)",
      disableGenerate: false
    };
  }
  if (model === "BAG428-001D") {
    return {
      message: "此型號不需要序號",
      disableGenerate: true
    };
  }
  return null;
}

function getLunfeiPreviewSN(entries) {
  const weekKey = getLunfeiWeekKey();
  const lastSerial = getLastSerialFromEntries(entries, weekKey);
  const nextSerial = lastSerial + 1;
  const weekNum2 = getCurrentWeekNumber2Digits();
  const preview = buildLunfeiSN(weekNum2, nextSerial);
  if (!preview) {
    return "";
  }
  return preview;
}

async function performLunfeiSearch() {
  if (state.lunfeiRowData.length === 0) {
    updateLunfeiStatus("請先上傳共用 Excel 檔案再查詢。", true);
    return;
  }

  const query = ui.lunfeiSearchInput.value.trim();
  if (!query) {
    updateLunfeiStatus("請先輸入 MO。", true);
    return;
  }

  const matchedRows = findRowsByColumnCode(state.lunfeiRowData, "MO", query);
  if (matchedRows.length === 0) {
    state.currentRow = null;
    state.currentQuery = query;
    ui.lunfeiExportBtn.disabled = true;
    renderLunfeiSearchNotFound(ui, query);
    updateLunfeiStatus(`查詢失敗：找不到 MO：${query}`, true);
    return;
  }

  state.currentRow = matchedRows[0];
  state.currentQuery = query;
  try {
    const resolvedQty = resolveQtyByPairedSlash(state.currentRow, query, "MO", "QTY");
    const historySnapshot = await loadHistorySnapshot("lunfei");
    const generationHistory = filterGenerationRecords(historySnapshot.records, query);
    renderLunfeiSearchSuccess(ui, {
      row: state.currentRow,
      query,
      matchCount: matchedRows.length,
      resolveColumnKey,
      previewSN: getLunfeiPreviewSN(historySnapshot.entries),
      rowData: state.lunfeiRowData,
      generationHistory,
      resolvedQty
    });
    bindPreviewTabsIn(ui.lunfeiPreviewPanel);
    bindSheetCopyCellsIn(ui.lunfeiPreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.lunfeiPreviewPanel, onCopyError);
    bindClearHistoryButtonIn(ui.lunfeiPreviewPanel, "#btn-clear-history-lunfei", onLunfeiClearHistoryClick);
    bindCustomTabActionsIn(ui.lunfeiPreviewPanel, {
      onAdd: onAddPreviewCustomTab,
      onRemove: onRemovePreviewCustomTab,
      onEdit: onEditPreviewCustomTab
    });

    const model = state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
    const alertInfo = getLunfeiModelAlert(model);
    if (alertInfo) {
      window.alert(alertInfo.message);
      ui.lunfeiExportBtn.disabled = Boolean(alertInfo.disableGenerate);
    } else {
      ui.lunfeiExportBtn.disabled = false;
    }

    updateLunfeiStatus(`查詢成功：${query}（命中 ${matchedRows.length} 筆）`);
  } catch (error) {
    updateLunfeiStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function performBngSearch() {
  if (state.bngRowData.length === 0) {
    updateBngStatus("請先上傳共用 Excel 檔案再查詢。", true);
    return;
  }

  const query = ui.bngSearchInput.value.trim();
  if (!query) {
    updateBngStatus("請先輸入 MO。", true);
    return;
  }

  const matchedRows = findRowsByColumnCode(state.bngRowData, "MO", query);
  if (matchedRows.length === 0) {
    state.currentRow = null;
    state.currentQuery = query;
    ui.bngExportBtn.disabled = true;
    setBngPrintEnabled(false);
    renderBngSearchNotFound(ui, query);
    updateBngStatus("查無對應資料，請確認 MO 是否正確", true);
    return;
  }

  state.currentRow = matchedRows[0];
  state.currentQuery = query;
  try {
    const historySnapshot = await loadHistorySnapshot("bng");
    const generationHistory = filterGenerationRecords(historySnapshot.records, query);
    const normalizedRanges = {
      mac: normalizeRangeText(state.currentRow[resolveColumnKey(state.currentRow, "MAC_RANGE") || CONFIG.COLUMNS.MAC_RANGE] ?? ""),
      sn: normalizeRangeText(state.currentRow[resolveColumnKey(state.currentRow, "SN_RANGE") || CONFIG.COLUMNS.SN_RANGE] ?? ""),
      uuid: String(state.currentRow[resolveColumnKey(state.currentRow, "UUID_RANGE") || CONFIG.COLUMNS.UUID_RANGE] ?? "").trim() === "0"
        ? "無"
        : normalizeRangeText(state.currentRow[resolveColumnKey(state.currentRow, "UUID_RANGE") || CONFIG.COLUMNS.UUID_RANGE] ?? "")
    };
    renderBngSearchSuccess(ui, {
      row: state.currentRow,
      query,
      matchCount: matchedRows.length,
      resolveColumnKey,
      rowData: state.bngRowData,
      generationHistory,
      normalizedRanges
    });
    bindPreviewTabsIn(ui.bngPreviewPanel);
    bindSheetCopyCellsIn(ui.bngPreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.bngPreviewPanel, onCopyError);
    bindClearHistoryButtonIn(ui.bngPreviewPanel, "#btn-clear-history-bng", onBngClearHistoryClick);
    bindCustomTabActionsIn(ui.bngPreviewPanel, {
      onAdd: onAddPreviewCustomTab,
      onRemove: onRemovePreviewCustomTab,
      onEdit: onEditPreviewCustomTab
    });
    ui.bngExportBtn.disabled = false;
    setBngPrintEnabled(true);
    updateBngStatus(`查詢成功：MO ${query}（命中 ${matchedRows.length} 筆）`);
  } catch (error) {
    setBngPrintEnabled(false);
    updateBngStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function performChgSearch() {
  if (state.chgRowData.length === 0) {
    updateChgStatus("請先上傳共用 Excel 檔案再查詢。", true);
    return;
  }

  const query = ui.chgSearchInput.value.trim();
  if (!query) {
    updateChgStatus("請先輸入工單。", true);
    return;
  }

  const matchedRows = findRowsByColumnCode(state.chgRowData, "WORK_ORDER", query);
  if (matchedRows.length === 0) {
    state.currentRow = null;
    state.currentQuery = query;
    ui.chgExportBtn.disabled = true;
    renderChgSearchNotFound(ui, query);
    updateChgStatus("查無對應資料，請確認工單是否正確", true);
    return;
  }

  state.currentRow = matchedRows[0];
  const workOrder = String(
    state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] ?? ""
  ).trim();
  state.currentQuery = workOrder;
  try {
    const historySnapshot = await loadHistorySnapshot("chg");
    const generationHistory = filterGenerationRecords(historySnapshot.records, workOrder);
    renderChgSearchSuccess(ui, {
      row: state.currentRow,
      query,
      matchCount: matchedRows.length,
      resolveColumnKey,
      rowData: state.chgRowData,
      generationHistory
    });
    bindPreviewTabsIn(ui.chgPreviewPanel);
    bindSheetCopyCellsIn(ui.chgPreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.chgPreviewPanel, onCopyError);
    bindClearHistoryButtonIn(ui.chgPreviewPanel, "#btn-clear-history-chg", onChgClearHistoryClick);
    bindCustomTabActionsIn(ui.chgPreviewPanel, {
      onAdd: onAddPreviewCustomTab,
      onRemove: onRemovePreviewCustomTab,
      onEdit: onEditPreviewCustomTab
    });
    ui.chgExportBtn.disabled = false;
    updateChgStatus(`查詢成功：工單 ${query}（命中 ${matchedRows.length} 筆）`);
  } catch (error) {
    updateChgStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function performHmgSearch() {
  if (state.hmgRowData.length === 0) {
    hideHmgSuggestPanel();
    updateHmgStatus("請先上傳赫星 Excel 檔案再查詢。", true);
    return;
  }

  const query = ui.hmgSearchInput.value.trim();
  if (!query) {
    hideHmgSuggestPanel();
    updateHmgStatus("請先輸入 Model。", true);
    return;
  }

  const matchedRows = findHmgRowsByModel(state.hmgRowData, query);
  if (matchedRows.length === 0) {
    hideHmgSuggestPanel();
    state.currentRow = null;
    state.currentQuery = query;
    updateHmgExportEnabled();
    renderHmgSearchNotFound(ui, query);
    updateHmgStatus(`查無對應機種：${query}`, true);
    return;
  }

  const exactMatchedRow = findSingleHmgExactMatch(matchedRows, query);
  if (matchedRows.length > 1 && !exactMatchedRow) {
    showHmgSuggestPanel(query, matchedRows);
    state.currentRow = null;
    state.currentQuery = query;
    updateHmgExportEnabled();
    ui.hmgPreviewPanel.innerHTML = `
      <h2>赫星 預覽窗格</h2>
      <p>關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請從查詢區下方提示清單點選機種。</p>
    `;
    updateHmgStatus(`命中 ${matchedRows.length} 筆，請從下方提示清單選擇機種。`);
    return;
  }

  hideHmgSuggestPanel();
  const selectedRow = exactMatchedRow || matchedRows[0];
  const selectedQuery = getHmgModelValue(selectedRow) || query;
  ui.hmgSearchInput.value = selectedQuery;

  try {
    await renderHmgSelectedRow(selectedRow, selectedQuery, matchedRows.length);
  } catch (error) {
    updateHmgStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function performClgSearch() {
  if (state.clgRowData.length === 0) {
    hideClgSuggestPanel();
    updateClgStatus("請先上傳 Cubepilot Excel 檔案再查詢。", true);
    return;
  }

  const query = ui.clgSearchInput.value.trim();
  if (!query) {
    hideClgSuggestPanel();
    updateClgStatus("請先輸入機種名。", true);
    return;
  }

  const matchedRows = findClgRowsByModel(state.clgRowData, query);
  if (matchedRows.length === 0) {
    hideClgSuggestPanel();
    state.currentRow = null;
    state.currentQuery = query;
    updateClgExportEnabledBySettings();
    renderClgSearchNotFound(ui, query);
    updateClgStatus(`查無對應機種：${query}`, true);
    return;
  }

  const exactMatchedRow = findSingleClgExactMatch(matchedRows, query);
  if (matchedRows.length > 1 && !exactMatchedRow) {
    showClgSuggestPanel(query, matchedRows);
    state.currentRow = null;
    state.currentQuery = query;
    updateClgExportEnabledBySettings();
    ui.clgPreviewPanel.innerHTML = `
      <h2>Cubepilot 預覽窗格</h2>
      <p>關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請從查詢區下方提示清單點選機種。</p>
    `;
    updateClgStatus(`命中 ${matchedRows.length} 筆，請從下方提示清單選擇機種。`);
    return;
  }

  hideClgSuggestPanel();
  const selectedRow = exactMatchedRow || matchedRows[0];
  const selectedQuery = getClgModelValue(selectedRow) || query;
  ui.clgSearchInput.value = selectedQuery;

  try {
    await renderClgSelectedRow(selectedRow, selectedQuery, matchedRows.length);
  } catch (error) {
    updateClgStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function openSerialHistoryPanel() {
  try {
    const historySnapshot = await loadHistorySnapshot("yingbang");
    ui.historyPanel.hidden = false;
    renderSerialHistoryTableIn(ui.historyPanel, historySnapshot.entries, "工單");
    bindHistoryResetButtons(ui, onResetSerialHistoryKey);
  } catch (error) {
    updateStatus(ui, `歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function openLunfeiSerialHistoryPanel() {
  try {
    const historySnapshot = await loadHistorySnapshot("lunfei");
    ui.lunfeiHistoryPanel.hidden = false;
    renderSerialHistoryTableIn(ui.lunfeiHistoryPanel, historySnapshot.entries, "週別 key");
    bindHistoryResetButtonsIn(ui.lunfeiHistoryPanel, onLunfeiResetSerialHistoryKey);
  } catch (error) {
    updateLunfeiStatus(`歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function openBngSerialHistoryPanel() {
  try {
    const historySnapshot = await loadHistorySnapshot("bng");
    ui.bngHistoryPanel.hidden = false;
    renderSerialHistoryTableIn(ui.bngHistoryPanel, historySnapshot.entries, "MO");
    bindHistoryResetButtonsIn(ui.bngHistoryPanel, onBngResetSerialHistoryKey);
  } catch (error) {
    updateBngStatus(`歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function openChgSerialHistoryPanel() {
  try {
    const historySnapshot = await loadHistorySnapshot("chg");
    ui.chgHistoryPanel.hidden = false;
    renderSerialHistoryTableIn(ui.chgHistoryPanel, historySnapshot.entries, "工單");
    bindHistoryResetButtonsIn(ui.chgHistoryPanel, onChgResetSerialHistoryKey);
  } catch (error) {
    updateChgStatus(`歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function openHmgSerialHistoryPanel() {
  try {
    const historySnapshot = await loadHistorySnapshot("hmg");
    ui.hmgHistoryPanel.hidden = false;
    renderSerialHistoryTableIn(ui.hmgHistoryPanel, historySnapshot.entries, "Model");
    bindHistoryResetButtonsIn(ui.hmgHistoryPanel, onHmgResetSerialHistoryKey);
  } catch (error) {
    updateHmgStatus(`歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function openClgSerialHistoryPanel() {
  try {
    const historySnapshot = await loadHistorySnapshot("clg");
    ui.clgHistoryPanel.hidden = false;
    renderSerialHistoryTableIn(ui.clgHistoryPanel, historySnapshot.entries, "機種名");
    bindHistoryResetButtonsIn(ui.clgHistoryPanel, onClgResetSerialHistoryKey);
  } catch (error) {
    updateClgStatus(`歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await resetHistoryByApi({ customer: "yingbang", key });
    if (result.removed) {
      updateStatus(ui, `已重置 ${key} 的流水號歷史。`);
    } else {
      updateStatus(ui, `找不到 ${key} 的歷史資料。`, true);
    }
    await openSerialHistoryPanel();
  } catch (error) {
    updateStatus(ui, `重置失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onLunfeiResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await resetHistoryByApi({ customer: "lunfei", key });
    if (result.removed) {
      updateLunfeiStatus(`已重置 ${key} 的流水號歷史。`);
    } else {
      updateLunfeiStatus(`找不到 ${key} 的歷史資料。`, true);
    }
    await openLunfeiSerialHistoryPanel();
  } catch (error) {
    updateLunfeiStatus(`重置失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onBngResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await resetHistoryByApi({ customer: "bng", key });
    if (result.removed) {
      updateBngStatus(`已重置 ${key} 的流水號歷史。`);
    } else {
      updateBngStatus(`找不到 ${key} 的歷史資料。`, true);
    }
    await openBngSerialHistoryPanel();
  } catch (error) {
    updateBngStatus(`重置失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onChgResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await resetHistoryByApi({ customer: "chg", key });
    if (result.removed) {
      updateChgStatus(`已重置 ${key} 的流水號歷史。`);
    } else {
      updateChgStatus(`找不到 ${key} 的歷史資料。`, true);
    }
    await openChgSerialHistoryPanel();
  } catch (error) {
    updateChgStatus(`重置失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onHmgResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await resetHistoryByApi({ customer: "hmg", key });
    if (result.removed) {
      updateHmgStatus(`已重置 ${key} 的流水號歷史。`);
    } else {
      updateHmgStatus(`找不到 ${key} 的歷史資料。`, true);
    }
    await openHmgSerialHistoryPanel();
  } catch (error) {
    updateHmgStatus(`重置失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function onClgResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    const result = await resetHistoryByApi({ customer: "clg", key });
    if (result.removed) {
      updateClgStatus(`已重置 ${key} 的流水號歷史。`);
    } else {
      updateClgStatus(`找不到 ${key} 的歷史資料。`, true);
    }
    await openClgSerialHistoryPanel();
  } catch (error) {
    updateClgStatus(`重置失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function performSearch() {
  if (getActiveCustomerKey() === "lunfei") {
    await performLunfeiSearch();
    return;
  }
  if (getActiveCustomerKey() === "bng") {
    await performBngSearch();
    return;
  }
  if (getActiveCustomerKey() === "chg") {
    await performChgSearch();
    return;
  }
  if (getActiveCustomerKey() === "hmg") {
    await performHmgSearch();
    return;
  }
  if (getActiveCustomerKey() === "clg") {
    await performClgSearch();
    return;
  }

  if (state.yingbangRowData.length === 0) {
    updateStatus(ui, "請先上傳共用 Excel 檔案再查詢。", true);
    return;
  }

  const query = ui.searchInput.value.trim();
  if (!query) {
    updateStatus(ui, "請先輸入工單號。", true);
    return;
  }

  const matchedRows = findWorkOrderRows(state.yingbangRowData, query);
  if (matchedRows.length === 0) {
    state.currentRow = null;
    state.currentQuery = query;
    setExportEnabled(false);
    renderSearchNotFound(ui, query);
    updateStatus(ui, `查詢失敗：找不到工單 ${query}`, true);
    return;
  }

  state.currentRow = matchedRows[0];
  state.currentQuery = query;
  setExportEnabled(true);
  try {
    await refreshSearchPreview(query, matchedRows.length);
    updateStatus(ui, `查詢成功：${query}（命中 ${matchedRows.length} 筆）`);
  } catch (error) {
    updateStatus(ui, `歷史載入失敗：${getSafeErrorMessage(error)}`, true);
  }
}

async function processSharedExcelFile(file) {
  if (!file) {
    return;
  }
  setAllCustomerLoading(true, `讀取中：${file.name}（同步解析共用客戶）...`);
  try {
    const parseTargets = getSharedParseTargets();
    const parseResults = await Promise.all(
      parseTargets.map(async (target) => {
        const parsed = await parseExcelByApi({
          customer: target.customer,
          sheetName: target.sheetName,
          parseRules: target.parseRules,
          file
        });
        return {
          customer: target.customer,
          rows: Array.isArray(parsed.rows) ? parsed.rows : []
        };
      })
    );
    const rowsByCustomer = { yingbang: [], lunfei: [], bng: [], chg: [] };
    parseResults.forEach((item) => {
      rowsByCustomer[item.customer] = item.rows;
    });

    state.yingbangRowData = rowsByCustomer.yingbang;
    state.lunfeiRowData = rowsByCustomer.lunfei;
    state.bngRowData = rowsByCustomer.bng;
    state.chgRowData = rowsByCustomer.chg;
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];

    ui.historyPanel.hidden = true;
    ui.lunfeiHistoryPanel.hidden = true;
    ui.bngHistoryPanel.hidden = true;
    ui.chgHistoryPanel.hidden = true;

    renderLoadResult(ui, state.yingbangRowData, file.name);
    ui.lunfeiPreviewPanel.innerHTML = `
      <h2>倫飛預覽窗格</h2>
      <p>來源檔案：${file.name}</p>
      <p>已載入倫飛出貨 ${state.lunfeiRowData.length} 筆資料。</p>
    `;
    ui.bngPreviewPanel.innerHTML = `
      <h2>超恩預覽窗格</h2>
      <p>來源檔案：${file.name}</p>
      <p>已載入超恩出貨 ${state.bngRowData.length} 筆資料。</p>
    `;
    ui.chgPreviewPanel.innerHTML = `
      <h2>KOYA 預覽窗格</h2>
      <p>來源檔案：${file.name}</p>
      <p>已載入 KOYA 出貨 ${state.chgRowData.length} 筆資料。</p>
    `;

    setSearchEnabled(state.yingbangRowData.length > 0);
    setExportEnabled(false);
    ui.lunfeiSearchInput.disabled = state.lunfeiRowData.length === 0;
    ui.lunfeiQueryBtn.disabled = state.lunfeiRowData.length === 0;
    ui.lunfeiExportBtn.disabled = true;
    ui.bngSearchInput.disabled = state.bngRowData.length === 0;
    ui.bngQueryBtn.disabled = state.bngRowData.length === 0;
    ui.bngExportBtn.disabled = true;
    setBngPrintEnabled(false);
    ui.chgSearchInput.disabled = state.chgRowData.length === 0;
    ui.chgQueryBtn.disabled = state.chgRowData.length === 0;
    ui.chgExportBtn.disabled = true;

    updateStatus(
      ui,
      `已載入共用 Excel：${file.name}（營邦 ${state.yingbangRowData.length}、倫飛 ${state.lunfeiRowData.length}、超恩 ${state.bngRowData.length}、KOYA ${state.chgRowData.length}）`
    );
    updateLunfeiStatus(`已載入共用 Excel：倫飛 ${state.lunfeiRowData.length} 筆資料。`);
    updateBngStatus(`已載入共用 Excel：超恩 ${state.bngRowData.length} 筆資料。`);
    updateChgStatus(`已載入共用 Excel：KOYA ${state.chgRowData.length} 筆資料。`);
  } catch (error) {
    state.yingbangRowData = [];
    state.lunfeiRowData = [];
    state.bngRowData = [];
    state.chgRowData = [];
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    setSearchEnabled(false);
    setExportEnabled(false);
    ui.lunfeiSearchInput.disabled = true;
    ui.lunfeiQueryBtn.disabled = true;
    ui.lunfeiExportBtn.disabled = true;
    ui.bngSearchInput.disabled = true;
    ui.bngQueryBtn.disabled = true;
    ui.bngExportBtn.disabled = true;
    setBngPrintEnabled(false);
    ui.chgSearchInput.disabled = true;
    ui.chgQueryBtn.disabled = true;
    ui.chgExportBtn.disabled = true;
    ui.historyPanel.hidden = true;
    ui.lunfeiHistoryPanel.hidden = true;
    ui.bngHistoryPanel.hidden = true;
    ui.chgHistoryPanel.hidden = true;

    const message = `讀取失敗：${getSafeErrorMessage(error)}`;
    updateStatus(ui, message, true);
    updateLunfeiStatus(message, true);
    updateBngStatus(message, true);
    updateChgStatus(message, true);

    ui.previewPanel.innerHTML = `
      <h2>預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${getSafeErrorMessage(error)}</div>
    `;
    ui.lunfeiPreviewPanel.innerHTML = `
      <h2>倫飛預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${getSafeErrorMessage(error)}</div>
    `;
    ui.bngPreviewPanel.innerHTML = `
      <h2>超恩預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${getSafeErrorMessage(error)}</div>
    `;
    ui.chgPreviewPanel.innerHTML = `
      <h2>KOYA 預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${getSafeErrorMessage(error)}</div>
    `;
  } finally {
    setAllCustomerLoading(false);
  }
}

async function processHmgExcelFile(file) {
  if (!file) {
    return;
  }
  setHmgLoading(true, `讀取中：${file.name}（赫星）...`);
  try {
    const target = getHmgParseTarget();
    const parsed = await parseExcelByApi({
      customer: target.customer,
      sheetName: target.sheetName,
      parseRules: target.parseRules,
      file
    });
    state.hmgRowData = Array.isArray(parsed.rows) ? parsed.rows : [];
    state.hmgMatchedRows = [];
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    hideHmgSuggestPanel();
    ui.hmgHistoryPanel.hidden = true;
    ui.hmgSearchInput.disabled = state.hmgRowData.length === 0;
    ui.hmgQueryBtn.disabled = state.hmgRowData.length === 0;
    updateHmgExportEnabled();
    ui.hmgPreviewPanel.innerHTML = `
      <h2>赫星 預覽窗格</h2>
      <p>來源檔案：${file.name}</p>
      <p>已載入赫星 ${state.hmgRowData.length} 筆資料。</p>
    `;
    updateHmgStatus(`已載入赫星 Excel：${file.name}（${state.hmgRowData.length} 筆）`);
  } catch (error) {
    state.hmgRowData = [];
    state.hmgMatchedRows = [];
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    hideHmgSuggestPanel();
    ui.hmgSearchInput.disabled = true;
    ui.hmgQueryBtn.disabled = true;
    updateHmgExportEnabled();
    ui.hmgHistoryPanel.hidden = true;
    updateHmgStatus(`讀取失敗：${getSafeErrorMessage(error)}`, true);
    ui.hmgPreviewPanel.innerHTML = `
      <h2>赫星 預覽窗格</h2>
      <div class="error-box">讀取赫星 Excel 失敗：${getSafeErrorMessage(error)}</div>
    `;
  } finally {
    setHmgLoading(false);
  }
}

async function processClgExcelFile(file) {
  if (!file) {
    return;
  }
  setClgLoading(true, `讀取中：${file.name}（Cubepilot）...`);
  try {
    const target = getClgParseTarget();
    const parsed = await parseExcelByApi({
      customer: target.customer,
      sheetName: target.sheetName,
      parseRules: target.parseRules,
      file
    });
    state.clgRowData = Array.isArray(parsed.rows) ? parsed.rows : [];
    state.clgMatchedRows = [];
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    hideClgSuggestPanel();
    ui.clgHistoryPanel.hidden = true;
    ui.clgSearchInput.disabled = state.clgRowData.length === 0;
    ui.clgQueryBtn.disabled = state.clgRowData.length === 0;
    updateClgExportEnabledBySettings();
    ui.clgPreviewPanel.innerHTML = `
      <h2>Cubepilot 預覽窗格</h2>
      <p>來源檔案：${file.name}</p>
      <p>已載入 Cubepilot ${state.clgRowData.length} 筆資料。</p>
    `;
    updateClgStatus(`已載入 Cubepilot Excel：${file.name}（${state.clgRowData.length} 筆）`);
  } catch (error) {
    state.clgRowData = [];
    state.clgMatchedRows = [];
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    hideClgSuggestPanel();
    ui.clgSearchInput.disabled = true;
    ui.clgQueryBtn.disabled = true;
    updateClgExportEnabledBySettings();
    ui.clgHistoryPanel.hidden = true;
    updateClgStatus(`讀取失敗：${getSafeErrorMessage(error)}`, true);
    ui.clgPreviewPanel.innerHTML = `
      <h2>Cubepilot 預覽窗格</h2>
      <div class="error-box">讀取 Cubepilot Excel 失敗：${getSafeErrorMessage(error)}</div>
    `;
  } finally {
    setClgLoading(false);
  }
}

async function onFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processSharedExcelFile(file);
  } finally {
    ui.fileInput.value = "";
  }
}

async function onLunfeiFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processSharedExcelFile(file);
  } finally {
    ui.lunfeiFileInput.value = "";
  }
}

async function onBngFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processSharedExcelFile(file);
  } finally {
    ui.bngFileInput.value = "";
  }
}

async function onChgFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processSharedExcelFile(file);
  } finally {
    ui.chgFileInput.value = "";
  }
}

async function onHmgFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processHmgExcelFile(file);
  } finally {
    ui.hmgFileInput.value = "";
  }
}

async function onClgFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processClgExcelFile(file);
  } finally {
    ui.clgFileInput.value = "";
  }
}

async function loadTable() {
  if (getActiveCustomerKey() === "lunfei") {
    ui.lunfeiFileInput.click();
  } else if (getActiveCustomerKey() === "bng") {
    ui.bngFileInput.click();
  } else if (getActiveCustomerKey() === "chg") {
    ui.chgFileInput.click();
  } else if (getActiveCustomerKey() === "hmg") {
    ui.hmgFileInput.click();
  } else if (getActiveCustomerKey() === "clg") {
    ui.clgFileInput.click();
  } else {
    ui.fileInput.click();
  }
}

function getActiveCustomerExportFilename() {
  if (getActiveCustomerKey() === "hmg") {
    const now = new Date();
    const yyyy = String(now.getFullYear());
    const mm = String(now.getMonth() + 1).padStart(2, "0");
    const dd = String(now.getDate()).padStart(2, "0");
    const rawModel = String(state.currentQuery || getHmgModelValue(state.currentRow) || "model").trim();
    const safeModel = rawModel
      .replace(/[\\/:*?"<>|]/g, "_")
      .replace(/\s+/g, "_")
      .replace(/\.+$/g, "") || "model";
    return `${yyyy}${mm}${dd}-${safeModel}.xls`;
  }
  const label = String(getActiveCustomerProfile()?.label ?? "").trim() || getActiveCustomerKey();
  return `${label}-SN.xls`;
}

async function onExportClick() {
  if (getActiveCustomerKey() === "lunfei") {
    if (!state.currentRow) {
      updateLunfeiStatus("請先查詢 MO 後再生成。", true);
      return;
    }
    if (ui.lunfeiExportBtn.disabled) {
      updateLunfeiStatus("此型號不需要序號，已禁止生成。", true);
      return;
    }
    try {
      const mo = state.currentQuery || String(state.currentRow[resolveColumnKey(state.currentRow, "MO") || CONFIG.COLUMNS.MO] ?? "").trim();
      const qty = resolveQtyByPairedSlash(state.currentRow, mo, "MO", "QTY");
      const weekKey = getLunfeiWeekKey();
      const workOrder = String(
        state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] ?? ""
      ).trim();
      const generated = await generateSnByApi({
        customer: "lunfei",
        key: weekKey,
        qty,
        week_key: weekKey
      });
      const snList = (generated.sn_list || []).map((sn) => ({ SN: String(sn ?? "") }));
      state.generatedSNList = snList;

      await upsertHistoryByApi({
        customer: "lunfei",
        key: mo,
        increment: 0,
        record: buildHistoryRecord(mo)
      });

      const boxRow = {
        "P/N": state.currentRow[resolveColumnKey(state.currentRow, "PN") || CONFIG.COLUMNS.PN] || "",
        "加工WO#": state.currentRow[resolveColumnKey(state.currentRow, "PROCESS_WO") || CONFIG.COLUMNS.PROCESS_WO] || "",
        對應PCBA: state.currentRow[resolveColumnKey(state.currentRow, "PCBA") || CONFIG.COLUMNS.PCBA] || "",
        工單: workOrder,
        Model: state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] || "",
        日期: getTodayDateText()
      };
      const exported = await exportWorkbookByApi({
        customer: "lunfei",
        sn_rows: snList,
        box_row: boxRow,
        file_name: getActiveCustomerExportFilename()
      });
      triggerBlobDownload(exported.blob, exported.filename);
      updateLunfeiStatus(`已完成匯出：${exported.filename}（SN ${snList.length} 筆）`);
      await performLunfeiSearch();
    } catch (error) {
      updateLunfeiStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
    }
    return;
  }

  if (getActiveCustomerKey() === "bng") {
    if (!state.currentRow) {
      updateBngStatus("請先查詢 MO 後再生成。", true);
      return;
    }
    try {
      const workOrder = String(
        state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] ?? ""
      ).trim();
      const mo = String(
        state.currentRow[resolveColumnKey(state.currentRow, "MO") || CONFIG.COLUMNS.MO] ?? ""
      ).trim();
      const model = String(state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] ?? "");
      const systronPn = getRowValueByHeaderCandidates(state.currentRow, ["Model", "MODEL"]) || model;
      const partNo = String(state.currentRow[resolveColumnKey(state.currentRow, "PART_NO") || CONFIG.COLUMNS.PART_NO] ?? "");
      const qty = Number(state.currentRow[resolveColumnKey(state.currentRow, "QTY") || CONFIG.COLUMNS.QTY] ?? 0);
      const macRange = String(state.currentRow[resolveColumnKey(state.currentRow, "MAC_RANGE") || CONFIG.COLUMNS.MAC_RANGE] ?? "");
      const macQty = Number(state.currentRow[resolveColumnKey(state.currentRow, "MAC_QTY") || CONFIG.COLUMNS.MAC_QTY] ?? 0);
      const snRange = String(state.currentRow[resolveColumnKey(state.currentRow, "SN_RANGE") || CONFIG.COLUMNS.SN_RANGE] ?? "");
      const uuidRange = String(state.currentRow[resolveColumnKey(state.currentRow, "UUID_RANGE") || CONFIG.COLUMNS.UUID_RANGE] ?? "");
      const bios = String(state.currentRow[resolveColumnKey(state.currentRow, "BIOS") || CONFIG.COLUMNS.BIOS] ?? "");
      const fw = String(state.currentRow[resolveColumnKey(state.currentRow, "FW") || CONFIG.COLUMNS.FW] ?? "");
      const dateText = getTodayDateText();

      const bundle = generateBngSerialBundle({
        workOrder,
        model,
        systronPn,
        partNo,
        qty,
        macRange,
        macQty,
        snRange,
        uuidRange,
        bios,
        fw,
        dateText
      });
      state.generatedSNList = bundle.snRows;
      await generateSnByApi({
        customer: "bng",
        key: mo,
        qty: bundle.generated.snList.length,
        provided_serials: bundle.generated.snList,
        record: buildHistoryRecord(mo)
      });
      const exported = await exportWorkbookByApi({
        customer: "bng",
        sn_rows: bundle.snRows,
        box_row: bundle.boxRecord,
        file_name: getActiveCustomerExportFilename()
      });
      triggerBlobDownload(exported.blob, exported.filename);
      updateBngStatus(
        `已完成匯出：${exported.filename}（SN ${bundle.generated.snList.length} 筆，MAC ${bundle.generated.macList.length} 筆）`
      );
      await performBngSearch();
    } catch (error) {
      updateBngStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
    }
    return;
  }

  if (getActiveCustomerKey() === "chg") {
    if (!state.currentRow) {
      updateChgStatus("請先查詢工單後再生成。", true);
      return;
    }
    try {
      const workOrder = String(
        state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] ?? ""
      ).trim();
      const mo = workOrder;
      const pn = String(state.currentRow[resolveColumnKey(state.currentRow, "PN") || CONFIG.COLUMNS.PN] ?? "");
      const fullPn = String(state.currentRow[resolveColumnKey(state.currentRow, "FULL_PN") || CONFIG.COLUMNS.FULL_PN] ?? "");
      const model = String(state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] ?? "");
      const po = String(state.currentRow[resolveColumnKey(state.currentRow, "PO") || CONFIG.COLUMNS.PO] ?? "");
      const boxQty = String(state.currentRow[resolveColumnKey(state.currentRow, "BOX_QTY") || CONFIG.COLUMNS.BOX_QTY] ?? "");
      const labelQty = Number(state.currentRow[resolveColumnKey(state.currentRow, "QTY") || CONFIG.COLUMNS.QTY] ?? 0);

      const bundle = generateChgExportBundle({
        workOrder,
        pn,
        fullPn,
        model,
        po,
        boxQty,
        labelQty
      });
      state.generatedSNList = bundle.snRows;
      const providedSerials = bundle.snRows.map((row) => String(row?.["工單"] ?? workOrder));
      await generateSnByApi({
        customer: "chg",
        key: workOrder,
        qty: bundle.generated.labelQty,
        provided_serials: providedSerials,
        record: buildHistoryRecord(workOrder)
      });
      const exported = await exportWorkbookByApi({
        customer: "chg",
        sn_rows: bundle.snRows,
        box_row: bundle.boxRecord,
        file_name: getActiveCustomerExportFilename()
      });
      triggerBlobDownload(exported.blob, exported.filename);
      updateChgStatus(`已完成匯出：${exported.filename}（標籤 ${bundle.generated.labelQty} 筆）`);
      await performChgSearch();
    } catch (error) {
      updateChgStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
    }
    return;
  }

  if (getActiveCustomerKey() === "hmg") {
    if (!state.currentRow) {
      updateHmgStatus("請先查詢 Model 後再匯出。", true);
      return;
    }
    try {
      const model = getHmgModelValue(state.currentRow);
      if (!model) {
        throw new Error("Model 為空白，無法匯出。");
      }
      const pn = String(
        state.currentRow[resolveColumnKey(state.currentRow, "PN") || CONFIG.COLUMNS.PN] ?? ""
      ).trim();
      const ean = String(
        state.currentRow[resolveColumnKey(state.currentRow, "EAN") || CONFIG.COLUMNS.EAN] ?? ""
      ).trim();
      const pcba = String(
        state.currentRow[resolveColumnKey(state.currentRow, "PCBA") || CONFIG.COLUMNS.PCBA] ?? ""
      ).trim();
      const exportRows = [{
        Model: model,
        PN: pn,
        "EAN Code": ean,
        PCBA: pcba
      }];
      state.generatedSNList = exportRows;
      await upsertHistoryByApi({
        customer: "hmg",
        key: model,
        increment: 1,
        record: buildHistoryRecord(model)
      });
      const exported = await exportWorkbookByApi({
        customer: "hmg",
        sn_rows: exportRows,
        file_name: getActiveCustomerExportFilename()
      });
      triggerBlobDownload(exported.blob, exported.filename);
      updateHmgStatus(`已完成匯出：${exported.filename}`);
      await performHmgSearch();
    } catch (error) {
      updateHmgStatus(`匯出失敗：${getSafeErrorMessage(error)}`, true);
    }
    return;
  }

  if (getActiveCustomerKey() === "clg") {
    try {
      const modelFromRow = state.currentRow
        ? String(state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] ?? "").trim()
        : "";
      const modelFromInput = String(ui.clgSearchInput?.value ?? "").trim();
      const model = modelFromRow || modelFromInput || "manual";
      const inputs = getClgInputValues();
      const count = Number(inputs.countText);
      const serials = buildClgSerialList({
        ...inputs,
        count
      });
      const fileName = getClgExportFileName();
      if (!fileName) {
        updateClgStatus("已取消匯出。", true);
        return;
      }
      const snRows = serials.map((sn) => ({ SN: sn }));
      state.generatedSNList = snRows;
      await generateSnByApi({
        customer: "clg",
        key: model,
        qty: serials.length,
        provided_serials: serials
      });
      const exported = await exportWorkbookByApi({
        customer: "clg",
        sn_rows: snRows,
        file_name: fileName
      });
      triggerBlobDownload(exported.blob, exported.filename);
      if (state.currentRow) {
        updateClgStatus(`已完成匯出：${exported.filename}（SN ${snRows.length} 筆）`);
        await performClgSearch();
      } else {
        refreshClgPlannedSerialPreview();
        updateClgStatus(`已完成匯出：${exported.filename}（SN ${snRows.length} 筆，手動模式）`);
      }
    } catch (error) {
      updateClgStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
    }
    return;
  }

  if (!state.currentRow) {
    updateStatus(ui, "請先查詢工單後再匯出。", true);
    return;
  }

  try {
    const workOrder = state.currentQuery || getCurrentWorkOrder();
    const purchaseOrder = getCurrentRowValue("PURCHASE_ORDER");
    const qty = getResolvedQty(state.currentRow, state.currentQuery);
    const pn = getCurrentRowValue("PN");
    const generated = await generateSnByApi({
      customer: "yingbang",
      key: workOrder,
      qty,
      purchase_order: purchaseOrder
    });
    const snList = (generated.sn_list || []).map((sn) => ({
      SN: String(sn ?? ""),
      Datecode: getDatecode(),
      PN: pn
    }));
    await upsertHistoryByApi({
      customer: "yingbang",
      key: workOrder,
      increment: 0,
      record: buildHistoryRecord(workOrder)
    });
    state.generatedSNList = snList;
    const exported = await exportWorkbookByApi({
      customer: "yingbang",
      sn_rows: snList,
      file_name: getActiveCustomerExportFilename()
    });
    triggerBlobDownload(exported.blob, exported.filename);
    updateStatus(ui, `已完成匯出：${exported.filename}（共 ${snList.length} 筆）`);

    const query = ui.searchInput.value.trim();
    if (query) {
      const matchedRows = findWorkOrderRows(state.yingbangRowData, query);
      if (matchedRows.length > 0) {
        state.currentRow = matchedRows[0];
        await refreshSearchPreview(query, matchedRows.length);
      }
    }
  } catch (error) {
    updateStatus(ui, `匯出失敗：${getSafeErrorMessage(error)}`, true);
  }
}

function initEvents() {
  ui.yingbangTab.addEventListener("click", () => switchCustomerTab("yingbang"));
  ui.lunfeiTab.addEventListener("click", () => switchCustomerTab("lunfei"));
  ui.bngTab.addEventListener("click", () => switchCustomerTab("bng"));
  ui.chgTab.addEventListener("click", () => switchCustomerTab("chg"));
  ui.hmgTab.addEventListener("click", () => switchCustomerTab("hmg"));
  ui.clgTab.addEventListener("click", () => switchCustomerTab("clg"));
  ui.loadBtn.addEventListener("click", loadTable);
  ui.lunfeiLoadBtn.addEventListener("click", async () => {
    switchCustomerTab("lunfei");
    await loadTable();
  });
  ui.lunfeiHistoryBtn.addEventListener("click", () => {
    switchCustomerTab("lunfei");
    openLunfeiSerialHistoryPanel();
  });
  ui.bngLoadBtn.addEventListener("click", async () => {
    switchCustomerTab("bng");
    await loadTable();
  });
  ui.bngHistoryBtn.addEventListener("click", () => {
    switchCustomerTab("bng");
    openBngSerialHistoryPanel();
  });
  ui.chgLoadBtn.addEventListener("click", async () => {
    switchCustomerTab("chg");
    await loadTable();
  });
  ui.chgHistoryBtn.addEventListener("click", () => {
    switchCustomerTab("chg");
    openChgSerialHistoryPanel();
  });
  ui.hmgLoadBtn.addEventListener("click", async () => {
    switchCustomerTab("hmg");
    await loadTable();
  });
  ui.hmgHistoryBtn.addEventListener("click", () => {
    switchCustomerTab("hmg");
    openHmgSerialHistoryPanel();
  });
  ui.clgLoadBtn.addEventListener("click", async () => {
    switchCustomerTab("clg");
    await loadTable();
  });
  ui.clgHistoryBtn.addEventListener("click", () => {
    switchCustomerTab("clg");
    openClgSerialHistoryPanel();
  });
  ui.historyBtn.addEventListener("click", openSerialHistoryPanel);
  ui.queryBtn.addEventListener("click", performSearch);
  ui.lunfeiQueryBtn.addEventListener("click", performLunfeiSearch);
  ui.bngQueryBtn.addEventListener("click", performBngSearch);
  ui.chgQueryBtn.addEventListener("click", performChgSearch);
  ui.hmgQueryBtn.addEventListener("click", performHmgSearch);
  ui.clgQueryBtn.addEventListener("click", performClgSearch);
  ui.exportBtn.addEventListener("click", onExportClick);
  ui.lunfeiExportBtn.addEventListener("click", onExportClick);
  ui.bngExportBtn.addEventListener("click", onExportClick);
  ui.chgExportBtn.addEventListener("click", onExportClick);
  ui.hmgExportBtn.addEventListener("click", onExportClick);
  ui.clgExportBtn.addEventListener("click", onExportClick);
  ui.bngPrintBtn.addEventListener("click", onBngPrintReceiptClick);
  ui.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performSearch();
    }
  });
  ui.lunfeiSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performLunfeiSearch();
    }
  });
  ui.bngSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performBngSearch();
    }
  });
  ui.chgSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performChgSearch();
    }
  });
  ui.hmgSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performHmgSearch();
    }
  });
  ui.hmgSearchInput.addEventListener("input", onHmgSearchInputChange);
  if (ui.hmgSuggestPanel) {
    ui.hmgSuggestPanel.addEventListener("click", onHmgSuggestOptionClick);
  }
  ui.clgSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      performClgSearch();
    }
  });
  ui.clgSearchInput.addEventListener("input", onClgSearchInputChange);
  if (ui.clgSuggestPanel) {
    ui.clgSuggestPanel.addEventListener("click", onClgSuggestOptionClick);
  }
  ui.clgPrefixInput.addEventListener("input", onClgSerialSettingsChange);
  ui.clgStartInput.addEventListener("input", onClgSerialSettingsChange);
  ui.clgCountInput.addEventListener("input", onClgSerialSettingsChange);
  ui.clgSuffixInput.addEventListener("input", onClgSerialSettingsChange);
  ui.clgBaseSelect.addEventListener("change", onClgSerialSettingsChange);
  ui.fileInput.addEventListener("change", onFileSelected);
  ui.lunfeiFileInput.addEventListener("change", onLunfeiFileSelected);
  ui.bngFileInput.addEventListener("change", onBngFileSelected);
  ui.chgFileInput.addEventListener("change", onChgFileSelected);
  ui.hmgFileInput.addEventListener("change", onHmgFileSelected);
  ui.clgFileInput.addEventListener("change", onClgFileSelected);
  document.addEventListener("click", onUsageHelpClick);
}

async function main() {
  updateStatus(ui, "骨架初始化完成。");
  hydrateEditableCustomerCustomTabs();
  updateTabUi();
  applyCustomerProfileUi();
  initEvents();
  setSearchEnabled(false);
  setExportEnabled(false);
}

main();
