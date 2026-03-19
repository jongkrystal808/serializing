import { CONFIG } from "../config.js";
import { escapeHtml } from "./utils.js";

// 【用途】使用舊版 document.execCommand('copy') 作為剪貼簿 fallback（支援非 HTTPS 情境）
function copyTextByExecCommand(value) {
  const textarea = document.createElement("textarea");
  textarea.value = String(value ?? "");
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
}

// 【用途】優先使用 Clipboard API，失敗時自動降級為 execCommand 複製
async function copyTextToClipboard(value) {
  const text = String(value ?? "");
  const canUseClipboardApi = Boolean(window.isSecureContext && navigator?.clipboard?.writeText);

  if (canUseClipboardApi) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Clipboard API 在權限被拒或瀏覽器限制時，改走舊版 fallback
    }
  }

  const copied = copyTextByExecCommand(text);
  if (!copied) {
    throw new Error("Clipboard write failed.");
  }
}

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
          return `<td class="copyable-cell" data-copy-value="${escapeHtml(value)}">${escapeHtml(value)}</td>`;
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

function renderHistoryPane(workOrderHistory) {
  const items = workOrderHistory
    .map((record) => `<li>${escapeHtml(record)}</li>`)
    .join("");
  return `
    <ol class="history-list">${items}</ol>
    <div class="history-actions">
      <button type="button" class="btn-secondary" id="btn-clear-history">清空歷史序號</button>
    </div>
  `;
}

