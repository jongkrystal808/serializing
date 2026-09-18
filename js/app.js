import {
  CONFIG,
  getActiveCustomerKey,
  getActiveCustomerProfile,
  setActiveCustomerKey
} from "./config.js";
import { state, createUiRefs } from "./state.js?v=0.3.70";
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
  loadDefaultExcelByApi,
  loadSourceExcelByApi,
  generateSnByApi,
  getHistoryByApi,
  upsertHistoryByApi,
  resetHistoryByApi,
  exportWorkbookByApi,
  getPrintNoticesByApi,
  upsertPrintNoticeByApi,
  deletePrintNoticeByApi,
  getShipmentSourcesByApi
} from "./modules/api.js?v=0.3.70";
import {
  findWorkOrderRows,
  findRowsByColumnCode,
  resolveColumnKey,
  resolveWorkOrderQty,
  resolveQtyByPairedSlash
} from "./modules/workOrder.js";
import { escapeHtml, normalizeRangeText, normalizeText } from "./modules/utils.js";
import { createHomeController } from "./modules/homeController.js?v=0.3.76";
import { findDegWorkOrderRows, setDegGeneratorVisible } from "./modules/deg.js?v=0.3.68";
import { renderGenericSourceSearchSuccess, renderSheetContentPane } from "./modules/uiPreviewRenderers.js?v=0.3.78";
import { findSourceRows } from "./modules/sourceSearch.js?v=0.3.76";
import { createVecowLinkController } from "./modules/vecowLink.js?v=0.3.60";
import { createMasterDataMaintenance } from "./modules/masterDataMaintenance.js";
import { createSourceMaintenance } from "./modules/sourceMaintenance.js";
import { resolveCustomerColumnKey, getRowValueByCustomerColumnCode } from "./modules/customerColumns.js";
import {
  buildClgPlannedSerialPreview,
  buildClgSerialList,
  getClgInputValues
} from "./modules/serialSettings.js";
import {
  buildBngReceiptPrintPayload,
  renderBngReceiptPrintHtml
} from "./modules/bngReceipt.js";
import { createPreviewCustomTabsController } from "./modules/previewCustomTabs.js";
import { getCustomerRegistry } from "./modules/customers.js";
import { readStorageItem, setStorageErrorHandler, writeStorageItem } from "./modules/storage.js";
import { cloneChildrenInto, replaceChildrenFromTrustedTemplate } from "./modules/dom.js";
import { showToast } from "./modules/toast.js";
import { initFzgSerialGenerator } from "./modules/fzgSerial.js?v=0.3.79";
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
  bindHistoryResetButtonsIn,
  copyTextToClipboard
} from "./modules/ui.js";

const ui = createUiRefs();
const customers = getCustomerRegistry();
setStorageErrorHandler(({ message }) => updateHomeStatus(message, true));
const SHARED_PARSE_FALLBACKS = {
  yingbang: { sheetName: "營邦出貨", parseRules: ["arrow"] },
  lunfei: { sheetName: "倫飛出貨", parseRules: ["arrow"] },
  bng: { sheetName: "超恩出貨", parseRules: ["trim"] },
  chg: { sheetName: "KOYA出貨", parseRules: ["trim"] },
  hmg: { sheetName: "組測序號編碼", parseRules: ["trim"] },
  clg: { sheetName: "板階序號編碼", parseRules: ["none"] }
};
const PREVIEW_CUSTOM_TABS_STORAGE_KEY = "sn_preview_custom_tabs";
const THEME_STORAGE_KEY = "sn-color-theme";
const SHARED_CUSTOMER_KEYS = ["yingbang", "lunfei", "bng", "chg"];
const PRINTED_NOTICE_CUSTOMER_LABELS = {
  yingbang: "營邦",
  lunfei: "倫飛",
  bng: "超恩",
  chg: "KOYA"
};
const PRINT_NOTICE_BOARD_WINDOW_DAYS = 7;
const PRINT_HISTORY_WINDOW_WEEKS = 8;

function applyTheme(theme) {
  const nextTheme = ["light", "dark", "colorful"].includes(theme) ? theme : "dark";
  document.documentElement.dataset.theme = nextTheme;
  ui.themeSelect.value = nextTheme;
}

