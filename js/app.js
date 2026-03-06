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
  exportLunfeiExcel,
  generateSNList,
  generateLunfeiSNList,
  buildPreviewSN,
  getDatecode,
  getCurrentWeekNumber2Digits,
  getLunfeiWeekKey,
  buildLunfeiSN,
  getTodayDateText
} from "./modules/excel.js";
import {
  findWorkOrderRows,
  findRowsByColumnCode,
  resolveColumnKey,
  resolveWorkOrderQty,
  resolveQtyByPairedSlash
} from "./modules/workOrder.js";
import { HistoryModule } from "./modules/storage.js";
import { supportsSourceBinding, getBoundFile, pickAndBindFile } from "./modules/sourceBinding.js";
import {
  updateStatus,
  renderLoadResult,
  renderSearchNotFound,
  renderSearchSuccess,
  renderLunfeiSearchNotFound,
  renderLunfeiSearchSuccess,
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
  ui.bindBtn.disabled = isLoading;
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
  ui.lunfeiBindBtn.disabled = isLoading;
  ui.lunfeiLoadBtn.disabled = isLoading;
  ui.lunfeiSearchInput.disabled = isLoading || state.lunfeiRowData.length === 0;
  ui.lunfeiQueryBtn.disabled = isLoading || state.lunfeiRowData.length === 0;
  ui.lunfeiExportBtn.disabled = true;
  if (message) {
    updateLunfeiStatus(message, false, isLoading);
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
  ui.previewPanel.innerHTML = `
    <h2>預覽窗格</h2>
    <p>請先讀取 Excel，並輸入工單號後點擊「查詢/刷新」。</p>
  `;
  setSearchEnabled(false);
  setExportEnabled(false);
  ui.lunfeiSearchInput.disabled = state.lunfeiRowData.length === 0;
  ui.lunfeiQueryBtn.disabled = state.lunfeiRowData.length === 0;
  ui.lunfeiExportBtn.disabled = true;
}

function updateTabUi() {
  const active = getActiveCustomerKey();
  const yingbangActive = active === "yingbang";
  ui.yingbangTab.classList.toggle("active", yingbangActive);
  ui.lunfeiTab.classList.toggle("active", !yingbangActive);
  ui.yingbangWorkspace.hidden = !yingbangActive;
  ui.lunfeiWorkspace.hidden = yingbangActive;
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
  if (key === "yingbang") {
    resetDataForCustomerSwitch();
    updateStatus(ui, `已切換客戶：${getActiveCustomerProfile().label}`);
    return;
  }
  updateLunfeiStatus(`已切換客戶：${getActiveCustomerProfile().label}`);
}

function getCurrentRowValue(columnCode) {
  if (!state.currentRow) {
    return "";
  }
  const key = resolveColumnKey(state.currentRow, columnCode) || CONFIG.COLUMNS[columnCode];
  return String(state.currentRow[key] ?? "").trim();
}

function onCopyError() {
  if (getActiveCustomerKey() === "lunfei") {
    updateLunfeiStatus("複製失敗：瀏覽器不允許剪貼簿存取。", true);
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
  return `${yyyy}-${mm}-${dd}-${workOrder}`;
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
    updateLunfeiStatus("請先讀取倫飛 Excel 檔案再查詢。", true);
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

function performSearch() {
  if (getActiveCustomerKey() !== "yingbang") {
    performLunfeiSearch();
    return;
  }

  if (state.yingbangRowData.length === 0) {
    updateStatus(ui, "請先讀取 Excel 檔案再查詢。", true);
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

async function bindSourceFile() {
  if (getActiveCustomerKey() !== "yingbang") {
    // lunfei binding uses same shared flow
  }

  if (!supportsSourceBinding()) {
    updateStatus(ui, "目前瀏覽器環境不支援來源綁定，請改用「讀取表格」。", true);
    return;
  }

  try {
    const pickedFile = await pickAndBindFile();
    if (pickedFile) {
      updateStatus(ui, `來源檔已綁定：${pickedFile.name}`);
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
    updateStatus(ui, `綁定來源失敗：${error.message || error}`, true);
  }
}

async function loadTable() {
  if (!supportsSourceBinding()) {
    if (getActiveCustomerKey() === "lunfei") {
      ui.lunfeiFileInput.click();
    } else {
      ui.fileInput.click();
    }
    return;
  }

  try {
    const boundFile = await getBoundFile();
    if (boundFile) {
      await processExcelFile(boundFile);
      return;
    }
    if (getActiveCustomerKey() === "lunfei") {
      ui.lunfeiFileInput.click();
    } else {
      ui.fileInput.click();
    }
  } catch (error) {
    if (error?.name === "AbortError") {
      return;
    }
    if (getActiveCustomerKey() === "lunfei") {
      ui.lunfeiFileInput.click();
    } else {
      ui.fileInput.click();
    }
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
      const snList = generateLunfeiSNList(mo, qty);
      state.generatedSNList = snList;
      const boxRecord = {
        pn: state.currentRow[resolveColumnKey(state.currentRow, "PN") || CONFIG.COLUMNS.PN] || "",
        processWo: state.currentRow[resolveColumnKey(state.currentRow, "PROCESS_WO") || CONFIG.COLUMNS.PROCESS_WO] || "",
        pcba: state.currentRow[resolveColumnKey(state.currentRow, "PCBA") || CONFIG.COLUMNS.PCBA] || "",
        workOrder: state.currentRow[resolveColumnKey(state.currentRow, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] || "",
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
  ui.bindBtn.addEventListener("click", bindSourceFile);
  ui.loadBtn.addEventListener("click", loadTable);
  ui.lunfeiBindBtn.addEventListener("click", async () => {
    switchCustomerTab("lunfei");
    await bindSourceFile();
  });
  ui.lunfeiLoadBtn.addEventListener("click", async () => {
    switchCustomerTab("lunfei");
    await loadTable();
  });
  ui.lunfeiHistoryBtn.addEventListener("click", () => {
    switchCustomerTab("lunfei");
    openLunfeiSerialHistoryPanel();
  });
  ui.historyBtn.addEventListener("click", openSerialHistoryPanel);
  ui.queryBtn.addEventListener("click", performSearch);
  ui.lunfeiQueryBtn.addEventListener("click", performLunfeiSearch);
  ui.exportBtn.addEventListener("click", onExportClick);
  ui.lunfeiExportBtn.addEventListener("click", onExportClick);
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
  ui.fileInput.addEventListener("change", onFileSelected);
  ui.lunfeiFileInput.addEventListener("change", onLunfeiFileSelected);
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
