import {
  CONFIG,
  getActiveCustomerKey,
  getActiveCustomerProfile,
  setActiveCustomerKey
} from "./config.js";
import { state, createUiRefs } from "./state.js";
import {
  verifyDependencies,
  loadExcel,
  exportExcel,
  exportBngExcel,
  exportChgExcel,
  exportLunfeiExcel,
  generateSNList,
  generateLunfeiSNList,
  buildPreviewSN,
  getDatecode,
  getCurrentWeekNumber2Digits,
  getLunfeiWeekKey,
  buildLunfeiSN,
  getTodayDateText,
  generateBngSerialBundle,
  generateChgExportBundle
} from "./modules/excel.js";
import {
  findWorkOrderRows,
  findRowsByColumnCode,
  resolveColumnKey,
  resolveWorkOrderQty,
  resolveQtyByPairedSlash
} from "./modules/workOrder.js";
import { HistoryModule } from "./modules/storage.js";
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
  renderSerialHistoryTable,
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
    <p>請先上傳 Excel，並輸入工單號後點擊「解析工單」。</p>
  `;
  setSearchEnabled(false);
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

function refreshSearchPreview(query, matchCount) {
  if (!state.currentRow) {
    return;
  }
  const workOrder = query;
  const purchaseOrder = getCurrentRowValue("PURCHASE_ORDER");
  const resolvedQty = getResolvedQty(state.currentRow, query);
  renderSearchSuccess(ui, {
    row: state.currentRow,
    query,
    matchCount,
    rowData: state.yingbangRowData,
    resolveColumnKey,
    previewSN: buildPreviewSN(workOrder, purchaseOrder),
    datecode: getDatecode(),
    resolvedQty,
    workOrderHistory: HistoryModule.getWorkOrderHistory(workOrder)
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

function onClearHistoryClick() {
  const workOrder = String(state.currentQuery ?? "").trim();
  const purchaseOrder = getCurrentRowValue("PURCHASE_ORDER");
  if (!workOrder) {
    updateStatus(ui, "目前沒有可清空的工單歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空工單 ${workOrder} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  HistoryModule.clearWorkOrderHistory(workOrder, purchaseOrder);
  updateStatus(ui, `已清空工單 ${workOrder} 的歷史序號。`);
  refreshSearchPreview(workOrder, 1);
}

function onLunfeiClearHistoryClick() {
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
  HistoryModule.clearWorkOrderHistory(mo, weekKey);
  updateLunfeiStatus(`已清空 MO ${mo} 的歷史序號。`);
  performLunfeiSearch();
}

function onBngClearHistoryClick() {
  const workOrder = String(state.currentQuery ?? "").trim();
  if (!workOrder) {
    updateBngStatus("目前沒有可清空的工單歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空工單 ${workOrder} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  HistoryModule.clearWorkOrderHistory(workOrder, workOrder);
  updateBngStatus(`已清空工單 ${workOrder} 的歷史序號。`);
  performBngSearch();
}

function onChgClearHistoryClick() {
  const workOrder = String(state.currentQuery ?? "").trim();
  if (!workOrder) {
    updateChgStatus("目前沒有可清空的工單歷史。", true);
    return;
  }
  const confirmed = window.confirm(`確定清空工單 ${workOrder} 的歷史序號？`);
  if (!confirmed) {
    return;
  }
  HistoryModule.clearWorkOrderHistory(workOrder, workOrder);
  updateChgStatus(`已清空工單 ${workOrder} 的歷史序號。`);
  performChgSearch();
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

function getLunfeiPreviewSN(row) {
  const weekKey = getLunfeiWeekKey();
  const lastSerial = HistoryModule.getLastSerial(weekKey);
  const nextSerial = lastSerial + 1;
  const weekNum2 = getCurrentWeekNumber2Digits();
  const preview = buildLunfeiSN(weekNum2, nextSerial);
  if (!preview) {
    return "";
  }
  return preview;
}

function performLunfeiSearch() {
  if (state.lunfeiRowData.length === 0) {
    updateLunfeiStatus("請先上傳倫飛 Excel 檔案再查詢。", true);
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
  const resolvedQty = resolveQtyByPairedSlash(state.currentRow, query, "MO", "QTY");
  const generationHistory = HistoryModule.getWorkOrderHistory(query);
  renderLunfeiSearchSuccess(ui, {
    row: state.currentRow,
    query,
    matchCount: matchedRows.length,
    resolveColumnKey,
    previewSN: getLunfeiPreviewSN(state.currentRow),
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
}

function performBngSearch() {
  if (state.bngRowData.length === 0) {
    updateBngStatus("請先上傳超恩 Excel 檔案再查詢。", true);
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
  const workOrder = String(
    state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] ?? ""
  ).trim();
  state.currentQuery = workOrder;
  const generationHistory = HistoryModule.getWorkOrderHistory(workOrder);
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
}

function performChgSearch() {
  if (state.chgRowData.length === 0) {
    updateChgStatus("請先上傳 KOYA Excel 檔案再查詢。", true);
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
  const generationHistory = HistoryModule.getWorkOrderHistory(workOrder);
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
}

function openSerialHistoryPanel() {
  const entries = HistoryModule.getSerialHistoryEntries();
  ui.historyPanel.hidden = false;
  renderSerialHistoryTableIn(ui.historyPanel, entries, "採單號碼");
  bindHistoryResetButtons(ui, onResetSerialHistoryKey);
}

function openLunfeiSerialHistoryPanel() {
  const entries = HistoryModule.getSerialHistoryEntries();
  ui.lunfeiHistoryPanel.hidden = false;
  renderSerialHistoryTableIn(ui.lunfeiHistoryPanel, entries, "週別 key");
  bindHistoryResetButtonsIn(ui.lunfeiHistoryPanel, onLunfeiResetSerialHistoryKey);
}

function openBngSerialHistoryPanel() {
  const entries = HistoryModule.getSerialHistoryEntries();
  ui.bngHistoryPanel.hidden = false;
  renderSerialHistoryTableIn(ui.bngHistoryPanel, entries, "工單");
  bindHistoryResetButtonsIn(ui.bngHistoryPanel, onBngResetSerialHistoryKey);
}

function openChgSerialHistoryPanel() {
  const entries = HistoryModule.getSerialHistoryEntries();
  ui.chgHistoryPanel.hidden = false;
  renderSerialHistoryTableIn(ui.chgHistoryPanel, entries, "工單");
  bindHistoryResetButtonsIn(ui.chgHistoryPanel, onChgResetSerialHistoryKey);
}

function onResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  const success = HistoryModule.resetSerialHistoryKey(key);
  if (success) {
    updateStatus(ui, `已重置 ${key} 的流水號歷史。`);
  } else {
    updateStatus(ui, `找不到 ${key} 的歷史資料。`, true);
  }
  openSerialHistoryPanel();
}

function onLunfeiResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  const success = HistoryModule.resetSerialHistoryKey(key);
  if (success) {
    updateLunfeiStatus(`已重置 ${key} 的流水號歷史。`);
  } else {
    updateLunfeiStatus(`找不到 ${key} 的歷史資料。`, true);
  }
  openLunfeiSerialHistoryPanel();
}

function onBngResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  const success = HistoryModule.resetSerialHistoryKey(key);
  if (success) {
    updateBngStatus(`已重置 ${key} 的流水號歷史。`);
  } else {
    updateBngStatus(`找不到 ${key} 的歷史資料。`, true);
  }
  openBngSerialHistoryPanel();
}

function onChgResetSerialHistoryKey(historyKey) {
  const key = String(historyKey ?? "").trim();
  if (!key) {
    return;
  }
  const confirmed = window.confirm(`確定重置 ${key} 的流水號歷史？`);
  if (!confirmed) {
    return;
  }
  const success = HistoryModule.resetSerialHistoryKey(key);
  if (success) {
    updateChgStatus(`已重置 ${key} 的流水號歷史。`);
  } else {
    updateChgStatus(`找不到 ${key} 的歷史資料。`, true);
  }
  openChgSerialHistoryPanel();
}

function performSearch() {
  if (getActiveCustomerKey() === "lunfei") {
    performLunfeiSearch();
    return;
  }
  if (getActiveCustomerKey() === "bng") {
    performBngSearch();
    return;
  }
  if (getActiveCustomerKey() === "chg") {
    performChgSearch();
    return;
  }

  if (state.yingbangRowData.length === 0) {
    updateStatus(ui, "請先上傳 Excel 檔案再查詢。", true);
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
  refreshSearchPreview(query, matchedRows.length);
  updateStatus(ui, `查詢成功：${query}（命中 ${matchedRows.length} 筆）`);
}

async function processExcelFile(file) {
  if (!file) {
    return;
  }

  if (getActiveCustomerKey() === "lunfei") {
    setLunfeiLoading(true, `讀取中：${file.name} ...`);
    try {
      const rows = await loadExcel(file);
      state.lunfeiRowData = rows;
      state.currentRow = null;
      state.currentQuery = "";
      state.generatedSNList = [];
      ui.lunfeiPreviewPanel.innerHTML = `
        <h2>倫飛預覽窗格</h2>
        <p>來源檔案：${file.name}</p>
        <p>已載入倫飛出貨 ${rows.length} 筆資料。</p>
      `;
      ui.lunfeiHistoryPanel.hidden = true;
      updateLunfeiStatus(`已載入倫飛出貨 ${rows.length} 筆資料。`);
      ui.lunfeiSearchInput.disabled = rows.length === 0;
      ui.lunfeiQueryBtn.disabled = rows.length === 0;
      ui.lunfeiExportBtn.disabled = true;
    } catch (error) {
      state.lunfeiRowData = [];
      state.currentRow = null;
      state.currentQuery = "";
      state.generatedSNList = [];
      updateLunfeiStatus(`讀取失敗：${error.message}`, true);
      ui.lunfeiPreviewPanel.innerHTML = `
        <h2>倫飛預覽窗格</h2>
        <div class="error-box">讀取倫飛 Excel 失敗：${error.message}</div>
      `;
    } finally {
      setLunfeiLoading(false);
    }
    return;
  }

  if (getActiveCustomerKey() === "bng") {
    setBngLoading(true, `讀取中：${file.name} ...`);
    try {
      const rows = await loadExcel(file);
      state.bngRowData = rows;
      state.currentRow = null;
      state.currentQuery = "";
      state.generatedSNList = [];
      ui.bngPreviewPanel.innerHTML = `
        <h2>超恩預覽窗格</h2>
        <p>來源檔案：${file.name}</p>
        <p>已載入超恩出貨 ${rows.length} 筆資料。</p>
      `;
      ui.bngHistoryPanel.hidden = true;
      updateBngStatus(`已載入超恩出貨 ${rows.length} 筆資料。`);
      ui.bngSearchInput.disabled = rows.length === 0;
      ui.bngQueryBtn.disabled = rows.length === 0;
      ui.bngExportBtn.disabled = true;
    } catch (error) {
      state.bngRowData = [];
      state.currentRow = null;
      state.currentQuery = "";
      state.generatedSNList = [];
      updateBngStatus(`讀取失敗：${error.message}`, true);
      ui.bngPreviewPanel.innerHTML = `
        <h2>超恩預覽窗格</h2>
        <div class="error-box">讀取超恩 Excel 失敗：${error.message}</div>
      `;
    } finally {
      setBngLoading(false);
    }
    return;
  }

  if (getActiveCustomerKey() === "chg") {
    setChgLoading(true, `讀取中：${file.name} ...`);
    try {
      const rows = await loadExcel(file);
      state.chgRowData = rows;
      state.currentRow = null;
      state.currentQuery = "";
      state.generatedSNList = [];
      ui.chgPreviewPanel.innerHTML = `
        <h2>KOYA 預覽窗格</h2>
        <p>來源檔案：${file.name}</p>
        <p>已載入 KOYA 出貨 ${rows.length} 筆資料。</p>
      `;
      ui.chgHistoryPanel.hidden = true;
      updateChgStatus(`已載入 KOYA 出貨 ${rows.length} 筆資料。`);
      ui.chgSearchInput.disabled = rows.length === 0;
      ui.chgQueryBtn.disabled = rows.length === 0;
      ui.chgExportBtn.disabled = true;
    } catch (error) {
      state.chgRowData = [];
      state.currentRow = null;
      state.currentQuery = "";
      state.generatedSNList = [];
      updateChgStatus(`讀取失敗：${error.message}`, true);
      ui.chgPreviewPanel.innerHTML = `
        <h2>KOYA 預覽窗格</h2>
        <div class="error-box">讀取 KOYA Excel 失敗：${error.message}</div>
      `;
    } finally {
      setChgLoading(false);
    }
    return;
  }

  setLoading(true, `讀取中：${file.name} ...`);
  try {
    const rows = await loadExcel(file);
    state.yingbangRowData = rows;
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    renderLoadResult(ui, rows, file.name);
    setSearchEnabled(rows.length > 0);
    setExportEnabled(false);
    updateStatus(ui, `讀取完成：共 ${rows.length} 筆資料。`);
  } catch (error) {
    state.yingbangRowData = [];
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];
    setSearchEnabled(false);
    setExportEnabled(false);
    updateStatus(ui, `讀取失敗：${error.message}`, true);
    ui.previewPanel.innerHTML = `
      <h2>預覽窗格</h2>
      <div class="error-box">讀取 Excel 失敗：${error.message}</div>
    `;
  } finally {
    setLoading(false);
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

function onExportClick() {
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
      const workOrder = String(
        state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] ?? ""
      ).trim();
      const snList = generateLunfeiSNList(mo, qty);
      state.generatedSNList = snList;
      HistoryModule.appendWorkOrderHistory(mo, buildHistoryRecord(workOrder || mo));
      const boxRecord = {
        pn: state.currentRow[resolveColumnKey(state.currentRow, "PN") || CONFIG.COLUMNS.PN] || "",
        processWo: state.currentRow[resolveColumnKey(state.currentRow, "PROCESS_WO") || CONFIG.COLUMNS.PROCESS_WO] || "",
        pcba: state.currentRow[resolveColumnKey(state.currentRow, "PCBA") || CONFIG.COLUMNS.PCBA] || "",
        workOrder: workOrder,
        model: state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] || "",
        dateText: getTodayDateText()
      };
      const filename = exportLunfeiExcel(snList, boxRecord, mo);
      updateLunfeiStatus(`已完成匯出：${filename}（SN ${snList.length} 筆）`);
    } catch (error) {
      updateLunfeiStatus(`生成失敗：${error.message}`, true);
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
      HistoryModule.updateHistory(workOrder, bundle.generated.snList.length);
      HistoryModule.appendWorkOrderHistory(workOrder, buildHistoryRecord(workOrder));
      const filename = exportBngExcel(bundle, workOrder || mo);
      updateBngStatus(
        `已完成匯出：${filename}（SN ${bundle.generated.snList.length} 筆，MAC ${bundle.generated.macList.length} 筆）`
      );
      performBngSearch();
    } catch (error) {
      updateBngStatus(`生成失敗：${error.message}`, true);
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
      HistoryModule.updateHistory(workOrder, bundle.generated.labelQty);
      HistoryModule.appendWorkOrderHistory(workOrder, buildHistoryRecord(workOrder));
      const filename = exportChgExcel(bundle, workOrder || mo);
      updateChgStatus(`已完成匯出：${filename}（標籤 ${bundle.generated.labelQty} 筆）`);
      performChgSearch();
    } catch (error) {
      updateChgStatus(`生成失敗：${error.message}`, true);
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
    const snList = generateSNList({
      qty,
      workOrder,
      purchaseOrder,
      pn
    });
    HistoryModule.appendWorkOrderHistory(workOrder, buildHistoryRecord(workOrder));
    state.generatedSNList = snList;
    const filename = exportExcel(snList, state.currentQuery || workOrder);
    updateStatus(ui, `已完成匯出：${filename}（共 ${snList.length} 筆）`);

    const query = ui.searchInput.value.trim();
    if (query) {
      const matchedRows = findWorkOrderRows(state.yingbangRowData, query);
      if (matchedRows.length > 0) {
        state.currentRow = matchedRows[0];
        refreshSearchPreview(query, matchedRows.length);
      }
    }
  } catch (error) {
    updateStatus(ui, `匯出失敗：${error.message}`, true);
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
  if (!verifyDependencies()) {
    updateStatus(ui, "CDN 載入失敗，請確認網路與瀏覽器安全性設定。", true);
    return;
  }

  HistoryModule.migrateLegacyYingbangKeys();
  updateStatus(ui, "骨架初始化完成，CDN 載入成功。");
  updateTabUi();
  applyCustomerProfileUi();
  initEvents();
  setSearchEnabled(false);
  setExportEnabled(false);
}

main();