// 【用途】將自訂頁籤 id 正規化為可安全放入 data-tab 的字串
function normalizeCustomTabId(rawId, index) {
  const base = String(rawId ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");
  const suffix = base || `tab-${index + 1}`;
  return `custom-${suffix}`;
}

// 【用途】由客戶設定解析自訂頁籤（支援標籤名稱與 HTML 內容）
function getConfiguredPreviewTabs(customerKey) {
  const key = String(customerKey ?? "").trim();
  const profile = window.CUSTOMERS?.[key] || {};
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
    const text = String(item.text || item.contentText || "").trim();
    if (!label || (!html && !text)) {
      return;
    }
    usedIds.add(tabId);
    tabs.push({
      tabId,
      label,
      html,
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
    const html = String(item.html || item.contentHtml || "").trim();
    const text = String(item.text || item.contentText || "").trim();
    if (!label) {
      return;
    }
    usedIds.add(tabId);
    tabs.push({
      tabId,
      label,
      html,
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
        html: legacyHtml,
        text: legacyText,
        removable: false
      });
    }
  }

  return tabs;
}

// 【用途】渲染預覽區頁籤列（含預設頁籤 + 自訂頁籤）
function renderPreviewTabs(customerKey, hasHistory, customTabs) {
  const customTabButtons = (customTabs || [])
    .map((tab) => `<button type="button" class="preview-tab preview-tab-custom" data-tab="${escapeHtml(tab.tabId)}">${escapeHtml(tab.label)}</button>`)
    .join("");
  return `
    <div class="preview-tabs-row">
      <div class="preview-tabs">
        <button type="button" class="preview-tab active" data-tab="preview">預覽</button>
        <button type="button" class="preview-tab" data-tab="sheet">表格內容</button>
        ${hasHistory ? '<button type="button" class="preview-tab" data-tab="history">生成歷史</button>' : ""}
        ${customTabButtons}
      </div>
      <button type="button" class="preview-tab-add" data-action="add-custom-tab" data-customer-key="${escapeHtml(customerKey)}">+ 新增頁籤</button>
    </div>
  `;
}

// 【用途】渲染自訂頁籤內容區（支援 HTML 或純文字）
function renderCustomPreviewPanes(customerKey, customTabs) {
  if (!Array.isArray(customTabs) || customTabs.length === 0) {
    return "";
  }
  return customTabs
    .map((tab) => {
      const htmlContent = tab.html
        ? tab.html
        : (tab.text ? `<div class="preview-custom-text">${escapeHtml(tab.text).replace(/\n/g, "<br>")}</div>` : "");
      return `
        <div class="preview-pane preview-pane-custom" data-pane="${escapeHtml(tab.tabId)}">
          ${tab.removable ? `<div class="preview-custom-actions">
            <button
              type="button"
              class="btn-secondary preview-custom-remove-btn"
              data-action="remove-custom-tab"
              data-customer-key="${escapeHtml(customerKey)}"
              data-tab-id="${escapeHtml(tab.tabId)}"
              data-tab-item-id="${escapeHtml(tab.itemId || "")}"
            >移除頁籤</button>
          </div>` : ""}
          ${tab.removable
            ? `<div
                class="preview-custom-editor"
                contenteditable="true"
                data-action="edit-custom-tab"
                data-customer-key="${escapeHtml(customerKey)}"
                data-tab-id="${escapeHtml(tab.tabId)}"
                data-tab-item-id="${escapeHtml(tab.itemId || "")}"
                data-placeholder="請在這裡編輯備註內容"
              >${htmlContent}</div>`
            : htmlContent}
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

// 【用途】超恩預覽：渲染緊湊型分區卡片，避免多分區時版面過度拉長
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

// 【用途】超恩 BOX Model 顯示：僅保留機種名稱中 " 1." 之前的內容
function formatBngModelForBox(modelValue) {
  const text = String(modelValue ?? "").trim();
  const marker = " 1.";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return text;
  }
  return text.slice(0, markerIndex).trim();
}

export function updateStatus(ui, message, isError = false, isLoading = false) {
  ui.status.textContent = message;
  if (isError) {
    ui.status.className = "error";
    return;
  }
  if (isLoading) {
    ui.status.className = "loading";
    return;
  }
  ui.status.className = "";
}

export function renderLoadResult(ui, rows, fileName) {
  ui.previewPanel.innerHTML = `
    <h2>預覽窗格</h2>
    <p>來源檔案：${fileName}</p>
    <p>已載入 ${rows.length} 筆資料（工作表：${CONFIG.SHEET_NAME}）。</p>
  `;
}

export function renderSearchNotFound(ui, query) {
  ui.previewPanel.innerHTML = `
    <h2>預覽窗格</h2>
    <div class="error-box">找不到工單：${escapeHtml(query)}</div>
  `;
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

  ui.previewPanel.innerHTML = `
    <h2>預覽窗格</h2>
    <p>查詢工單：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
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
  `;
}

export function bindPreviewTabs(ui) {
  bindPreviewTabsIn(ui.previewPanel);
}

export function bindPreviewTabsIn(rootElement) {
  if (!rootElement) {
    return;
  }
  const tabs = rootElement.querySelectorAll(".preview-tab[data-tab]");
  const panes = rootElement.querySelectorAll(".preview-pane");
  tabs.forEach((tab) => {
    tab.addEventListener("click", () => {
      const tabName = tab.getAttribute("data-tab");
      tabs.forEach((item) => item.classList.remove("active"));
      panes.forEach((pane) => pane.classList.remove("active"));
      tab.classList.add("active");
      const pane = rootElement.querySelector(`.preview-pane[data-pane="${tabName}"]`);
      if (pane) {
        pane.classList.add("active");
      }
    });
  });
}

// 【用途】綁定預覽窗格的自訂頁籤操作事件（新增/移除/編輯）
export function bindCustomTabActionsIn(rootElement, handlers = {}) {
  if (!rootElement) {
    return;
  }
  const addButton = rootElement.querySelector('[data-action="add-custom-tab"]');
  if (addButton && typeof handlers.onAdd === "function") {
    addButton.addEventListener("click", () => {
      const customerKey = String(addButton.getAttribute("data-customer-key") ?? "").trim();
      handlers.onAdd(customerKey);
    });
  }
  const removeButtons = rootElement.querySelectorAll('[data-action="remove-custom-tab"]');
  if (typeof handlers.onRemove === "function") {
    removeButtons.forEach((button) => {
      button.addEventListener("click", () => {
        const customerKey = String(button.getAttribute("data-customer-key") ?? "").trim();
        const tabId = String(button.getAttribute("data-tab-id") ?? "").trim();
        const tabItemId = String(button.getAttribute("data-tab-item-id") ?? "").trim();
        handlers.onRemove(customerKey, tabId, tabItemId);
      });
    });
  }
  const editors = rootElement.querySelectorAll('[data-action="edit-custom-tab"]');
  if (typeof handlers.onEdit === "function") {
    editors.forEach((editor) => {
      editor.addEventListener("blur", () => {
        const customerKey = String(editor.getAttribute("data-customer-key") ?? "").trim();
        const tabId = String(editor.getAttribute("data-tab-id") ?? "").trim();
        const tabItemId = String(editor.getAttribute("data-tab-item-id") ?? "").trim();
        handlers.onEdit(customerKey, tabId, tabItemId, editor.innerHTML);
      });
    });
  }
}

export function bindSheetCopyCells(ui, onCopyError) {
  bindSheetCopyCellsIn(ui.previewPanel, onCopyError);
}

export function bindSheetCopyCellsIn(rootElement, onCopyError) {
  if (!rootElement) {
    return;
  }
  const cells = rootElement.querySelectorAll(".copyable-cell");
  cells.forEach((cell) => {
    cell.addEventListener("click", async () => {
      const value = cell.getAttribute("data-copy-value") || "";
      try {
        await copyTextToClipboard(value);
        cell.classList.add("copied");
        setTimeout(() => {
          cell.classList.remove("copied");
        }, 700);
      } catch (error) {
        onCopyError();
      }
    });
  });
}

export function bindCopyButtons(ui, onCopyError) {
  const buttons = ui.previewPanel.querySelectorAll(".copy-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      const copyValue = button.getAttribute("data-copy-value") || "";
      try {
        await copyTextToClipboard(copyValue);
        button.textContent = "✓ 已複製";
        setTimeout(() => {
          button.textContent = originalText;
        }, 1500);
      } catch (error) {
        onCopyError();
      }
    });
  });
}

export function bindCopyButtonsIn(rootElement, onCopyError) {
  if (!rootElement) {
    return;
  }
  const buttons = rootElement.querySelectorAll(".copy-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      const copyValue = button.getAttribute("data-copy-value") || "";
      try {
        await copyTextToClipboard(copyValue);
        button.textContent = "✓ 已複製";
        setTimeout(() => {
          button.textContent = originalText;
        }, 1500);
      } catch (error) {
        onCopyError();
      }
    });
  });
}

export function bindClearHistoryButton(ui, onClearHistory) {
  bindClearHistoryButtonIn(ui.previewPanel, "#btn-clear-history", onClearHistory);
}

export function bindClearHistoryButtonIn(rootElement, selector, onClearHistory) {
  if (!rootElement) {
    return;
  }
  const button = rootElement.querySelector(selector);
  if (!button) {
    return;
  }
  button.addEventListener("click", onClearHistory);
}

export function renderSerialHistoryTable(ui, entries) {
  renderSerialHistoryTableIn(ui.historyPanel, entries, "採單/週別 key");
}

export function renderSerialHistoryTableIn(panelElement, entries, keyLabel = "採單/週別 key") {
  if (!panelElement) {
    return;
  }

  if (!Array.isArray(entries) || entries.length === 0) {
    panelElement.innerHTML = `
      <h2>歷史記憶</h2>
      <div class="error-box">目前沒有可顯示的歷史資料。</div>
    `;
    return;
  }

  const rows = entries
    .map((item) => {
      const rawLastSerial = item?.lastSerial ?? item?.last_serial ?? 0;
      const lastSerial = Number(rawLastSerial);
      const usedSerialText = Number.isFinite(lastSerial) && lastSerial > 0
        ? `${lastSerial}（共 ${lastSerial} 筆）`
        : "0（共 0 筆）";
      return `
        <tr>
          <td>${escapeHtml(item.key)}</td>
          <td>${escapeHtml(usedSerialText)}</td>
          <td><button type="button" class="btn-secondary history-reset-btn" data-history-key="${escapeHtml(item.key)}">重置</button></td>
        </tr>
      `;
    })
    .join("");

  panelElement.innerHTML = `
    <h2>歷史記憶</h2>
    <div class="sheet-table-wrap">
      <table class="sheet-table">
        <thead>
          <tr>
            <th>${escapeHtml(keyLabel)}</th>
            <th>已使用流水號（對應數量）</th>
            <th>操作</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  `;
}

export function bindHistoryResetButtons(ui, onReset) {
  bindHistoryResetButtonsIn(ui.historyPanel, onReset);
}

export function bindHistoryResetButtonsIn(panelElement, onReset) {
  if (!panelElement) {
    return;
  }
  const buttons = panelElement.querySelectorAll(".history-reset-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", () => {
      const key = button.getAttribute("data-history-key") || "";
      onReset(key);
    });
  });
}

export function renderLunfeiSearchNotFound(ui, query) {
  if (!ui.lunfeiPreviewPanel) {
    return;
  }
  ui.lunfeiPreviewPanel.innerHTML = `
    <h2>倫飛預覽窗格</h2>
    <div class="error-box">找不到 MO：${escapeHtml(query)}</div>
  `;
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
  const hasHistory = Array.isArray(generationHistory) && generationHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs("lunfei");

  ui.lunfeiPreviewPanel.innerHTML = `
    <h2>倫飛預覽窗格</h2>
    <p>查詢 MO：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">Model：${escapeHtml(model)}</p>
    </div>
    ${renderPreviewTabs("lunfei", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      <div class="preview-grid">
        ${renderPreviewItem("SN（第一筆預覽）", previewSN, true)}
        ${renderPreviewItem("工單", workOrder, true)}
        ${renderPreviewItem("P/N", pn, true)}
        ${renderPreviewItem("加工WO#", processWo, true)}
        ${renderPreviewItem("對應PCBA", pcba, true)}
        ${renderPreviewItem("Q'ty", qty, true)}
      </div>
    </div>
    <div class="preview-pane" data-pane="sheet">
      ${renderSheetContentPane(rowData)}
    </div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">
      <ol class="history-list">${generationHistory.map((record) => `<li>${escapeHtml(record)}</li>`).join("")}</ol>
      <div class="history-actions">
        <button type="button" class="btn-secondary" id="btn-clear-history-lunfei">清空歷史序號</button>
      </div>
    </div>` : ""}
    ${renderCustomPreviewPanes("lunfei", customTabs)}
  `;
}

export function renderBngSearchNotFound(ui, query) {
  if (!ui.bngPreviewPanel) {
    return;
  }
  ui.bngPreviewPanel.innerHTML = `
    <h2>超恩預覽窗格</h2>
    <div class="error-box">查無對應資料，請確認 MO 是否正確（${escapeHtml(query)}）</div>
  `;
}

// 【用途】超恩查詢成功後渲染分區預覽（SN/MAC/UUID/FW&BIOS/BOX）
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
  const boxModel = formatBngModelForBox(model);
  const hasHistory = Array.isArray(generationHistory) && generationHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs("bng");
  const snGroup = renderBngPreviewGroup("SN 分區", [
    renderPreviewItem("序號區間", snRange, true),
    renderPreviewItem("生產數量", qty, true)
  ]);
  const macGroup = renderBngPreviewGroup("MAC 分區", [
    renderPreviewItem("MAC Address", macRange, true),
    renderPreviewItem("MAC數量", macQty, true),
    renderPreviewItem("MAC板子用量數量", macBoardQty, true)
  ]);
  const uuidGroup = renderBngPreviewGroup("UUID 分區", [
    renderPreviewItem("UUID區間", uuidRange, true),
    renderPreviewItem("生產數量", qty, true)
  ]);
  const fwBiosGroup = renderBngPreviewGroup("FW&BIOS 分區", [
    renderPreviewItem("新版BIOS(以此為主)", bios, true),
    renderPreviewItem("IGN FW版本", fw, true)
  ]);
  const boxGroup = renderBngPreviewGroup("BOX 分區", [
    renderPreviewItem("工單", workOrder, true),
    renderPreviewItem("機種名稱", boxModel, true),
    renderPreviewItem("機種料號", partNo, true),
    renderPreviewItem("序號區間", snRange, true),
    renderPreviewItem("Model", boxModel, true)
  ]);

  ui.bngPreviewPanel.innerHTML = `
    <h2>超恩預覽窗格</h2>
    <p>查詢 MO：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(model)}</p>
      <p class="preview-subtitle">機種料號：${escapeHtml(partNo)}｜日期：${escapeHtml(date)}</p>
    </div>
    ${renderPreviewTabs("bng", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      <div class="bng-preview-groups">
        ${snGroup}
        ${macGroup}
        ${uuidGroup}
        ${fwBiosGroup}
        ${boxGroup}
      </div>
    </div>
    <div class="preview-pane" data-pane="sheet">
      ${renderSheetContentPane(rowData)}
    </div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">
      <ol class="history-list">${generationHistory.map((record) => `<li>${escapeHtml(record)}</li>`).join("")}</ol>
      <div class="history-actions">
        <button type="button" class="btn-secondary" id="btn-clear-history-bng">清空歷史序號</button>
      </div>
    </div>` : ""}
    ${renderCustomPreviewPanes("bng", customTabs)}
  `;
}

export function renderChgSearchNotFound(ui, query) {
  if (!ui.chgPreviewPanel) {
    return;
  }
  ui.chgPreviewPanel.innerHTML = `
    <h2>KOYA 預覽窗格</h2>
    <div class="error-box">查無對應資料，請確認工單是否正確（${escapeHtml(query)}）</div>
  `;
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
  const model = row[resolveColumnKey(row, "MODEL") || CONFIG.COLUMNS.MODEL] || "";
  const pn = row[resolveColumnKey(row, "PN") || CONFIG.COLUMNS.PN] || "";
  const po = row[resolveColumnKey(row, "PO") || CONFIG.COLUMNS.PO] || "";
  const batch = row[resolveColumnKey(row, "BATCH") || CONFIG.COLUMNS.BATCH] || "";
  const qty = row[resolveColumnKey(row, "QTY") || CONFIG.COLUMNS.QTY] || "";
  const boxQty = row[resolveColumnKey(row, "BOX_QTY") || CONFIG.COLUMNS.BOX_QTY] || "";
  const demand = row[resolveColumnKey(row, "DEMAND") || CONFIG.COLUMNS.DEMAND] || "";
  const tailQty = row[resolveColumnKey(row, "TAIL_QTY") || CONFIG.COLUMNS.TAIL_QTY] || "";
  const hasHistory = Array.isArray(generationHistory) && generationHistory.length > 0;
  const customTabs = getConfiguredPreviewTabs("chg");

  const labelGroup = renderPreviewGroup("Label 分區", [
    renderPreviewItem("PN", pn, true),
    renderPreviewItem("小張貼紙", qty, true)
  ]);
  const boxLabelGroup = renderPreviewGroup("Box Label 分區", [
    renderPreviewItem("滿箱數量", boxQty, true),
    renderPreviewItem("需求", demand, true),
    renderPreviewItem("尾數數量", tailQty, true)
  ]);

  ui.chgPreviewPanel.innerHTML = `
    <h2>KOYA 預覽窗格</h2>
    <p>查詢工單：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(model)}</p>
      <p class="preview-subtitle">工單：${escapeHtml(workOrder)}｜PO：${escapeHtml(po)}｜批量：${escapeHtml(batch)}</p>
    </div>
    ${renderPreviewTabs("chg", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      ${labelGroup}
      ${boxLabelGroup}
    </div>
    <div class="preview-pane" data-pane="sheet">
      ${renderSheetContentPane(rowData)}
    </div>
    ${hasHistory ? `<div class="preview-pane" data-pane="history">
      <ol class="history-list">${generationHistory.map((record) => `<li>${escapeHtml(record)}</li>`).join("")}</ol>
      <div class="history-actions">
        <button type="button" class="btn-secondary" id="btn-clear-history-chg">清空歷史序號</button>
      </div>
    </div>` : ""}
    ${renderCustomPreviewPanes("chg", customTabs)}
  `;
}

export function renderHmgSearchNotFound(ui, query) {
  if (!ui.hmgPreviewPanel) {
    return;
  }
  ui.hmgPreviewPanel.innerHTML = `
    <h2>赫星 預覽窗格</h2>
    <div class="error-box">查無對應機種，請確認 Model 關鍵字是否正確（${escapeHtml(query)}）</div>
  `;
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

  ui.hmgPreviewPanel.innerHTML = `
    <h2>赫星 預覽窗格</h2>
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
  `;
}

export function renderClgSearchNotFound(ui, query) {
  if (!ui.clgPreviewPanel) {
    return;
  }
  ui.clgPreviewPanel.innerHTML = `
    <h2>Cubepilot 預覽窗格</h2>
    <div class="error-box">查無對應機種，請確認機種名是否正確（${escapeHtml(query)}）</div>
  `;
}

export function renderClgSearchSuccess(ui, args) {
  const {
    row,
    query,
    matchCount,
    resolveColumnKey,
    rowData,
    plannedSerialPreview,
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
  const serialPreviewHtml = renderClgPlannedSerialPreview(plannedSerialPreview);

  ui.clgPreviewPanel.innerHTML = `
    <h2>Cubepilot 預覽窗格</h2>
    <p>查詢機種名：${escapeHtml(query)}（命中 ${matchCount} 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(model)}</p>
    </div>
    ${renderPreviewTabs("clg", hasHistory, customTabs)}
    <div class="preview-pane active" data-pane="preview">
      <div class="preview-grid">
        ${previewGridHtml}
      </div>
      <div id="clg-planned-preview-root">${serialPreviewHtml}</div>
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
  `;
}

function renderClgPlannedSerialPreview(plannedSerialPreview) {
  const preview = plannedSerialPreview || {};
  const error = String(preview.error ?? "").trim();
  if (error) {
    return `
      <section class="clg-generated-preview">
        <h3 class="section-title">預估生成序號預覽（生成前）</h3>
        <div class="error-box">${escapeHtml(error)}</div>
      </section>
    `;
  }
  const total = Number(preview.total ?? 0);
  const firstTen = Array.isArray(preview.firstTen) ? preview.firstTen : [];
  const lastTen = Array.isArray(preview.lastTen) ? preview.lastTen : [];
  if (total <= 0 || firstTen.length === 0 || lastTen.length === 0) {
    return `
      <section class="clg-generated-preview">
        <h3 class="section-title">預估生成序號預覽（生成前）</h3>
        <p class="preview-empty-note">請先輸入完整序號設定（起始流水號、數量等）。</p>
      </section>
    `;
  }
  return `
    <section class="clg-generated-preview">
      <h3 class="section-title">預估生成序號預覽（生成前，共 ${total} 筆）</h3>
      <div class="clg-generated-grid">
        <div class="clg-generated-group">
          <p class="clg-generated-title">前 10 筆</p>
          <ol class="clg-generated-list">${firstTen.map((sn) => `<li>${escapeHtml(sn)}</li>`).join("")}</ol>
        </div>
        <div class="clg-generated-group">
          <p class="clg-generated-title">後 10 筆</p>
          <ol class="clg-generated-list">${lastTen.map((sn) => `<li>${escapeHtml(sn)}</li>`).join("")}</ol>
        </div>
      </div>
    </section>
  `;
}

export function updateClgPlannedSerialPreviewIn(ui, plannedSerialPreview) {
  const root = ui?.clgPreviewPanel?.querySelector("#clg-planned-preview-root");
  if (!root) {
    return;
  }
  root.innerHTML = renderClgPlannedSerialPreview(plannedSerialPreview);
}