const USAGE_HELP_MESSAGES = {
  "customer-tabs": [
    "客戶頁籤使用方式：",
    "1. 先點選上方客戶頁籤切換當前作業客戶。",
    "2. 切換後，下方資料來源與查詢規則會跟著該客戶改變。",
    "3. 營邦/倫飛/超恩/KOYA 共用文檔；赫星與 Cubepilot 為獨立文檔。"
  ].join("\n"),
  "source-config": [
    "資料來源設定使用方式：",
    "1. 刷新頁面載入檔案。",
    "2. 狀態列會顯示載入結果。",
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
const homeRuntime = {
  customer: "",
  query: "",
  pendingModelCustomer: "",
  pendingModelRows: []
};
const setFzgSearchResult = initFzgSerialGenerator();
const previewCustomTabsController = createPreviewCustomTabsController({
  storageKey: PREVIEW_CUSTOM_TABS_STORAGE_KEY,
  getCustomers: () => customers,
  rerenderCustomerPreview,
  activatePreviewPane
});
const hydrateEditableCustomerCustomTabs = previewCustomTabsController.hydrate;
const onAddPreviewCustomTab = previewCustomTabsController.onAdd;
const onRemovePreviewCustomTab = previewCustomTabsController.onRemove;
const onEditPreviewCustomTab = previewCustomTabsController.onEdit;

function buildParseTarget(customerKey) {
  const fallback = SHARED_PARSE_FALLBACKS[customerKey] || {};
  const profile = customers[customerKey] || {};
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

function normalizePrintedNoticeEntry(entry) {
  if (!entry || typeof entry !== "object") {
    return null;
  }
  const customerKey = String(entry.customerKey ?? entry.customer ?? "").trim();
  const customerLabel = String(entry.customerLabel ?? entry.customer_label ?? "").trim();
  const workOrderLabel = String(entry.workOrderLabel ?? entry.workorder_label ?? "").trim();
  const workOrderValue = String(entry.workOrderValue ?? entry.workorder_value ?? "").trim();
  if (!customerKey || !customerLabel || !workOrderValue) {
    return null;
  }
  const createdAtValue = entry.createdAt ?? entry.created_at ?? "";
  const createdAtTimestamp = Date.parse(String(createdAtValue).trim());
  return {
    customerKey,
    customerLabel,
    workOrderLabel: workOrderLabel || "工單",
    workOrderValue,
    createdAt: Number.isFinite(createdAtTimestamp) ? createdAtTimestamp : Date.now()
  };
}

function buildPrintedNoticeKey(customerKey, workOrderValue) {
  return `${String(customerKey ?? "").trim()}::${String(workOrderValue ?? "").trim()}`;
}

function getPrintedNoticeEntries() {
  return (Array.isArray(state.printNoticeEntries) ? state.printNoticeEntries : [])
    .map((entry) => normalizePrintedNoticeEntry(entry))
    .filter(Boolean)
    .sort((a, b) => Number(b.createdAt) - Number(a.createdAt));
}

function getActivePrintedNoticeEntries() {
  const now = Date.now();
  const maxAge = PRINT_NOTICE_BOARD_WINDOW_DAYS * 24 * 60 * 60 * 1000;
  return getPrintedNoticeEntries().filter((entry) => now - Number(entry.createdAt) < maxAge);
}

function isPrintedNoticeChecked(customerKey, workOrderValue) {
  const entryKey = buildPrintedNoticeKey(customerKey, workOrderValue);
  return getPrintedNoticeEntries().some((entry) =>
    buildPrintedNoticeKey(entry.customerKey, entry.workOrderValue) === entryKey
  );
}

function upsertPrintedNoticeInState(entry) {
  const normalizedEntry = normalizePrintedNoticeEntry(entry);
  if (!normalizedEntry) {
    return;
  }
  const entryKey = buildPrintedNoticeKey(normalizedEntry.customerKey, normalizedEntry.workOrderValue);
  const nextEntries = getPrintedNoticeEntries()
    .filter((item) => buildPrintedNoticeKey(item.customerKey, item.workOrderValue) !== entryKey);
  nextEntries.unshift(normalizedEntry);
  state.printNoticeEntries = nextEntries;
}

function removePrintedNoticeInState(customerKey, workOrderValue) {
  const entryKey = buildPrintedNoticeKey(customerKey, workOrderValue);
  const nextEntries = getPrintedNoticeEntries()
    .filter((entry) => buildPrintedNoticeKey(entry.customerKey, entry.workOrderValue) !== entryKey);
  state.printNoticeEntries = nextEntries;
}

function renderHomePrintNoticeBoard() {
  if (!ui.homePrintNoticeList) {
    return;
  }
  const entries = getActivePrintedNoticeEntries();
  if (entries.length === 0) {
    replaceChildrenFromTrustedTemplate(
      ui.homePrintNoticeList,
      `<p class="home-print-notice-empty">目前沒有近 ${PRINT_NOTICE_BOARD_WINDOW_DAYS} 天已列印公告。</p>`
    );
    return;
  }
  const groups = buildPrintedNoticeGroups(entries);
  replaceChildrenFromTrustedTemplate(
    ui.homePrintNoticeList,
    groups.map((group, index) => `
      <details class="home-print-notice-group"${index === 0 ? " open" : ""}>
        <summary class="home-print-notice-group-summary">${escapeHtml(group.dateLabel)}</summary>
        <div class="home-print-notice-group-items">
          ${group.items.map((entry) => `
            <article class="home-print-notice-item" data-customer-key="${escapeHtml(entry.customerKey)}">
              <p class="home-print-notice-main">${escapeHtml(formatPrintedNoticeBoardItem(entry))}</p>
            </article>
          `).join("")}
        </div>
      </details>
    `).join("")
  );
}

function buildPrintedNoticeGroups(entries) {
  const groupMap = new Map();
  entries.forEach((entry) => {
    const dateLabel = formatPrintedNoticeDate(entry.createdAt);
    if (!groupMap.has(dateLabel)) {
      groupMap.set(dateLabel, {
        sortTimestamp: Number(entry.createdAt),
        items: []
      });
    }
    const group = groupMap.get(dateLabel);
    group.sortTimestamp = Math.max(Number(group.sortTimestamp), Number(entry.createdAt));
    group.items.push(entry);
  });
  return Array.from(groupMap.entries())
    .map(([dateLabel, group]) => ({
      dateLabel,
      sortTimestamp: Number(group.sortTimestamp),
      items: group.items.slice().sort((a, b) => Number(b.createdAt) - Number(a.createdAt))
    }))
    .sort((a, b) => Number(b.sortTimestamp) - Number(a.sortTimestamp));
}

function getWeekRangeLabel(timestamp) {
  const date = new Date(Number(timestamp));
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + diffToMonday);
  const weekEnd = new Date(weekStart);
  weekEnd.setDate(weekStart.getDate() + 6);
  const formatDate = (value) => {
    const yyyy = value.getFullYear();
    const mm = String(value.getMonth() + 1).padStart(2, "0");
    const dd = String(value.getDate()).padStart(2, "0");
    return `${yyyy}-${mm}-${dd}`;
  };
  return `${formatDate(weekStart)} ~ ${formatDate(weekEnd)}`;
}

function getWeekStartTimestamp(timestamp) {
  const date = new Date(Number(timestamp));
  const day = date.getDay();
  const diffToMonday = day === 0 ? -6 : 1 - day;
  const weekStart = new Date(date);
  weekStart.setHours(0, 0, 0, 0);
  weekStart.setDate(weekStart.getDate() + diffToMonday);
  return weekStart.getTime();
}

function getRecentPrintHistoryEntries() {
  const now = Date.now();
  const maxAge = PRINT_HISTORY_WINDOW_WEEKS * 7 * 24 * 60 * 60 * 1000;
  return getPrintedNoticeEntries().filter((entry) => now - Number(entry.createdAt) < maxAge);
}

function getFilteredPrintHistoryEntries() {
  const entries = getRecentPrintHistoryEntries();
  const filter = String(state.printHistoryCustomerFilter ?? "all").trim();
  if (!filter || filter === "all") {
    return entries;
  }
  return entries.filter((entry) => String(entry.customerKey ?? "").trim() === filter);
}

function getPrintHistoryCustomerOptions(entries) {
  const used = new Set();
  const options = [{
    value: "all",
    label: "全部客戶"
  }];
  entries.forEach((entry) => {
    const key = String(entry.customerKey ?? "").trim();
    if (!key || used.has(key)) {
      return;
    }
    used.add(key);
    options.push({
      value: key,
      label: PRINTED_NOTICE_CUSTOMER_LABELS[key] || entry.customerLabel || key
    });
  });
  return options;
}

function renderHomePrintHistoryPanel() {
  if (!ui.homePrintHistoryPanel) {
    return;
  }
  const recentEntries = getRecentPrintHistoryEntries();
  const entries = getFilteredPrintHistoryEntries();
  const filterOptions = getPrintHistoryCustomerOptions(recentEntries)
    .map((item) => `<option value="${escapeHtml(item.value)}"${item.value === state.printHistoryCustomerFilter ? " selected" : ""}>${escapeHtml(item.label)}</option>`)
    .join("");
  const toolbarHtml = `
    <div class="print-history-toolbar">
      <p class="print-history-summary">只顯示最近 ${PRINT_HISTORY_WINDOW_WEEKS} 週，共 ${entries.length} 筆。</p>
      <select id="home-print-history-customer-filter" aria-label="列印歷史客戶篩選">
        ${filterOptions}
      </select>
    </div>
  `;
  if (entries.length === 0) {
    replaceChildrenFromTrustedTemplate(ui.homePrintHistoryPanel, `
      <h2>列印歷史</h2>
      ${toolbarHtml}
      <div class="error-box">目前沒有符合條件的列印歷史。</div>
    `);
    return;
  }
  const groupMap = new Map();
  entries.forEach((entry) => {
    const weekStartTimestamp = getWeekStartTimestamp(entry.createdAt);
    const weekLabel = getWeekRangeLabel(entry.createdAt);
    const groupKey = `${weekStartTimestamp}::${weekLabel}`;
    if (!groupMap.has(groupKey)) {
      groupMap.set(groupKey, {
        weekStartTimestamp,
        weekLabel,
        items: []
      });
    }
    groupMap.get(groupKey).items.push(entry);
  });
  const weeksHtml = Array.from(groupMap.values())
    .sort((a, b) => Number(b.weekStartTimestamp) - Number(a.weekStartTimestamp))
    .map((group) => {
      const itemsHtml = group.items.map((entry) => `
        <div class="print-history-item">
          <p class="print-history-item-main">${escapeHtml(formatPrintedNoticeBoardItem(entry))}</p>
          <div class="print-history-item-actions">
            <p class="print-history-item-time">${escapeHtml(formatPrintedNoticeTime(entry.createdAt))}</p>
            <button
              type="button"
              class="print-history-delete-btn"
              data-action="delete-print-history-item"
              data-customer-key="${escapeHtml(entry.customerKey)}"
              data-workorder-value="${escapeHtml(entry.workOrderValue)}"
            >清除</button>
          </div>
        </div>
      `).join("");
      return `
        <section class="print-history-week">
          <h3 class="print-history-week-title">${escapeHtml(group.weekLabel)}</h3>
          <div class="print-history-list">${itemsHtml}</div>
        </section>
      `;
    })
    .join("");
  replaceChildrenFromTrustedTemplate(ui.homePrintHistoryPanel, `
    <h2>列印歷史</h2>
    ${toolbarHtml}
    ${weeksHtml}
  `);
}

function formatPrintedNoticeTime(timestamp) {
  const date = new Date(Number(timestamp));
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  const hh = String(date.getHours()).padStart(2, "0");
  const min = String(date.getMinutes()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

function formatPrintedNoticeDate(timestamp) {
  const date = new Date(Number(timestamp));
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, "0");
  const dd = String(date.getDate()).padStart(2, "0");
  return `${yyyy}.${mm}.${dd}`;
}

function formatPrintedNoticeBoardItem(entry) {
  const customerLabel = String(entry?.customerLabel ?? "").trim();
  const workOrderValue = String(entry?.workOrderValue ?? "").trim();
  return `${customerLabel} - ${workOrderValue}`;
}

function syncPrintedToggleCheckboxes(customerKey, workOrderValue, checked) {
  const normalizedCustomerKey = String(customerKey ?? "").trim();
  const normalizedWorkOrderValue = String(workOrderValue ?? "").trim();
  document.querySelectorAll('[data-role="printed-toggle"]').forEach((input) => {
    if (
      String(input.dataset.customerKey ?? "").trim() !== normalizedCustomerKey ||
      String(input.dataset.workorderValue ?? "").trim() !== normalizedWorkOrderValue
    ) {
      return;
    }
    input.checked = Boolean(checked);
  });
}

function bindPrintedToggleIn(rootElement) {
  if (!rootElement) {
    return;
  }
  rootElement.querySelectorAll('[data-role="printed-toggle"]').forEach((input) => {
    if (input.__printedToggleBound === true) {
      return;
    }
    input.__printedToggleBound = true;
    input.addEventListener("change", async () => {
      const entry = {
        customerKey: input.dataset.customerKey,
        customerLabel: input.dataset.customerLabel,
        workOrderLabel: input.dataset.workorderLabel,
        workOrderValue: input.dataset.workorderValue
      };
      const nextChecked = Boolean(input.checked);
      syncPrintedToggleCheckboxes(entry.customerKey, entry.workOrderValue, nextChecked);
      try {
        if (nextChecked) {
          const result = await upsertPrintNoticeByApi({
            customer: entry.customerKey,
            customer_label: entry.customerLabel,
            workorder_label: entry.workOrderLabel,
            workorder_value: entry.workOrderValue
          });
          upsertPrintedNoticeInState(result.entry || {
            customer: entry.customerKey,
            customer_label: entry.customerLabel,
            workorder_label: entry.workOrderLabel,
            workorder_value: entry.workOrderValue
          });
        } else {
          await deletePrintNoticeByApi({
            customer: entry.customerKey,
            workorder_value: entry.workOrderValue
          });
          removePrintedNoticeInState(entry.customerKey, entry.workOrderValue);
        }
        renderHomePrintNoticeBoard();
        renderHomePrintHistoryPanel();
      } catch (error) {
        syncPrintedToggleCheckboxes(entry.customerKey, entry.workOrderValue, !nextChecked);
        updateHomeStatus(`列印公告更新失敗：${getSafeErrorMessage(error)}`, true);
      }
    });
  });
}

async function loadPrintNoticeBoard() {
  const result = await getPrintNoticesByApi();
  state.printNoticeEntries = Array.isArray(result.entries) ? result.entries : [];
  renderHomePrintNoticeBoard();
  renderHomePrintHistoryPanel();
}

function toggleHomePrintHistoryPanel() {
  if (!ui.homePrintHistoryPanel) {
    return;
  }
  const nextHidden = !ui.homePrintHistoryPanel.hidden;
  if (!nextHidden) {
    renderHomePrintHistoryPanel();
  }
  ui.homePrintHistoryPanel.hidden = nextHidden;
}

async function onHomePrintHistoryPanelClick(event) {
  const deleteButton = event.target.closest('[data-action="delete-print-history-item"]');
  if (!deleteButton) {
    return;
  }
  const customerKey = String(deleteButton.getAttribute("data-customer-key") ?? "").trim();
  const workOrderValue = String(deleteButton.getAttribute("data-workorder-value") ?? "").trim();
  if (!customerKey || !workOrderValue) {
    return;
  }
  const confirmed = window.confirm(`確定清除 ${workOrderValue} 的列印歷史？`);
  if (!confirmed) {
    return;
  }
  try {
    await deletePrintNoticeByApi({
      customer: customerKey,
      workorder_value: workOrderValue
    });
    removePrintedNoticeInState(customerKey, workOrderValue);
    syncPrintedToggleCheckboxes(customerKey, workOrderValue, false);
    renderHomePrintNoticeBoard();
    renderHomePrintHistoryPanel();
    updateHomeStatus(`已清除 ${workOrderValue} 的列印歷史。`, false, false, true);
  } catch (error) {
    updateHomeStatus(`清除列印歷史失敗：${getSafeErrorMessage(error)}`, true);
  }
}

function onHomePrintHistoryPanelChange(event) {
  const select = event.target.closest("#home-print-history-customer-filter");
  if (!select) {
    return;
  }
  state.printHistoryCustomerFilter = String(select.value ?? "all").trim() || "all";
  renderHomePrintHistoryPanel();
}

function buildPrintNotice(customerKey, workOrderLabel, workOrderValue) {
  const normalizedCustomerKey = String(customerKey ?? "").trim();
  const normalizedWorkOrderValue = String(workOrderValue ?? "").trim();
  if (!normalizedCustomerKey || !normalizedWorkOrderValue) {
    return null;
  }
  return {
    customerKey: normalizedCustomerKey,
    customerLabel: PRINTED_NOTICE_CUSTOMER_LABELS[normalizedCustomerKey] || normalizedCustomerKey,
    workOrderLabel: String(workOrderLabel ?? "").trim() || "工單",
    workOrderValue: normalizedWorkOrderValue,
    checked: isPrintedNoticeChecked(normalizedCustomerKey, normalizedWorkOrderValue)
  };
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
  const fileName = String(filename ?? "").trim() || "download.xlsx";
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.URL.revokeObjectURL(url);
}


function setButtonLoading(button, isLoading) {
  if (!button) {
    return;
  }
  button.classList.toggle("btn-loading", Boolean(isLoading));
  if (isLoading) {
    button.setAttribute("aria-busy", "true");
  } else {
    button.removeAttribute("aria-busy");
  }
}

function scrollToElement(element) {
  if (!element) {
    return;
  }
  const behavior = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ? "auto" : "smooth";
  window.requestAnimationFrame(() => {
    element.scrollIntoView({ behavior, block: "nearest" });
  });
}

async function runWithButtonLoading(button, task) {
  setButtonLoading(button, true);
  try {
    return await task();
  } finally {
    setButtonLoading(button, false);
  }
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

function updateLunfeiStatus(message, isError = false, isLoading = false, isDuplicateHit = false) {
  updateStatus({ status: ui.lunfeiStatus }, message, isError, isLoading, false, isDuplicateHit);
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

function updateBngStatus(message, isError = false, isLoading = false, isDuplicateHit = false) {
  updateStatus({ status: ui.bngStatus }, message, isError, isLoading, false, isDuplicateHit);
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
  updateStatus({ status: ui.chgStatus }, message, isError, isLoading);
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
  updateStatus({ status: ui.hmgStatus }, message, isError, isLoading);
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
  updateStatus({ status: ui.clgStatus }, message, isError, isLoading);
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

// 【用途】更新首頁狀態文字，供單一首頁模式顯示查詢/匯出結果
function updateHomeStatus(message, isError = false, isLoading = false, isSuccess = false, isDuplicateHit = false) {
  updateStatus({ status: ui.homeStatus }, message, isError, isLoading, isSuccess, isDuplicateHit);
}

// 【用途】控制首頁載入狀態與查詢按鈕可用性
function setHomeLoading(isLoading, message = "", action = "search") {
  if (ui.homeLoadingIndicator) {
    ui.homeLoadingIndicator.classList.toggle("active", isLoading);
  }
  if (ui.homeQueryBtn) {
    ui.homeQueryBtn.disabled = isLoading;
    setButtonLoading(ui.homeQueryBtn, isLoading && action === "search");
  }
  if (ui.homeHistoryBtn) {
    ui.homeHistoryBtn.disabled = isLoading;
  }
  if (ui.homePrintHistoryBtn) {
    ui.homePrintHistoryBtn.disabled = isLoading;
  }
  if (ui.homeBngPrintBtn) {
    if (isLoading) {
      ui.homeBngPrintBtn.disabled = true;
    }
  }
  if (ui.homeExportBtn) {
    setButtonLoading(ui.homeExportBtn, isLoading && action === "export");
    ui.homeExportBtn.disabled = isLoading || homeRuntime.customer === "deg" || state.customSourceData.some((source) => source.key === homeRuntime.customer) || !(homeRuntime.customer && state.currentRow);
  }
  if (ui.homeSearchInput) {
    ui.homeSearchInput.disabled = isLoading;
  }
  if (ui.homeSearchTypeSelect) {
    ui.homeSearchTypeSelect.disabled = isLoading;
  }
  if (message) {
    updateHomeStatus(message, false, isLoading);
  }
}

// 【用途】依目前首頁命中結果控制匯出按鈕
function setHomeExportEnabled(enabled) {
  if (!ui.homeExportBtn) {
    return;
  }
  ui.homeExportBtn.disabled = !enabled;
}

// 【用途】控制首頁 BNG 收據按鈕（僅命中 bng 工單時啟用）
function setHomeBngPrintEnabled(enabled) {
  if (!ui.homeBngPrintBtn) {
    return;
  }
  ui.homeBngPrintBtn.disabled = !enabled;
}

// 【用途】控制 Cubepilot 序號生成設定卡片的展開/收合狀態
function setClgSettingsVisibility(isVisible) {
  if (!ui.clgSerialSettingsCard || !ui.clgSettingsToggleBtn) {
    return;
  }
  const visible = Boolean(isVisible);
  ui.clgSerialSettingsCard.hidden = !visible;
  ui.clgSettingsToggleBtn.setAttribute("aria-expanded", visible ? "true" : "false");
  ui.clgSettingsToggleBtn.textContent = visible
    ? "收合自定義序號生成"
    : "自定義序號生成";
}

// 【用途】切換 Cubepilot 序號生成設定卡片顯示狀態
function toggleClgSettingsVisibility() {
  if (!ui.clgSerialSettingsCard) {
    return;
  }
  setClgSettingsVisibility(ui.clgSerialSettingsCard.hidden);
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
  replaceChildrenFromTrustedTemplate(ui.previewPanel, `
    <h2>預覽窗格</h2>
    <p>請先上傳共用 Excel，並輸入工單號後點擊「解析工單」。</p>
  `);
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
  setClgSettingsVisibility(false);
  hideClgSuggestPanel();
}

function updateTabUi() {
  const active = getActiveCustomerKey();
  const customerTabs = [
    ["yingbang", ui.yingbangTab],
    ["lunfei", ui.lunfeiTab],
    ["bng", ui.bngTab],
    ["chg", ui.chgTab],
    ["hmg", ui.hmgTab],
    ["clg", ui.clgTab]
  ];
  customerTabs.forEach(([key, tab]) => {
    const isSelected = active === key;
    tab.classList.toggle("active", isSelected);
    tab.setAttribute("aria-selected", isSelected ? "true" : "false");
    tab.tabIndex = isSelected ? 0 : -1;
  });
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

// 【用途】依欄位代碼取得超恩列印用欄位值（支援 alias 對應）
function getBngColumnValue(row, columnCode) {
  if (!row) {
    return "";
  }
  const key = resolveColumnKey(row, columnCode) || CONFIG.COLUMNS[columnCode];
  return String(row[key] ?? "").trim();
}

// 【用途】掛載超恩收據列印節點並切換成列印模式
function mountBngReceiptPrintView(payload) {
  if (!ui.bngReceiptPrintRoot) {
    throw new Error("找不到超恩收據列印區塊。");
  }
  replaceChildrenFromTrustedTemplate(
    ui.bngReceiptPrintRoot,
    renderBngReceiptPrintHtml(payload, escapeHtml)
  );
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
  ui.bngReceiptPrintRoot.replaceChildren();
}

function onCopyError() {
  showToast("複製失敗：瀏覽器不允許剪貼簿存取。", "error");
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


function normalizeClgSearchText(value) {
  return String(value ?? "").toLowerCase();
}

function findClgRowsByModel(rows, keyword) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const modelKey = resolveCustomerColumnKey("clg", rows[0], "MODEL");
  if (!modelKey) {
    return [];
  }
  const target = normalizeClgSearchText(keyword);
  return rows.filter((row) => normalizeClgSearchText(row?.[modelKey] ?? "").includes(target));
}

function getClgModelValue(row) {
  return getRowValueByCustomerColumnCode("clg", row, "MODEL");
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
  return getRowValueByCustomerColumnCode("hmg", row, "MODEL");
}

function findHmgRowsByModel(rows, keyword) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const modelKey = resolveCustomerColumnKey("hmg", rows[0], "MODEL");
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
  ui.hmgSuggestPanel.replaceChildren();
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
  replaceChildrenFromTrustedTemplate(ui.hmgSuggestPanel, `
    <p class="clg-suggest-title">關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請點選一筆：</p>
    <div class="clg-suggest-list">${optionsHtml}</div>
    ${hiddenText}
  `);
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
  ui.clgSuggestPanel.replaceChildren();
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
  replaceChildrenFromTrustedTemplate(ui.clgSuggestPanel, `
    <p class="clg-suggest-title">關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請點選一筆：</p>
    <div class="clg-suggest-list">${optionsHtml}</div>
    ${hiddenText}
  `);
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
  const plannedSerialPreview = buildClgPlannedSerialPreview(getClgInputValues(ui), getSafeErrorMessage);

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

const HOME_CUSTOMER_THEME_CLASS_MAP = {
  yingbang: "home-theme-yingbang",
  lunfei: "home-theme-lunfei",
  bng: "home-theme-bng",
  chg: "home-theme-chg"
};
const HOME_CUSTOMER_THEME_CLASSES = Object.values(HOME_CUSTOMER_THEME_CLASS_MAP);

// 【用途】首頁命中結果：套用/清除客戶主題色（狀態列 + 預覽窗格）
function setHomeCustomerTheme(customerKey) {
  setDegGeneratorVisible(customerKey === "deg" && Boolean(state.currentRow));
  vecowLinkController.setHomeCustomer(customerKey);
  const themeClass = HOME_CUSTOMER_THEME_CLASS_MAP[customerKey] || "";
  const targets = [ui.homeShell, ui.homePreviewPanel];
  targets.forEach((element) => {
    if (!element) {
      return;
    }
    HOME_CUSTOMER_THEME_CLASSES.forEach((name) => element.classList.remove(name));
    if (themeClass) {
      element.classList.add(themeClass);
    }
  });
}

// 【用途】首頁查詢分流：把關鍵字送到指定客戶既有查詢流程
async function runHomeSearchByCustomer(customerKey, query) {
  const source = state.customSourceData.find((item) => item.key === customerKey);
  if (source) {
    state.currentRow = findSourceRows(source, query)[0] || null;
    state.currentQuery = query;
    return;
  }
  if (customerKey === "deg") {
    state.currentRow = findDegWorkOrderRows(state.degRowData, query, false, state.degWorkOrderColumn)[0] || null;
    state.currentQuery = query;
    return;
  }
  if (customerKey === "yingbang") {
    switchCustomerTab("yingbang");
    ui.searchInput.value = query;
    await performSearch();
    return;
  }
  if (customerKey === "lunfei") {
    switchCustomerTab("lunfei");
    ui.lunfeiSearchInput.value = query;
    await performLunfeiSearch();
    return;
  }
  if (customerKey === "bng") {
    switchCustomerTab("bng");
    ui.bngSearchInput.value = query;
    await performBngSearch();
    return;
  }
  if (customerKey === "chg") {
    switchCustomerTab("chg");
    ui.chgSearchInput.value = query;
    await performChgSearch();
    return;
  }
  if (customerKey === "hmg") {
    switchCustomerTab("hmg");
    ui.hmgSearchInput.value = query;
    await performHmgSearch();
    return;
  }
  if (customerKey === "clg") {
    switchCustomerTab("clg");
    ui.clgSearchInput.value = query;
    await performClgSearch();
  }
}

// 【用途】取得客戶預覽來源面板
function getPreviewPanelByCustomer(customerKey) {
  const panelMap = {
    yingbang: ui.previewPanel,
    lunfei: ui.lunfeiPreviewPanel,
    bng: ui.bngPreviewPanel,
    chg: ui.chgPreviewPanel,
    hmg: ui.hmgPreviewPanel,
    clg: ui.clgPreviewPanel
  };
  return panelMap[customerKey] || null;
}

// 【用途】取得首頁預覽中清空歷史按鈕的對應事件
function getHomePreviewClearHistoryBinding(customerKey) {
  const clearMap = {
    yingbang: { selector: "#btn-clear-history", handler: onClearHistoryClick },
    lunfei: { selector: "#btn-clear-history-lunfei", handler: onLunfeiClearHistoryClick },
    bng: { selector: "#btn-clear-history-bng", handler: onBngClearHistoryClick },
    chg: { selector: "#btn-clear-history-chg", handler: onChgClearHistoryClick },
    hmg: { selector: "#btn-clear-history-hmg", handler: onHmgClearHistoryClick },
    clg: { selector: "#btn-clear-history-clg", handler: onClgClearHistoryClick }
  };
  return clearMap[customerKey] || null;
}

// 【用途】將底層客戶預覽窗格內容同步到首頁預覽窗格
function syncHomePreviewPanel(customerKey) {
  if (!ui.homePreviewPanel) {
    return;
  }
  const source = state.customSourceData.find((item) => item.key === customerKey);
  if (source) {
    const rows = findSourceRows(source, homeRuntime.query);
    renderGenericSourceSearchSuccess(ui.homePreviewPanel, { source, query: homeRuntime.query, rows });
    bindPreviewTabsIn(ui.homePreviewPanel);
    bindSheetCopyCellsIn(ui.homePreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.homePreviewPanel, onCopyError);
    return;
  }
  if (customerKey === "deg") {
    const rows = findDegWorkOrderRows(state.degRowData, homeRuntime.query, false, state.degWorkOrderColumn);
    replaceChildrenFromTrustedTemplate(ui.homePreviewPanel, `<h2>泉影工單</h2><p>查詢工單：${escapeHtml(homeRuntime.query)}（命中 ${rows.length} 筆）</p>${renderSheetContentPane(rows)}<p>請使用下方泉影 DEG 編碼設定生成序號。</p>`);
    bindSheetCopyCellsIn(ui.homePreviewPanel, onCopyError);
    return;
  }
  const sourcePanel = getPreviewPanelByCustomer(customerKey);
  if (sourcePanel) {
    cloneChildrenInto(ui.homePreviewPanel, sourcePanel);
  } else {
    replaceChildrenFromTrustedTemplate(ui.homePreviewPanel, "<p>無可顯示的預覽資料。</p>");
  }
  bindPreviewTabsIn(ui.homePreviewPanel);
  bindSheetCopyCellsIn(ui.homePreviewPanel, onCopyError);
  bindCopyButtonsIn(ui.homePreviewPanel, onCopyError);
  bindPrintedToggleIn(ui.homePreviewPanel);
  const clearBinding = getHomePreviewClearHistoryBinding(customerKey);
  if (clearBinding) {
    bindClearHistoryButtonIn(ui.homePreviewPanel, clearBinding.selector, clearBinding.handler);
  }
  bindCustomTabActionsIn(ui.homePreviewPanel, {
    onAdd: onAddPreviewCustomTab,
    onRemove: onRemovePreviewCustomTab,
    onEdit: onEditPreviewCustomTab
  });
}

function renderHomeCustomerResults(sources, query) {
  const content = sources.map((source) => `
    <section>
      <h2>${escapeHtml(source.label)}</h2>
      <p>客戶關鍵字「${escapeHtml(query)}」；共 ${source.rows.length} 筆</p>
      ${renderSheetContentPane(source.rows)}
    </section>
  `).join("");
  replaceChildrenFromTrustedTemplate(ui.homePreviewPanel, content);
  bindSheetCopyCellsIn(ui.homePreviewPanel, onCopyError);
}

async function onHomeResetHistoryByCustomer(customerKey, historyKey) {
  const key = String(customerKey ?? "").trim();
  if (key === "deg") {
    await resetHistoryByApi({ customer: "deg", key: historyKey });
    return;
  }
  if (key === "yingbang") {
    await onResetSerialHistoryKey(historyKey);
    return;
  }
  if (key === "lunfei") {
    await onLunfeiResetSerialHistoryKey(historyKey);
    return;
  }
  if (key === "bng") {
    await onBngResetSerialHistoryKey(historyKey);
    return;
  }
  if (key === "chg") {
    await onChgResetSerialHistoryKey(historyKey);
    return;
  }
  if (key === "hmg") {
    await onHmgResetSerialHistoryKey(historyKey);
    return;
  }
  if (key === "clg") {
    await onClgResetSerialHistoryKey(historyKey);
  }
}

const homeController = createHomeController({
  ui,
  state,
  homeRuntime,
  escapeHtml,
  normalizeText,
  getSafeErrorMessage,
  setHomeLoading,
  setHomeExportEnabled,
  setHomeBngPrintEnabled,
  setHomeCustomerTheme,
  runHomeSearchByCustomer,
  syncHomePreviewPanel,
  loadHistorySnapshot,
  renderSerialHistoryTableIn,
  bindHistoryResetButtonsIn,
  onHomeResetHistoryByCustomer,
  switchCustomerTab,
  onExportClick,
  onBngPrintReceiptClick,
  findHmgRowsByModel,
  findClgRowsByModel,
  getHmgModelValue,
  getClgModelValue,
  getRowValueByCustomerColumnCode,
  updateHomeStatus,
  showToast,
  scrollToElement,
  renderHomeCustomerResults,
  setFzgSearchResult
});

const {
  performHomeSearch,
  onHomeSearchTypeChange,
  onHomePreviewPanelClick,
  openHomeHistoryPanel,
  onHomeExportClick,
  onHomeBngPrintClick,
  syncHomeSearchModeUi
} = homeController;

function updateClgExportEnabledBySettings() {
  if (!ui.clgExportBtn) {
    return;
  }
  if (state.isLoading) {
    ui.clgExportBtn.disabled = true;
    return;
  }
  const plannedSerialPreview = buildClgPlannedSerialPreview(getClgInputValues(ui), getSafeErrorMessage);
  ui.clgExportBtn.disabled = Boolean(plannedSerialPreview.error);
}

function refreshClgPlannedSerialPreview() {
  const plannedSerialPreview = buildClgPlannedSerialPreview(getClgInputValues(ui), getSafeErrorMessage);
  updateClgPlannedSerialPreviewIn(ui, plannedSerialPreview);
}

// 【用途】序號生成設定：複製整串序號為純文字（每行一筆）
async function onClgCopySerialTextClick(event) {
  const button = event.target.closest("#btn-copy-clg-serial-text");
  if (!button) {
    return;
  }
  try {
    const serialList = buildClgSerialList(getClgInputValues(ui));
    if (!Array.isArray(serialList) || serialList.length === 0) {
      updateHomeStatus("目前無可複製的序號，請先完成序號設定。", true);
      return;
    }
    const plainText = serialList.join("\n");
    await copyTextToClipboard(plainText);
    updateHomeStatus(`已複製整串序號（共 ${serialList.length} 筆）。`, false, false, true);
    showToast(`已複製整串序號（共 ${serialList.length} 筆）。`, "success");
  } catch (error) {
    updateHomeStatus(`複製失敗：${getSafeErrorMessage(error)}`, true);
    showToast(`複製失敗：${getSafeErrorMessage(error)}`, "error");
  }
}

function getClgExportFileName() {
  const defaultName = `${String(getActiveCustomerProfile()?.label ?? "Cubepilot")}-SN.xlsx`;
  const input = window.prompt("請輸入匯出檔名（可含副檔名）", defaultName);
  if (input === null) {
    return "";
  }
  const normalized = String(input).trim();
  if (!normalized) {
    return defaultName;
  }
  return /\.(xls|xlsx)$/i.test(normalized) ? normalized : `${normalized}.xlsx`;
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
    workOrderHistory: filterGenerationRecords(historySnapshot.records, workOrder),
    printNotice: buildPrintNotice("yingbang", "工單", query)
  });
  bindPreviewTabs(ui);
  bindCopyButtons(ui, onCopyError);
  bindSheetCopyCells(ui, onCopyError);
  bindPrintedToggleIn(ui.previewPanel);
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
    const payload = buildBngReceiptPrintPayload({
      row: state.currentRow,
      getColumnValue: getBngColumnValue,
      normalizeRangeText
    });
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
  if (matchedRows.length === 2) {
    window.alert(`警示：MO ${query} 命中 2 筆資料，請確認兩筆資訊後再進行後續操作。`);
  }
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
      resolvedQty,
      matchedRows,
      printNotice: buildPrintNotice("lunfei", "MO", query)
    });
    bindPreviewTabsIn(ui.lunfeiPreviewPanel);
    bindSheetCopyCellsIn(ui.lunfeiPreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.lunfeiPreviewPanel, onCopyError);
    bindPrintedToggleIn(ui.lunfeiPreviewPanel);
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

    updateLunfeiStatus(
      `查詢成功：${query}（命中 ${matchedRows.length} 筆）`,
      false,
      false,
      matchedRows.length === 2
    );
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
  if (matchedRows.length === 2) {
    window.alert(`警示：MO ${query} 命中 2 筆資料，請確認兩筆資訊後再進行後續操作。`);
  }
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
      normalizedRanges,
      matchedRows,
      printNotice: buildPrintNotice("bng", "MO", query)
    });
    bindPreviewTabsIn(ui.bngPreviewPanel);
    bindSheetCopyCellsIn(ui.bngPreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.bngPreviewPanel, onCopyError);
    bindPrintedToggleIn(ui.bngPreviewPanel);
    bindClearHistoryButtonIn(ui.bngPreviewPanel, "#btn-clear-history-bng", onBngClearHistoryClick);
    bindCustomTabActionsIn(ui.bngPreviewPanel, {
      onAdd: onAddPreviewCustomTab,
      onRemove: onRemovePreviewCustomTab,
      onEdit: onEditPreviewCustomTab
    });
    ui.bngExportBtn.disabled = false;
    setBngPrintEnabled(true);
    updateBngStatus(
      `查詢成功：MO ${query}（命中 ${matchedRows.length} 筆）`,
      false,
      false,
      matchedRows.length === 2
    );
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
      generationHistory,
      printNotice: buildPrintNotice("chg", "工單", workOrder)
    });
    bindPreviewTabsIn(ui.chgPreviewPanel);
    bindSheetCopyCellsIn(ui.chgPreviewPanel, onCopyError);
    bindCopyButtonsIn(ui.chgPreviewPanel, onCopyError);
    bindPrintedToggleIn(ui.chgPreviewPanel);
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
    replaceChildrenFromTrustedTemplate(ui.hmgPreviewPanel, `
      <h2>赫星 預覽窗格</h2>
      <p>關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請從查詢區下方提示清單點選機種。</p>
    `);
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
    replaceChildrenFromTrustedTemplate(ui.clgPreviewPanel, `
      <h2>Cubepilot 預覽窗格</h2>
      <p>關鍵字「${escapeHtml(query)}」命中 ${matchedRows.length} 筆，請從查詢區下方提示清單點選機種。</p>
    `);
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
  state.degRowData = [];
  state.degWorkOrderColumn = null;
  state.customSourceData = [];
  setDegGeneratorVisible(false);
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
    await loadCustomSourceData(file);
    // 舊總表可能尚無 DEG 分頁；不得沿用前一次泉影資料。
    try {
      const entries = (await getShipmentSourcesByApi()).entries || [];
      const binding = entries.find((entry) => entry.search_customer === "deg");
      const parsed = await parseExcelByApi({ customer: "deg", sheetName: binding?.label || "DEG", parseRules: ["trim"], file });
      state.degRowData = Array.isArray(parsed.rows) ? parsed.rows : [];
      state.degWorkOrderColumn = binding?.work_order_column || null;
    } catch (error) {
      showToast(`泉影 DEG 未載入：${getSafeErrorMessage(error)}`, "info");
    }
    parseResults.forEach((item) => {
      rowsByCustomer[item.customer] = item.rows;
    });

    state.yingbangRowData = rowsByCustomer.yingbang;
    state.lunfeiRowData = rowsByCustomer.lunfei;
    state.bngRowData = rowsByCustomer.bng;
    setChgShipmentRows(rowsByCustomer.chg);
    try {
      await ensureMonthlyReferencesFromKoyaRows();
    } catch (error) {
      showToast(`月份自動帶入失敗：${getSafeErrorMessage(error)}`, "error");
    }
    state.currentRow = null;
    state.currentQuery = "";
    state.generatedSNList = [];

    ui.historyPanel.hidden = true;
    ui.lunfeiHistoryPanel.hidden = true;
    ui.bngHistoryPanel.hidden = true;
    ui.chgHistoryPanel.hidden = true;

    renderLoadResult(ui, state.yingbangRowData, file.name);
    const safeFileName = escapeHtml(file.name);
    replaceChildrenFromTrustedTemplate(ui.lunfeiPreviewPanel, `
      <h2>倫飛預覽窗格</h2>
      <p>來源檔案：${safeFileName}</p>
      <p>已載入倫飛出貨 ${state.lunfeiRowData.length} 筆資料。</p>
    `);
    replaceChildrenFromTrustedTemplate(ui.bngPreviewPanel, `
      <h2>超恩預覽窗格</h2>
      <p>來源檔案：${safeFileName}</p>
      <p>已載入超恩出貨 ${state.bngRowData.length} 筆資料。</p>
    `);
    replaceChildrenFromTrustedTemplate(ui.chgPreviewPanel, `
      <h2>KOYA 預覽窗格</h2>
      <p>來源檔案：${safeFileName}</p>
      <p>已載入 KOYA 出貨 ${state.chgRowData.length} 筆資料。</p>
    `);

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
    setChgShipmentRows([]);
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

    const safeErrorMessage = escapeHtml(getSafeErrorMessage(error));
    replaceChildrenFromTrustedTemplate(ui.previewPanel, `
      <h2>預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${safeErrorMessage}</div>
    `);
    replaceChildrenFromTrustedTemplate(ui.lunfeiPreviewPanel, `
      <h2>倫飛預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${safeErrorMessage}</div>
    `);
    replaceChildrenFromTrustedTemplate(ui.bngPreviewPanel, `
      <h2>超恩預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${safeErrorMessage}</div>
    `);
    replaceChildrenFromTrustedTemplate(ui.chgPreviewPanel, `
      <h2>KOYA 預覽窗格</h2>
      <div class="error-box">讀取共用 Excel 失敗：${safeErrorMessage}</div>
    `);
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
    replaceChildrenFromTrustedTemplate(ui.hmgPreviewPanel, `
      <h2>赫星 預覽窗格</h2>
      <p>來源檔案：${escapeHtml(file.name)}</p>
      <p>已載入赫星 ${state.hmgRowData.length} 筆資料。</p>
    `);
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
    replaceChildrenFromTrustedTemplate(ui.hmgPreviewPanel, `
      <h2>赫星 預覽窗格</h2>
      <div class="error-box">讀取赫星 Excel 失敗：${escapeHtml(getSafeErrorMessage(error))}</div>
    `);
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
    replaceChildrenFromTrustedTemplate(ui.clgPreviewPanel, `
      <h2>Cubepilot 預覽窗格</h2>
      <p>來源檔案：${escapeHtml(file.name)}</p>
      <p>已載入 Cubepilot ${state.clgRowData.length} 筆資料。</p>
    `);
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
    replaceChildrenFromTrustedTemplate(ui.clgPreviewPanel, `
      <h2>Cubepilot 預覽窗格</h2>
      <div class="error-box">讀取 Cubepilot Excel 失敗：${escapeHtml(getSafeErrorMessage(error))}</div>
    `);
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
    return `${yyyy}${mm}${dd}-${safeModel}.xlsx`;
  }
  const label = String(getActiveCustomerProfile()?.label ?? "").trim() || getActiveCustomerKey();
  return `${label}-SN.xlsx`;
}

