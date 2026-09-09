import { CONFIG } from "../config.js";
import { escapeHtml, escapeHtmlAttribute } from "./utils.js";
import { getCustomerProfileByKey } from "./customers.js";
import { splitBngModelAndRemark } from "./bngReceipt.js";
import { replaceChildrenFromTrustedTemplate } from "./dom.js";

function renderPreviewItem(label, value, copyable) {
  const escapedLabel = escapeHtml(label);
  const escapedValue = escapeHtml(value);
  const copyButton = copyable
    ? `<button class="copy-btn" data-copy-value="${escapedValue}">複製</button>`
    : "";
  return `
    <div class="preview-item">
      <p class="preview-label">${escapedLabel}</p>
      <p class="preview-value">${escapedValue}</p>
      ${copyButton}
    </div>
  `;
}

function getSheetHeaders(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return [];
  }
  const ordered = [];
  const set = new Set();
  rows.forEach((row) => {
    Object.keys(row).forEach((key) => {
      if (!set.has(key)) {
        set.add(key);
        ordered.push(key);
      }
    });
  });
  return ordered;
}

function renderSheetContentPane(rows) {
  if (!Array.isArray(rows) || rows.length === 0) {
    return `<div class="error-box">尚無表格資料，請先讀取來源檔。</div>`;
  }

  const headers = getSheetHeaders(rows);
  const headerHtml = headers.map((key) => `<th>${escapeHtml(key)}</th>`).join("");
  const bodyHtml = rows
    .map((row) => {
      const cells = headers
        .map((key) => {
          const value = String(row[key] ?? "");
          return `<td class="copyable-cell" data-copy-value="${escapeHtmlAttribute(value)}">${escapeHtml(value)}</td>`;
        })
        .join("");
      return `<tr>${cells}</tr>`;
    })
    .join("");

  return `
    <p class="sheet-pane-meta">已載入 ${rows.length} 筆，點選任一儲存格可複製內容。</p>
    <div class="sheet-table-wrap">
      <table class="sheet-table">
        <thead><tr>${headerHtml}</tr></thead>
        <tbody>${bodyHtml}</tbody>
      </table>
    </div>
  `;
}

// 【用途】MO 恰好命中兩筆時，在預覽首頁直接並列完整來源資料供人工核對。
function renderDuplicateMoRows(rows) {
  if (!Array.isArray(rows) || rows.length !== 2) {
    return "";
  }
  return `
    <section class="duplicate-mo-results" aria-label="MO 命中兩筆資料">
      <p class="duplicate-hit-message">⚠ 此 MO 命中 2 筆資料，請確認後再進行後續操作。</p>
      ${renderSheetContentPane(rows)}
    </section>
  `;
}

function renderHistoryPane(workOrderHistory, clearButtonId = "btn-clear-history") {
  const items = workOrderHistory
    .map((record) => `<li>${escapeHtml(record)}</li>`)
    .join("");
  return `
    <ol class="history-list">${items}</ol>
    <div class="history-actions">
      <button type="button" class="btn-secondary" id="${escapeHtmlAttribute(clearButtonId)}">清空歷史序號</button>
    </div>
  `;
}

