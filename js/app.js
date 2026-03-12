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
import { normalizeRangeText } from "./modules/utils.js";
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
  renderSerialHistoryTableIn,
  bindPreviewTabs,
  bindPreviewTabsIn,
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
  chg: { sheetName: "KOYA出貨", parseRules: ["trim"] }
};

function getSharedParseTargets() {
  return Object.entries(SHARED_PARSE_FALLBACKS).map(([customerKey, fallback]) => {
    const profile = window.CUSTOMERS?.[customerKey] || {};
    const parseRules = Array.isArray(profile.parseRules) && profile.parseRules.length > 0
      ? profile.parseRules
      : fallback.parseRules;
    return {
      customer: customerKey,
      sheetName: String(profile.sheetName ?? fallback.sheetName).trim(),
      parseRules
    };
  });
}

function getSafeErrorMessage(error) {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return "發生未知錯誤";
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
  if (message) {
    updateBngStatus(message, false, isLoading);
  }
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

function setAllCustomerLoading(isLoading, message = "") {
  setLoading(isLoading, message);
  setLunfeiLoading(isLoading, message);
  setBngLoading(isLoading, message);
  setChgLoading(isLoading, message);
}

function applyCustomerProfileUi() {
  const profile = getActiveCustomerProfile();
  if (getActiveCustomerKey() === "yingbang") {
    ui.sourceHint.textContent = profile.sourceHint;
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
  ui.chgSearchInput.disabled = state.chgRowData.length === 0;
  ui.chgQueryBtn.disabled = state.chgRowData.length === 0;
  ui.chgExportBtn.disabled = true;
}

function updateTabUi() {
  const active = getActiveCustomerKey();
  ui.yingbangTab.classList.toggle("active", active === "yingbang");
  ui.lunfeiTab.classList.toggle("active", active === "lunfei");
  ui.bngTab.classList.toggle("active", active === "bng");
  ui.chgTab.classList.toggle("active", active === "chg");
  ui.yingbangWorkspace.hidden = active !== "yingbang";
  ui.lunfeiWorkspace.hidden = active !== "lunfei";
  ui.bngWorkspace.hidden = active !== "bng";
  ui.chgWorkspace.hidden = active !== "chg";
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
  updateChgStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
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
  updateStatus(ui, "複製失敗：瀏覽器不允許剪貼簿存取。", true);
}

function getCurrentWorkOrder() {
  return getCurrentRowValue("WORK_ORDER");
}

function getResolvedQty(row, query) {
  const rawQty = row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY];
  return resolveWorkOrderQty(row, query, rawQty);
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
    ui.bngExportBtn.disabled = false;
    updateBngStatus(`查詢成功：MO ${query}（命中 ${matchedRows.length} 筆）`);
  } catch (error) {
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
    ui.chgExportBtn.disabled = false;
    updateChgStatus(`查詢成功：工單 ${query}（命中 ${matchedRows.length} 筆）`);
  } catch (error) {
    updateChgStatus(`歷史載入失敗：${getSafeErrorMessage(error)}`, true);
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

async function processExcelFile(file) {
  if (!file) {
    return;
  }
  setAllCustomerLoading(true, `讀取中：${file.name}（同步解析所有客戶）...`);
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

async function onFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processExcelFile(file);
  } finally {
    ui.fileInput.value = "";
  }
}

async function onLunfeiFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processExcelFile(file);
  } finally {
    ui.lunfeiFileInput.value = "";
  }
}

async function onBngFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processExcelFile(file);
  } finally {
    ui.bngFileInput.value = "";
  }
}

async function onChgFileSelected(event) {
  const file = event.target.files && event.target.files[0];
  try {
    await processExcelFile(file);
  } finally {
    ui.chgFileInput.value = "";
  }
}

async function loadTable() {
  if (getActiveCustomerKey() === "lunfei") {
    ui.lunfeiFileInput.click();
  } else if (getActiveCustomerKey() === "bng") {
    ui.bngFileInput.click();
  } else if (getActiveCustomerKey() === "chg") {
    ui.chgFileInput.click();
  } else {
    ui.fileInput.click();
  }
}

function getActiveCustomerExportFilename() {
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
  ui.historyBtn.addEventListener("click", openSerialHistoryPanel);
  ui.queryBtn.addEventListener("click", performSearch);
  ui.lunfeiQueryBtn.addEventListener("click", performLunfeiSearch);
  ui.bngQueryBtn.addEventListener("click", performBngSearch);
  ui.chgQueryBtn.addEventListener("click", performChgSearch);
  ui.exportBtn.addEventListener("click", onExportClick);
  ui.lunfeiExportBtn.addEventListener("click", onExportClick);
  ui.bngExportBtn.addEventListener("click", onExportClick);
  ui.chgExportBtn.addEventListener("click", onExportClick);
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
  ui.fileInput.addEventListener("change", onFileSelected);
  ui.lunfeiFileInput.addEventListener("change", onLunfeiFileSelected);
  ui.bngFileInput.addEventListener("change", onBngFileSelected);
  ui.chgFileInput.addEventListener("change", onChgFileSelected);
}

async function main() {
  updateStatus(ui, "骨架初始化完成。");
  updateTabUi();
  applyCustomerProfileUi();
  initEvents();
  setSearchEnabled(false);
  setExportEnabled(false);
}

main();