async function onExportClick() {
  if (getActiveCustomerKey() === "lunfei") {
    if (!state.currentRow) {
      updateLunfeiStatus("請先查詢 MO 後再生成。", true);
      showToast("請先查詢 MO 後再生成。", "error");
      return false;
    }
    if (ui.lunfeiExportBtn.disabled) {
      updateLunfeiStatus("此型號不需要序號，已禁止生成。", true);
      showToast("此型號不需要序號，已禁止生成。", "error");
      return false;
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
      showToast(`匯出完成：${exported.filename}`, "success");
      await performLunfeiSearch();
      return true;
    } catch (error) {
      updateLunfeiStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
      showToast(`匯出失敗：${getSafeErrorMessage(error)}`, "error");
      return false;
    }
  }

  if (getActiveCustomerKey() === "bng") {
    if (!state.currentRow) {
      updateBngStatus("請先查詢 MO 後再生成。", true);
      showToast("請先查詢 MO 後再生成。", "error");
      return false;
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
      showToast(`匯出完成：${exported.filename}`, "success");
      await performBngSearch();
      return true;
    } catch (error) {
      updateBngStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
      showToast(`匯出失敗：${getSafeErrorMessage(error)}`, "error");
      return false;
    }
  }

  if (getActiveCustomerKey() === "chg") {
    if (!state.currentRow) {
      updateChgStatus("請先查詢工單後再生成。", true);
      showToast("請先查詢工單後再生成。", "error");
      return false;
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
      showToast(`匯出完成：${exported.filename}`, "success");
      await performChgSearch();
      return true;
    } catch (error) {
      updateChgStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
      showToast(`匯出失敗：${getSafeErrorMessage(error)}`, "error");
      return false;
    }
  }

  if (getActiveCustomerKey() === "hmg") {
    if (!state.currentRow) {
      updateHmgStatus("請先查詢 Model 後再匯出。", true);
      showToast("請先查詢 Model 後再匯出。", "error");
      return false;
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
      showToast(`匯出完成：${exported.filename}`, "success");
      await performHmgSearch();
      return true;
    } catch (error) {
      updateHmgStatus(`匯出失敗：${getSafeErrorMessage(error)}`, true);
      showToast(`匯出失敗：${getSafeErrorMessage(error)}`, "error");
      return false;
    }
  }

  if (getActiveCustomerKey() === "clg") {
    try {
      const modelFromRow = state.currentRow
        ? String(state.currentRow[resolveColumnKey(state.currentRow, "MODEL") || CONFIG.COLUMNS.MODEL] ?? "").trim()
        : "";
      const modelFromInput = String(ui.clgSearchInput?.value ?? "").trim();
      const model = modelFromRow || modelFromInput || "manual";
      const inputs = getClgInputValues(ui);
      const count = Number(inputs.countText);
      const serials = buildClgSerialList({
        ...inputs,
        count
      });
      const fileName = getClgExportFileName();
      if (!fileName) {
        updateClgStatus("已取消匯出。", true);
        showToast("已取消匯出。", "info");
        return false;
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
      showToast(`匯出完成：${exported.filename}`, "success");
      return true;
    } catch (error) {
      updateClgStatus(`生成失敗：${getSafeErrorMessage(error)}`, true);
      showToast(`匯出失敗：${getSafeErrorMessage(error)}`, "error");
      return false;
    }
  }

  if (!state.currentRow) {
    updateStatus(ui, "請先查詢工單後再匯出。", true);
    showToast("請先查詢工單後再匯出。", "error");
    return false;
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
    showToast(`匯出完成：${exported.filename}`, "success");

    const query = ui.searchInput.value.trim();
    if (query) {
      const matchedRows = findWorkOrderRows(state.yingbangRowData, query);
      if (matchedRows.length > 0) {
        state.currentRow = matchedRows[0];
        await refreshSearchPreview(query, matchedRows.length);
      }
    }
    return true;
  } catch (error) {
    updateStatus(ui, `匯出失敗：${getSafeErrorMessage(error)}`, true);
    showToast(`匯出失敗：${getSafeErrorMessage(error)}`, "error");
    return false;
  }
}

// 【用途】將自定義產生的全部序號下載為 MES 工作表。
function onClgSerialDownloadClick() {
  try {
    const serialList = buildClgSerialList(getClgInputValues(ui));
    const format = ui.clgExportFormatSelect.value === "xls" ? "xls" : "xlsx";
    const columnName = ui.clgExportColumnSelect.value === "LabelName" ? "LabelName" : "SN";
    if (format === "xls" && serialList.length > 65535) {
      throw new Error("XLS 最多可包含 65,535 筆序號，請改選 XLSX。");
    }
    if (!globalThis.XLSX?.utils) {
      throw new Error("Excel 匯出元件尚未載入，請重新整理頁面後再試。");
    }

    const now = new Date();
    const datePrefix = `${String(now.getFullYear()).slice(-2)}${String(now.getMonth() + 1).padStart(2, "0")}${String(now.getDate()).padStart(2, "0")}-`;
    const customName = window.prompt("請輸入檔案名稱", `${datePrefix}Cubepilot-MES`);
    if (customName === null) {
      updateHomeStatus("已取消下載。", false);
      return;
    }
    const sanitizedName = String(customName)
      .trim()
      .replace(/\.(?:xls|xlsx)$/i, "")
      .replace(/[<>:"/\\|?*\u0000-\u001F]/g, "_")
      .replace(/[. ]+$/g, "") || "Cubepilot-MES";
    const filename = `${sanitizedName.startsWith(datePrefix) ? "" : datePrefix}${sanitizedName}.${format}`;

    const workbook = globalThis.XLSX.utils.book_new();
    const worksheet = globalThis.XLSX.utils.aoa_to_sheet([
      [columnName],
      ...serialList.map((serial) => [serial])
    ]);
    globalThis.XLSX.utils.book_append_sheet(workbook, worksheet, "MES");
    globalThis.XLSX.writeFile(workbook, filename, { bookType: format, compression: format === "xlsx" });
    updateHomeStatus(`已下載 ${filename}（共 ${serialList.length} 筆序號，欄位：${columnName}）。`, false, false, true);
    showToast(`已下載全部序號：${filename}`, "success");
  } catch (error) {
    updateHomeStatus(`下載失敗：${getSafeErrorMessage(error)}`, true);
    showToast(`下載失敗：${getSafeErrorMessage(error)}`, "error");
  }
}


function initEvents() {
  ui.themeSelect.addEventListener("change", () => {
    applyTheme(ui.themeSelect.value);
    writeStorageItem(THEME_STORAGE_KEY, ui.themeSelect.value);
  });
  if (ui.homeQueryBtn) {
    ui.homeQueryBtn.addEventListener("click", performHomeSearch);
  }
  if (ui.homeHistoryBtn) {
    ui.homeHistoryBtn.addEventListener("click", openHomeHistoryPanel);
  }
  if (ui.homeExportBtn) {
    ui.homeExportBtn.addEventListener("click", onHomeExportClick);
  }
  if (ui.homeBngPrintBtn) {
    ui.homeBngPrintBtn.addEventListener("click", onHomeBngPrintClick);
  }
  if (ui.homePrintHistoryBtn) {
    ui.homePrintHistoryBtn.addEventListener("click", toggleHomePrintHistoryPanel);
  }
  if (ui.homeSearchInput) {
    ui.homeSearchInput.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && event.ctrlKey) {
        event.preventDefault();
        if (ui.homeExportBtn?.disabled) {
          showToast("請先完成查詢，再使用 Ctrl+Enter 匯出。", "info");
          return;
        }
        onHomeExportClick();
        return;
      }
      if (event.key === "Enter") {
        event.preventDefault();
        performHomeSearch();
      }
    });
  }
  if (ui.homePreviewPanel) {
    ui.homePreviewPanel.addEventListener("click", onHomePreviewPanelClick);
  }
  if (ui.homePrintHistoryPanel) {
    ui.homePrintHistoryPanel.addEventListener("click", onHomePrintHistoryPanelClick);
    ui.homePrintHistoryPanel.addEventListener("change", onHomePrintHistoryPanelChange);
  }
  if (ui.clgSettingsPlannedPreviewRoot) {
    ui.clgSettingsPlannedPreviewRoot.addEventListener("click", onClgCopySerialTextClick);
  }
  sourceMaintenance.bindEvents();
  ui.clgSerialDownloadBtn.addEventListener("click", onClgSerialDownloadClick);
  masterDataMaintenance.bindEvents();
  if (ui.homeSearchTypeSelect) {
    ui.homeSearchTypeSelect.addEventListener("change", onHomeSearchTypeChange);
  }
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
  ui.queryBtn.addEventListener("click", () => runWithButtonLoading(ui.queryBtn, performSearch));
  ui.lunfeiQueryBtn.addEventListener("click", () => runWithButtonLoading(ui.lunfeiQueryBtn, performLunfeiSearch));
  ui.bngQueryBtn.addEventListener("click", () => runWithButtonLoading(ui.bngQueryBtn, performBngSearch));
  ui.chgQueryBtn.addEventListener("click", () => runWithButtonLoading(ui.chgQueryBtn, performChgSearch));
  ui.hmgQueryBtn.addEventListener("click", () => runWithButtonLoading(ui.hmgQueryBtn, performHmgSearch));
  ui.clgQueryBtn.addEventListener("click", () => runWithButtonLoading(ui.clgQueryBtn, performClgSearch));
  ui.exportBtn.addEventListener("click", () => runWithButtonLoading(ui.exportBtn, onExportClick));
  ui.lunfeiExportBtn.addEventListener("click", () => runWithButtonLoading(ui.lunfeiExportBtn, onExportClick));
  ui.bngExportBtn.addEventListener("click", () => runWithButtonLoading(ui.bngExportBtn, onExportClick));
  ui.chgExportBtn.addEventListener("click", () => runWithButtonLoading(ui.chgExportBtn, onExportClick));
  ui.hmgExportBtn.addEventListener("click", () => runWithButtonLoading(ui.hmgExportBtn, onExportClick));
  ui.clgExportBtn.addEventListener("click", () => runWithButtonLoading(ui.clgExportBtn, onExportClick));
  ui.bngPrintBtn.addEventListener("click", onBngPrintReceiptClick);
  ui.searchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runWithButtonLoading(ui.queryBtn, performSearch);
    }
  });
  ui.lunfeiSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runWithButtonLoading(ui.lunfeiQueryBtn, performLunfeiSearch);
    }
  });
  ui.bngSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runWithButtonLoading(ui.bngQueryBtn, performBngSearch);
    }
  });
  ui.chgSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runWithButtonLoading(ui.chgQueryBtn, performChgSearch);
    }
  });
  ui.hmgSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runWithButtonLoading(ui.hmgQueryBtn, performHmgSearch);
    }
  });
  ui.hmgSearchInput.addEventListener("input", onHmgSearchInputChange);
  if (ui.hmgSuggestPanel) {
    ui.hmgSuggestPanel.addEventListener("click", onHmgSuggestOptionClick);
  }
  ui.clgSearchInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      runWithButtonLoading(ui.clgQueryBtn, performClgSearch);
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
  if (ui.clgSettingsToggleBtn) {
    ui.clgSettingsToggleBtn.addEventListener("click", toggleClgSettingsVisibility);
  }
  ui.fileInput.addEventListener("change", onFileSelected);
  ui.lunfeiFileInput.addEventListener("change", onLunfeiFileSelected);
  ui.bngFileInput.addEventListener("change", onBngFileSelected);
  ui.chgFileInput.addEventListener("change", onChgFileSelected);
  ui.hmgFileInput.addEventListener("change", onHmgFileSelected);
  ui.clgFileInput.addEventListener("change", onClgFileSelected);
  document.addEventListener("click", onUsageHelpClick);
  document.addEventListener("keydown", (event) => {
    if (event.ctrlKey && event.shiftKey && String(event.key).toLowerCase() === "d") {
      event.preventDefault();
      setMaintenanceEntriesVisibility(ui.shipmentSourceToggleBtn.hidden, true);
      return;
    }
    if (event.key === "Escape" && ui.clgSerialSettingsCard && !ui.clgSerialSettingsCard.hidden) {
      setClgSettingsVisibility(false);
      ui.clgSettingsToggleBtn?.focus();
    }
    if (event.key === "Escape" && !ui.koyaModelMaintenanceCard.hidden) {
      setKoyaModelMaintenanceVisibility(false);
      ui.koyaModelToggleBtn.focus();
    }
    if (event.key === "Escape" && !ui.nyxModelMaintenanceCard.hidden) {
      setNyxModelMaintenanceVisibility(false);
      ui.nyxModelToggleBtn.focus();
    }
    if (event.key === "Escape" && !ui.shipmentSourceMaintenanceCard.hidden) {
      setShipmentSourceMaintenanceVisibility(false);
      ui.shipmentSourceToggleBtn.focus();
    }
  });
}