// 【用途】以單一資料驅動模板組裝客戶成功預覽，集中動態內容編碼與共用頁籤結構。
function renderCustomerSearchSuccessLayout(panelElement, options) {
  if (!panelElement) {
    return;
  }
  const {
    customerKey,
    title,
    queryLabel,
    query,
    matchCount,
    printNotice,
    headlineHtml,
    previewHtml,
    rowData,
    generationHistory,
    clearHistoryButtonId,
    matchedRows
  } = options;
  const hasHistory = Array.isArray(generationHistory) && generationHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs(customerKey);
  replaceChildrenFromTrustedTemplate(panelElement, `
    ${renderTitleWithHelp(title, "preview-panel")}
    <p${Number(matchCount) === 2 ? ' class="duplicate-hit-message"' : ""}>查詢${escapeHtml(queryLabel)}：${escapeHtml(query)}（命中 ${Number(matchCount) || 0} 筆${Number(matchCount) === 2 ? "，下方顯示兩筆資料；後續操作預設使用第 1 筆" : "，預設取第 1 筆"}）</p>
    ${renderDuplicateMoRows(matchedRows)}
    ${renderPrintedToggle(printNotice || {})}
    ${headlineHtml}
    ${renderPreviewTabs(customerKey, hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">${previewHtml}</div>
    <div class="preview-pane" data-pane="sheet">${renderSheetContentPane(rowData)}</div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">${renderHistoryPane(generationHistory, clearHistoryButtonId)}</div>` : ""}
    ${renderCustomPreviewPanes(customerKey, customTabs)}
  `);
}

function normalizeCustomTabId(rawId, index) {
  const base = String(rawId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = base || `tab-${index + 1}`;
  return `custom-${suffix}`;
}

// 【用途】將設定中的舊版 HTML 轉成不可執行的純文字內容。
function customTabHtmlToText(value) {
  const parsed = new DOMParser().parseFromString(String(value ?? ""), "text/html");
  parsed.body.querySelectorAll("br").forEach((node) => node.replaceWith("\n"));
  return String(parsed.body.textContent ?? "").trim();
}

function getConfiguredPreviewTabs(customerKey) {
  const key = String(customerKey ?? "").trim();
  const profile = getCustomerProfileByKey(key) || {};
  const tabs = [];
  const usedIds = new Set();

  const fixedTabs = Array.isArray(profile.previewCustomTabs) ? profile.previewCustomTabs : [];
  const runtimeTabs = Array.isArray(profile.extraPreviewTabs) ? profile.extraPreviewTabs : [];

  fixedTabs.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const tabId = normalizeCustomTabId(item.id || item.key || item.tabId, index);
    if (usedIds.has(tabId)) {
      return;
    }
    const label = String(item.label || item.name || item.tabName || `自訂頁籤${index + 1}`).trim();
    const html = String(item.html || item.contentHtml || "").trim();
    const text = String(item.text || item.contentText || "").trim() || customTabHtmlToText(html);
    if (!label || (!html && !text)) {
      return;
    }
    usedIds.add(tabId);
    tabs.push({
      tabId,
      label,
      text,
      removable: false
    });
  });

  runtimeTabs.forEach((item, index) => {
    if (!item || typeof item !== "object") {
      return;
    }
    const tabId = normalizeCustomTabId(item.id || item.key || item.tabId, fixedTabs.length + index);
    if (usedIds.has(tabId)) {
      return;
    }
    const label = String(item.label || item.name || item.tabName || `自訂頁籤${index + 1}`).trim();
    const text = String(item.text || item.contentText || "").trim();
    if (!label) {
      return;
    }
    usedIds.add(tabId);
    tabs.push({
      tabId,
      label,
      text,
      itemId: String(item.id || item.key || item.tabId || "").trim(),
      removable: true
    });
  });

  const legacyHtml = String(profile.previewNoteHtml ?? "").trim();
  const legacyText = String(profile.previewNote ?? "").trim();
  const isPlaceholder = /可在\s*index\.html\s*的\s*CUSTOMERS\./.test(legacyText);
  if (legacyHtml || (legacyText && !isPlaceholder)) {
    const legacyTabId = normalizeCustomTabId("note", tabs.length);
    if (!usedIds.has(legacyTabId)) {
      usedIds.add(legacyTabId);
      tabs.push({
        tabId: legacyTabId,
        label: String(profile.previewNoteTabLabel || "備註").trim() || "備註",
        text: legacyText || customTabHtmlToText(legacyHtml),
        removable: false
      });
    }
  }

  return tabs;
}

function renderPreviewTabs(customerKey, hasHistory, customTabs) {
  const customTabButtons = (customTabs || [])
    .map((tab) => `<button type="button" class="preview-tab preview-tab-custom" data-tab="${escapeHtmlAttribute(tab.tabId)}">${escapeHtml(tab.label)}</button>`)
    .join("");
  return `
    <div class="preview-tabs-row">
      <div class="preview-tabs">
        <button type="button" class="preview-tab active" data-tab="preview">預覽</button>
        <button type="button" class="preview-tab" data-tab="sheet">表格內容</button>
        ${hasHistory ? '<button type="button" class="preview-tab" data-tab="history">生成歷史</button>' : ""}
        ${customTabButtons}
      </div>
      <button type="button" class="preview-tab-add" data-action="add-custom-tab" data-customer-key="${escapeHtmlAttribute(customerKey)}">+ 新增頁籤</button>
    </div>
  `;
}

function renderCustomPreviewPanes(customerKey, customTabs) {
  if (!Array.isArray(customTabs) || customTabs.length === 0) {
    return "";
  }
  return customTabs
    .map((tab) => {
      const textContent = tab.text
        ? `<div class="preview-custom-text">${escapeHtml(tab.text).replace(/\n/g, "<br>")}</div>`
        : "";
      return `
        <div class="preview-pane preview-pane-custom" data-pane="${escapeHtmlAttribute(tab.tabId)}">
          ${tab.removable ? `<div class="preview-custom-actions">
            <button
              type="button"
              class="btn-secondary preview-custom-remove-btn"
              data-action="remove-custom-tab"
              data-customer-key="${escapeHtmlAttribute(customerKey)}"
              data-tab-id="${escapeHtmlAttribute(tab.tabId)}"
              data-tab-item-id="${escapeHtmlAttribute(tab.itemId || "")}"
            >移除頁籤</button>
          </div>` : ""}
          ${tab.removable
            ? `<div
                class="preview-custom-editor"
                contenteditable="plaintext-only"
                data-action="edit-custom-tab"
                data-customer-key="${escapeHtmlAttribute(customerKey)}"
                data-tab-id="${escapeHtmlAttribute(tab.tabId)}"
                data-tab-item-id="${escapeHtmlAttribute(tab.itemId || "")}"
                data-placeholder="請在這裡編輯備註內容"
              >${textContent}</div>`
            : textContent}
        </div>
      `;
    })
    .join("");
}

function renderPreviewGroup(title, items) {
  return `
    <section class="card">
      <h3 class="section-title">${escapeHtml(title)}</h3>
      <div class="preview-grid">
        ${items.join("")}
      </div>
    </section>
  `;
}

function renderBngPreviewGroup(title, items) {
  return `
    <section class="bng-preview-group">
      <h3 class="section-title">${escapeHtml(title)}</h3>
      <div class="preview-grid bng-preview-grid">
        ${items.join("")}
      </div>
    </section>
  `;
}

function formatBngRangeDisplay(value) {
  const text = String(value ?? "").trim();
  if (!text) {
    return "";
  }
  return text.replace(/\s*~\s*/g, " → ");
}

function parsePositiveNumber(value) {
  const parsed = Number(String(value ?? "").trim());
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return null;
  }
  return parsed;
}

function createBngStatus(isOk, okText = "✓", warnText = "⚠") {
  return {
    text: isOk ? okText : warnText,
    tone: isOk ? "ok" : "warn"
  };
}

function renderBngStatusBadge(status) {
  if (!status) {
    return "";
  }
  return `<span class="bng-row-status bng-row-status-${escapeHtmlAttribute(status.tone)}">${escapeHtml(status.text)}</span>`;
}

function buildBngQuantityStatuses(qty, macQty, macBoardQty) {
  const qtyNumber = parsePositiveNumber(qty);
  const macQtyNumber = parsePositiveNumber(macQty);
  const macBoardQtyNumber = parsePositiveNumber(macBoardQty);
  const hasConsistencyBasis = qtyNumber !== null && macQtyNumber !== null && macBoardQtyNumber !== null;
  const isConsistent = !hasConsistencyBasis || macQtyNumber === qtyNumber * macBoardQtyNumber;

  return {
    qty: createBngStatus(qtyNumber !== null),
    macQty: createBngStatus(macQtyNumber !== null && isConsistent),
    macBoardQty: createBngStatus(macBoardQtyNumber !== null && isConsistent)
  };
}

function renderBngCopyRow({ label, value, copyValue, monospace = false, status = null }) {
  const displayValue = String(value ?? "").trim();
  const rawCopyValue = String(copyValue ?? displayValue).trim();
  const valueClass = monospace ? "bng-copy-value bng-copy-value-mono" : "bng-copy-value";
  return `
    <div class="bng-copy-row">
      <div class="bng-copy-row-main">
        <p class="bng-copy-label">${escapeHtml(label)}</p>
        <p class="${valueClass}">${escapeHtml(displayValue || "-")}</p>
      </div>
      <div class="bng-copy-row-actions">
        ${renderBngStatusBadge(status)}
        <button
          type="button"
          class="copy-btn bng-copy-btn"
          data-copy-value="${escapeHtmlAttribute(rawCopyValue)}"
          data-copied-text="已複製 ✓"
          title="複製 ${escapeHtmlAttribute(label)}"
          aria-label="複製 ${escapeHtmlAttribute(label)}"
        >複製</button>
      </div>
    </div>
  `;
}

function renderBngCopySection(title, rows) {
  const visibleRows = rows.filter((row) => row && String(row.value ?? "").trim());
  const sectionCopyText = visibleRows
    .map((row) => `${String(row.label ?? "").trim()}：${String(row.copyValue ?? row.value ?? "").trim()}`)
    .join("\n");
  const copyAllButton = visibleRows.length > 0
    ? `<button
        type="button"
        class="copy-btn bng-copy-all-btn"
        data-copy-value="${escapeHtmlAttribute(sectionCopyText)}"
        data-copied-text="已複製 ✓"
      >全部複製</button>`
    : "";
  const bodyHtml = visibleRows.length > 0
    ? visibleRows.map((row) => renderBngCopyRow(row)).join("")
    : `<p class="preview-empty-note">此分區無可顯示資料。</p>`;
  return `
    <section class="bng-preview-group bng-copy-section">
      <div class="bng-copy-section-head">
        <h3 class="section-title">${escapeHtml(title)}</h3>
        ${copyAllButton}
      </div>
      <div class="bng-copy-list">
        ${bodyHtml}
      </div>
    </section>
  `;
}

function formatBngModelForBox(modelValue) {
  return splitBngModelAndRemark(modelValue).model;
}

export function renderTitleWithHelp(title, topic) {
  const titleText = String(title ?? "").trim();
  const topicText = String(topic ?? "").trim();
  const safeTitle = escapeHtml(titleText);
  const safeTopic = escapeHtml(topicText);
  const safeAriaLabel = escapeHtml(`${titleText || "區塊"}使用說明`);
  if (!topicText) {
    return `<h2>${safeTitle}</h2>`;
  }
  return `
    <h2 class="title-with-help">
      ${safeTitle}
      <button
        type="button"
        class="help-inline-trigger"
        data-help-topic="${safeTopic}"
        aria-label="${safeAriaLabel}"
        title="查看使用說明"
      >ⅰ</button>
    </h2>
  `;
}

function renderPrintedToggle(args) {
  const {
    customerKey,
    customerLabel,
    workOrderLabel,
    workOrderValue,
    checked
  } = args;
  const normalizedValue = String(workOrderValue ?? "").trim();
  if (!customerKey || !normalizedValue) {
    return "";
  }
  return `
    <label class="printed-toggle">
      <input
        type="checkbox"
        class="printed-toggle-input"
        data-role="printed-toggle"
        data-customer-key="${escapeHtmlAttribute(customerKey)}"
        data-customer-label="${escapeHtmlAttribute(customerLabel)}"
        data-workorder-label="${escapeHtmlAttribute(workOrderLabel)}"
        data-workorder-value="${escapeHtmlAttribute(normalizedValue)}"
        ${checked ? "checked" : ""}
      >
      <span>完成列印後勾選，首頁公告欄將顯示「${escapeHtml(customerLabel)}-${escapeHtml(normalizedValue)} 已列印」</span>
    </label>
  `;
}

export function renderSearchNotFound(ui, query) {
  replaceChildrenFromTrustedTemplate(ui.previewPanel, `
    ${renderTitleWithHelp("預覽窗格", "preview-panel")}
    <div class="error-box">找不到工單：${escapeHtml(query)}</div>
  `);
}

export function renderSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    rowData,
    resolveColumnKey,
    previewSN,
    datecode,
    resolvedQty,
    workOrderHistory
  } = args;
  const ddcPartNo = row[resolveColumnKey(row, "DDC_PART_NO") || CONFIG.COLUMNS.DDC_PART_NO] || "";
  const productName = row[resolveColumnKey(row, "PRODUCT_NAME") || CONFIG.COLUMNS.PRODUCT_NAME] || "";
  const workOrder = row[resolveColumnKey(row, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] || "";
  const purchaseOrder = row[resolveColumnKey(row, "PURCHASE_ORDER") || CONFIG.COLUMNS.PURCHASE_ORDER] || "";
  const pn = row[resolveColumnKey(row, "PN") || CONFIG.COLUMNS.PN] || "";
  const qty = resolvedQty || row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY] || "";
  const hasHistory = Array.isArray(workOrderHistory) && workOrderHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs("yingbang");

  replaceChildrenFromTrustedTemplate(ui.previewPanel, `
    ${renderTitleWithHelp("預覽窗格", "preview-panel")}
    <p>查詢工單：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
    ${renderPrintedToggle(args.printNotice || {})}
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(ddcPartNo)}</p>
      <p class="preview-subtitle">${escapeHtml(productName)}</p>
    </div>
    ${renderPreviewTabs("yingbang", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      <div class="preview-grid">
        ${renderPreviewItem("SN（第一筆預覽）", previewSN, true)}
        ${renderPreviewItem("Datecode", datecode, true)}
        ${renderPreviewItem("工單號", workOrder, true)}
        ${renderPreviewItem("採單號碼", purchaseOrder, true)}
        ${renderPreviewItem("PN", pn, true)}
        ${renderPreviewItem("QTY", qty, true)}
      </div>
    </div>
    <div class="preview-pane" data-pane="sheet">
      ${renderSheetContentPane(rowData)}
    </div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">${renderHistoryPane(workOrderHistory)}</div>` : ""}
    ${renderCustomPreviewPanes("yingbang", customTabs)}
  `);
}

export function renderLunfeiSearchNotFound(ui, query) {
  if (!ui.lunfeiPreviewPanel) {
    return;
  }
  replaceChildrenFromTrustedTemplate(ui.lunfeiPreviewPanel, `
    ${renderTitleWithHelp("倫飛預覽窗格", "preview-panel")}
    <div class="error-box">找不到 MO：${escapeHtml(query)}</div>
  `);
}

export function renderLunfeiSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    resolveColumnKey,
    previewSN,
    rowData,
    generationHistory,
    resolvedQty
  } = args;
  const model = row[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
  const workOrder = row[resolveColumnKey(row, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] || "";
  const pn = row[resolveColumnKey(row, "PN") || CONFIG.COLUMNS.PN] || "";
  const processWo = row[resolveColumnKey(row, "PROCESS_WO") || CONFIG.COLUMNS.PROCESS_WO] || "";
  const pcba = row[resolveColumnKey(row, "PCBA") || CONFIG.COLUMNS.PCBA] || "";
  const qty = resolvedQty || row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY] || "";
  renderCustomerSearchSuccessLayout(ui.lunfeiPreviewPanel, {
    customerKey: "lunfei",
    title: "倫飛預覽窗格",
    queryLabel: " MO",
    query,
    matchCount,
    printNotice: args.printNotice,
    headlineHtml: `<div class="preview-headline"><p class="preview-title">Model：${escapeHtml(model)}</p></div>`,
    previewHtml: `
      <div class="preview-grid">
        ${renderPreviewItem("SN（第一筆預覽）", previewSN, true)}
        ${renderPreviewItem("工單", workOrder, true)}
        ${renderPreviewItem("P/N", pn, true)}
        ${renderPreviewItem("加工WO#", processWo, true)}
        ${renderPreviewItem("對應PCBA", pcba, true)}
        ${renderPreviewItem("Q'ty", qty, true)}
      </div>
    `,
    rowData,
    generationHistory,
    clearHistoryButtonId: "btn-clear-history-lunfei",
    matchedRows: args.matchedRows
  });
}

export function renderBngSearchNotFound(ui, query) {
  if (!ui.bngPreviewPanel) {
    return;
  }
  replaceChildrenFromTrustedTemplate(ui.bngPreviewPanel, `
    ${renderTitleWithHelp("超恩預覽窗格", "preview-panel")}
    <div class="error-box">查無對應資料，請確認 MO 是否正確（${escapeHtml(query)}）</div>
  `);
}

export function renderBngSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    resolveColumnKey,
    rowData,
    generationHistory,
    normalizedRanges
  } = args;
  const date = row[resolveColumnKey(row, "DATE") || CONFIG.COLUMNS.DATE] || "";
  const source = String(row[resolveColumnKey(row, "SOURCE") || CONFIG.COLUMNS.SOURCE] || "").trim();
  const workOrder = row[resolveColumnKey(row, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] || "";
  const model = row[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
  const partNo = row[resolveColumnKey(row, "PART_NO") || CONFIG.COLUMNS.PART_NO] || "";
  const qty = row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY] || "";
  const macRange = normalizedRanges?.mac || row[resolveColumnKey(row, "MAC_RANGE") || CONFIG.COLUMNS.MAC_RANGE] || "";
  const macQty = row[resolveColumnKey(row, "MAC_QTY") || CONFIG.COLUMNS.MAC_QTY] || "";
  const macBoardQty = row[resolveColumnKey(row, "MAC_BOARD_QTY") || CONFIG.COLUMNS.MAC_BOARD_QTY] || "";
  const snRange = normalizedRanges?.sn || row[resolveColumnKey(row, "SN_RANGE") || CONFIG.COLUMNS.SN_RANGE] || "";
  const uuidRange = normalizedRanges?.uuid || row[resolveColumnKey(row, "UUID_RANGE") || CONFIG.COLUMNS.UUID_RANGE] || "";
  const bios = row[resolveColumnKey(row, "BIOS") || CONFIG.COLUMNS.BIOS] || "";
  const fw = row[resolveColumnKey(row, "FW") || CONFIG.COLUMNS.FW] || "";
  const snRangeDisplay = formatBngRangeDisplay(snRange);
  const macRangeDisplay = formatBngRangeDisplay(macRange);
  const uuidRangeDisplay = formatBngRangeDisplay(uuidRange);
  const boxModel = formatBngModelForBox(model);
  const quantityStatuses = buildBngQuantityStatuses(qty, macQty, macBoardQty);
  const sourceBadge = source
    ? `<span class="bng-source-badge">來源：${escapeHtml(source)}</span>`
    : "";
  const snGroup = renderBngCopySection("SN 分配", [
    {
      label: "內裝區間",
      value: snRangeDisplay,
      copyValue: snRange,
      monospace: true
    },
    {
      label: "生產數量",
      value: qty,
      copyValue: qty,
      monospace: true,
      status: quantityStatuses.qty
    }
  ]);
  const macGroup = renderBngCopySection("MAC 分配", [
    {
      label: "MAC Address",
      value: macRangeDisplay,
      copyValue: macRange,
      monospace: true
    },
    {
      label: "MAC數量",
      value: macQty,
      copyValue: macQty,
      monospace: true,
      status: quantityStatuses.macQty
    },
    {
      label: "MAC板子用量數量",
      value: macBoardQty,
      copyValue: macBoardQty,
      monospace: true,
      status: quantityStatuses.macBoardQty
    }
  ]);
  const uuidGroup = renderBngCopySection("UUID 分配", [
    {
      label: "UUID區間",
      value: uuidRangeDisplay,
      copyValue: uuidRange,
      monospace: true
    },
    {
      label: "生產數量",
      value: qty,
      copyValue: qty,
      monospace: true,
      status: quantityStatuses.qty
    }
  ]);
  const fwBiosGroup = renderBngCopySection("FW & BIOS", [
    {
      label: "新版BIOS(以此為主)",
      value: bios,
      copyValue: bios,
      monospace: true
    },
    {
      label: "IGN FW版本",
      value: fw,
      copyValue: fw,
      monospace: true
    }
  ]);
  const boxGroup = renderBngCopySection("BOX 資訊", [
    {
      label: "工單",
      value: workOrder,
      copyValue: workOrder,
      monospace: true
    },
    {
      label: "機種名稱",
      value: boxModel,
      copyValue: boxModel
    },
    {
      label: "機種料號",
      value: partNo,
      copyValue: partNo,
      monospace: true
    },
    {
      label: "序號區間",
      value: snRangeDisplay,
      copyValue: snRange,
      monospace: true
    },
    {
      label: "Model",
      value: boxModel,
      copyValue: boxModel
    }
  ]);

  renderCustomerSearchSuccessLayout(ui.bngPreviewPanel, {
    customerKey: "bng",
    title: "超恩預覽窗格",
    queryLabel: " MO",
    query,
    matchCount,
    printNotice: args.printNotice,
    headlineHtml: `<div class="preview-headline">
      <div class="preview-title-row">
        <p class="preview-title">${escapeHtml(model)}</p>
        ${sourceBadge}
      </div>
      <p class="preview-subtitle">機種料號：${escapeHtml(partNo)}｜日期：${escapeHtml(date)}</p>
    </div>`,
    previewHtml: `
      <div class="bng-preview-groups">
        ${snGroup}
        ${macGroup}
        ${uuidGroup}
        ${fwBiosGroup}
        ${boxGroup}
      </div>
    `,
    rowData,
    generationHistory,
    clearHistoryButtonId: "btn-clear-history-bng",
    matchedRows: args.matchedRows
  });
}

export function renderChgSearchNotFound(ui, query) {
  if (!ui.chgPreviewPanel) {
    return;
  }
  replaceChildrenFromTrustedTemplate(ui.chgPreviewPanel, `
    ${renderTitleWithHelp("KOYA 預覽窗格", "preview-panel")}
    <div class="error-box">查無對應資料，請確認工單是否正確（${escapeHtml(query)}）</div>
  `);
}

export function renderChgSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    resolveColumnKey,
    rowData,
    generationHistory
  } = args;
  const workOrder = row[resolveColumnKey(row, "WORK_ORDER") || CONFIG.COLUMNS.WORK_ORDER] || "";
  const workOrderMonth = row[resolveColumnKey(row, "WORK_ORDER_MONTH") || CONFIG.COLUMNS.WORK_ORDER_MONTH] || "";
  const model = row[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
  const pn = row[resolveColumnKey(row, "PN") || CONFIG.COLUMNS.PN] || "";
  const po = row[resolveColumnKey(row, "PO") || CONFIG.COLUMNS.PO] || "";
  const batch = row[resolveColumnKey(row, "BATCH") || CONFIG.COLUMNS.BATCH] || "";
  const qty = row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY] || "";
  const boxQty = row[resolveColumnKey(row, "BOX_QTY") || CONFIG.COLUMNS.BOX_QTY] || "";
  const demand = row[resolveColumnKey(row, "DEMAND") || CONFIG.COLUMNS.DEMAND] || "";
  const tailQty = row[resolveColumnKey(row, "TAIL_QTY") || CONFIG.COLUMNS.TAIL_QTY] || "";
  const subtitleParts = [
    `工單：${escapeHtml(workOrder)}`,
    `PO：${escapeHtml(po)}`,
    `批量：${escapeHtml(batch)}`
  ];
  if (String(workOrderMonth).trim()) {
    subtitleParts.push(`工單月份：${escapeHtml(workOrderMonth)}`);
  }

  const labelGroup = renderBngCopySection("Label 分配", [
    {
      label: "PN",
      value: pn,
      copyValue: pn,
      monospace: true
    },
    {
      label: "小張貼紙",
      value: qty,
      copyValue: qty,
      monospace: true
    }
  ]);
  const boxLabelGroup = renderBngCopySection("Box Label 分配", [
    {
      label: "滿箱數量",
      value: boxQty,
      copyValue: boxQty,
      monospace: true
    },
    {
      label: "需求",
      value: demand,
      copyValue: demand,
      monospace: true
    },
    {
      label: "尾數數量",
      value: tailQty,
      copyValue: tailQty,
      monospace: true
    }
  ]);

  renderCustomerSearchSuccessLayout(ui.chgPreviewPanel, {
    customerKey: "chg",
    title: "KOYA 預覽窗格",
    queryLabel: "工單",
    query,
    matchCount,
    printNotice: args.printNotice,
    headlineHtml: `<div class="preview-headline">
      <p class="preview-title">${escapeHtml(model)}</p>
      <p class="preview-subtitle">${subtitleParts.join("｜")}</p>
    </div>`,
    previewHtml: `
      ${labelGroup}
      ${boxLabelGroup}
    `,
    rowData,
    generationHistory,
    clearHistoryButtonId: "btn-clear-history-chg"
  });
}

export function renderHmgSearchNotFound(ui, query) {
  if (!ui.hmgPreviewPanel) {
    return;
  }
  replaceChildrenFromTrustedTemplate(ui.hmgPreviewPanel, `
    ${renderTitleWithHelp("赫星 預覽窗格", "preview-panel")}
    <div class="error-box">查無對應機種，請確認 Model 關鍵字是否正確（${escapeHtml(query)}）</div>
  `);
}

export function renderHmgSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    resolveColumnKey,
    rowData,
    generationHistory
  } = args;
  const model = row[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
  const pn = row[resolveColumnKey(row, "PN") || CONFIG.COLUMNS.PN] || "";
  const ean = row[resolveColumnKey(row, "EAN") || CONFIG.COLUMNS.EAN] || "";
  const pcba = row[resolveColumnKey(row, "PCBA") || CONFIG.COLUMNS.PCBA] || "";
  const hasHistory = Array.isArray(generationHistory) && generationHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs("hmg");
  const previewItems = [
    { label: "Model", value: model, copyable: true },
    { label: "PN", value: pn, copyable: true },
    { label: "EAN Code", value: ean, copyable: true },
    { label: "PCBA", value: pcba, copyable: true }
  ].filter((item) => String(item.value ?? "").trim() !== "");
  const previewGridHtml = previewItems.length > 0
    ? previewItems.map((item) => renderPreviewItem(item.label, item.value, item.copyable)).join("")
    : `<p class="preview-empty-note">目前可顯示欄位皆為空值。</p>`;

  replaceChildrenFromTrustedTemplate(ui.hmgPreviewPanel, `
    ${renderTitleWithHelp("赫星 預覽窗格", "preview-panel")}
    <p>查詢 Model：${escapeHtml(query)}（命中 ${matchCount} 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(model)}</p>
    </div>
    ${renderPreviewTabs("hmg", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      <div class="preview-grid">
        ${previewGridHtml}
      </div>
    </div>
    <div class="preview-pane" data-pane="sheet">
      ${renderSheetContentPane(rowData)}
    </div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">
      <ol class="history-list">${generationHistory.map((record) => `<li>${escapeHtml(record)}</li>`).join("")}</ol>
      <div class="history-actions">
        <button type="button" class="btn-secondary" id="btn-clear-history-hmg">清空歷史序號</button>
      </div>
    </div>` : ""}
    ${renderCustomPreviewPanes("hmg", customTabs)}
  `);
}

export function renderClgSearchNotFound(ui, query) {
  if (!ui.clgPreviewPanel) {
    return;
  }
  replaceChildrenFromTrustedTemplate(ui.clgPreviewPanel, `
    ${renderTitleWithHelp("Cubepilot 預覽窗格", "preview-panel")}
    <div class="error-box">查無對應機種，請確認機種名是否正確（${escapeHtml(query)}）</div>
  `);
}

export function renderClgSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    resolveColumnKey,
    rowData,
    generationHistory
  } = args;
  const model = row[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
  const qrCode = row[resolveColumnKey(row, "QRCODE") || CONFIG.COLUMNS.QRCODE] || "";
  const cubeSticker = row[resolveColumnKey(row, "CUBE_STICKER") || CONFIG.COLUMNS.CUBE_STICKER] || "";
  const note = row[resolveColumnKey(row, "NOTE") || CONFIG.COLUMNS.NOTE] || "";
  const hasHistory = Array.isArray(generationHistory) && generationHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs("clg");
  const previewItems = [
    { label: "機種名", value: model, copyable: true },
    { label: "小張QRCODE", value: qrCode, copyable: true },
    { label: "Cube測試用貼紙", value: cubeSticker, copyable: true },
    { label: "note", value: note, copyable: true }
  ].filter((item) => String(item.value ?? "").trim() !== "");
  const previewGridHtml = previewItems.length > 0
    ? previewItems.map((item) => renderPreviewItem(item.label, item.value, item.copyable)).join("")
    : `<p class="preview-empty-note">目前可顯示欄位皆為空值。</p>`;
  replaceChildrenFromTrustedTemplate(ui.clgPreviewPanel, `
    ${renderTitleWithHelp("Cubepilot 預覽窗格", "preview-panel")}
    <p>查詢機種名：${escapeHtml(query)}（命中 ${matchCount} 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(model)}</p>
    </div>
    ${renderPreviewTabs("clg", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      <div class="preview-grid">
        ${previewGridHtml}
      </div>
    </div>
    <div class="preview-pane" data-pane="sheet">
      ${renderSheetContentPane(rowData)}
    </div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">
      <ol class="history-list">${generationHistory.map((record) => `<li>${escapeHtml(record)}</li>`).join("")}</ol>
      <div class="history-actions">
        <button type="button" class="btn-secondary" id="btn-clear-history-clg">清空歷史序號</button>
      </div>
    </div>` : ""}
    ${renderCustomPreviewPanes("clg", customTabs)}
  `);
}