// 【用途】頁面載入時依後端設定的固定路徑自動載入 Excel，不需使用者手動上傳
async function loadCustomSourceData(file = null) {
  state.customSourceData = [];
  try {
    const entries = (await getShipmentSourcesByApi()).entries || [];
    state.shipmentSourceEntries = entries;
    const sources = entries.filter((entry) => (entry.is_custom || entry.key === "dcg") && entry.search_customer !== "deg");
    // ponytail: 每來源各讀一次總表；來源多且載入慢時改為批次讀取。
    const loaded = await Promise.allSettled(sources.map(async (entry) => {
      const result = file ? await parseExcelByApi({ customer: "deg", sheetName: entry.label, parseRules: ["trim"], file }) : await loadSourceExcelByApi(entry.key);
      if (entry.work_order_column && result.rows?.length && !Object.keys(result.rows[0]).some((key) => normalizeText(key) === normalizeText(entry.work_order_column))) throw new Error(`搜尋欄位不存在：${entry.work_order_column}`);
      return result;
    }));
    loaded.forEach((outcome, index) => {
      const entry = sources[index];
      if (outcome.status === "fulfilled") {
        state.customSourceData.push({ key: entry.key, label: entry.label, column: entry.work_order_column || outcome.value.resolved_columns?.WORK_ORDER || null, rows: outcome.value.rows || [] });
      } else {
        showToast(`${entry.label}搜尋資料未載入：${getSafeErrorMessage(outcome.reason)}`, "error");
      }
    });
  } catch (error) {
    showToast(`自訂來源搜尋載入失敗：${getSafeErrorMessage(error)}`, "error");
  }
  try {
    const result = file
      ? await parseExcelByApi({ customer: "fzg", sheetName: "勤誠出貨", parseRules: ["trim"], file })
      : await loadDefaultExcelByApi("fzg");
    const headers = Object.keys(result.rows?.[0] || {});
    const column = headers.find((name) => ["DDC MO", "工單", "工單號", "工單號碼", "MO"].includes(String(name).trim())) || null;
    if (!column && result.rows?.length) throw new Error("勤誠出貨工作表缺少工單欄位");
    state.customSourceData.push({ key: "fzg", label: "勤誠", column, rows: result.rows || [] });
  } catch (error) {
    showToast(`勤誠工單資料未載入：${getSafeErrorMessage(error)}`, "error");
  }
}

async function autoRestoreExcelData() {
  await loadCustomSourceData();
  const customers = ["yingbang", "lunfei", "bng", "chg", "hmg", "clg", "deg"];
  const results = await Promise.allSettled(
    customers.map((key) => loadDefaultExcelByApi(key))
  );

  const statusMap = {
    deg:      { state: "degRowData" },
    yingbang: { state: "yingbangRowData", setSearch: true },
    lunfei:   { state: "lunfeiRowData",   input: "lunfeiSearchInput", btn: "lunfeiQueryBtn" },
    bng:      { state: "bngRowData",      input: "bngSearchInput",    btn: "bngQueryBtn" },
    chg:      { state: "chgRowData",      input: "chgSearchInput",    btn: "chgQueryBtn" },
    hmg:      { state: "hmgRowData",      input: "hmgSearchInput",    btn: "hmgQueryBtn" },
    clg:      { state: "clgRowData",      input: "clgSearchInput",    btn: "clgQueryBtn" },
  };

  const restored = [];
  const failed = [];
  state.degRowData = [];
  state.degWorkOrderColumn = null;
  setDegGeneratorVisible(false);

  customers.forEach((key, index) => {
    const outcome = results[index];
    const cfg = statusMap[key];
    if (outcome.status === "fulfilled") {
      if (key === "deg") state.degWorkOrderColumn = outcome.value?.resolved_columns?.WORK_ORDER || null;
      const rows = outcome.value?.rows;
      if (Array.isArray(rows) && rows.length > 0) {
        if (key === "chg") {
          setChgShipmentRows(rows);
        } else {
          state[cfg.state] = rows;
        }
        restored.push(`${key} ${rows.length} 筆`);
      }
    } else {
      failed.push(key);
      if (key === "deg") showToast(`泉影搜尋資料未載入：${getSafeErrorMessage(outcome.reason)}`, "error");
    }
  });

  try {
    await ensureMonthlyReferencesFromKoyaRows();
  } catch (error) {
    showToast(`月份自動帶入失敗：${getSafeErrorMessage(error)}`, "error");
  }

  // 更新 UI 啟用狀態
  setSearchEnabled(state.yingbangRowData.length > 0);
  ["lunfei", "bng", "chg", "hmg", "clg"].forEach((key) => {
    const cfg = statusMap[key];
    if (cfg.input) ui[cfg.input].disabled = state[cfg.state].length === 0;
    if (cfg.btn)   ui[cfg.btn].disabled   = state[cfg.state].length === 0;
  });

  if (restored.length > 0) {
    updateStatus(ui, `已自動載入 Excel：${restored.join("、")}`);
  } else {
    updateStatus(ui, "自動載入失敗，請手動上傳 Excel。", true);
  }
}

const masterDataMaintenance = createMasterDataMaintenance({
  ui,
  state,
  customers,
  homeRuntime,
  setButtonLoading,
  scrollToElement,
  getSafeErrorMessage,
  setHomeExportEnabled,
  updateHomeStatus
});
const {
  ensureMonthlyReferencesFromKoyaRows,
  loadKoyaModelEntries,
  loadMonthlyReferenceEntries,
  loadNyxModelEntries,
  setChgShipmentRows,
  setKoyaModelMaintenanceVisibility,
  setNyxModelMaintenanceVisibility
} = masterDataMaintenance;
const vecowLinkController = createVecowLinkController(showToast);
const sourceMaintenance = createSourceMaintenance({
  ui,
  autoRestoreExcelData,
  getSafeErrorMessage,
  scrollToElement,
  setButtonLoading,
  setKoyaModelMaintenanceVisibility,
  setNyxModelMaintenanceVisibility,
  vecowLinkController
});
const {
  setMaintenanceEntriesVisibility,
  setShipmentSourceMaintenanceVisibility,
  syncShipmentRefreshStatus
} = sourceMaintenance;

async function main() {
  updateStatus(ui, "骨架初始化完成。");
  applyTheme(readStorageItem(THEME_STORAGE_KEY, "dark"));
  hydrateEditableCustomerCustomTabs();
  renderHomePrintNoticeBoard();
  updateTabUi();
  applyCustomerProfileUi();
  initEvents();
  setHomeCustomerTheme("");
  syncHomeSearchModeUi();
  setClgSettingsVisibility(false);
  setKoyaModelMaintenanceVisibility(false);
  setNyxModelMaintenanceVisibility(false);
  setShipmentSourceMaintenanceVisibility(false);
  setMaintenanceEntriesVisibility(false);
  void vecowLinkController.load();
  refreshClgPlannedSerialPreview();
  setSearchEnabled(false);
  setExportEnabled(false);
  setHomeExportEnabled(false);
  setHomeBngPrintEnabled(false);
  try {
    await loadPrintNoticeBoard();
  } catch (error) {
    updateHomeStatus(`已列印公告載入失敗：${getSafeErrorMessage(error)}`, true);
  }
  try {
    await loadKoyaModelEntries();
  } catch (error) {
    const message = `KOYA 型號主檔載入失敗：${getSafeErrorMessage(error)}`;
    updateStatus({ status: ui.koyaModelStatus }, message, true);
    showToast(message, "error");
  }
  try {
    await loadNyxModelEntries();
  } catch (error) {
    const message = `NYX 型號主檔載入失敗：${getSafeErrorMessage(error)}`;
    updateStatus({ status: ui.nyxModelStatus }, message, true);
    showToast(message, "error");
  }
  try {
    await Promise.all([
      loadMonthlyReferenceEntries("koya"),
      loadMonthlyReferenceEntries("nyx")
    ]);
  } catch (error) {
    const message = `月份對照主檔載入失敗：${getSafeErrorMessage(error)}`;
    showToast(message, "error");
  }
  await autoRestoreExcelData();
  await syncShipmentRefreshStatus(false);
}

main();
