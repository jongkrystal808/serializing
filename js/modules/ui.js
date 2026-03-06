import { CONFIG } from "../config.js";
import { escapeHtml } from "./utils.js";

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

  ui.previewPanel.innerHTML = `
    <h2>預覽窗格</h2>
    <p>查詢工單：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">${escapeHtml(ddcPartNo)}</p>
      <p class="preview-subtitle">${escapeHtml(productName)}</p>
    </div>
    <div class="preview-tabs">
      <button type="button" class="preview-tab active" data-tab="preview">預覽</button>
      <button type="button" class="preview-tab" data-tab="sheet">表格內容</button>
      ${hasHistory ? '<button type="button" class="preview-tab" data-tab="history">生成歷史</button>' : ""}
    </div>
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
  `;
}

export function bindPreviewTabs(ui) {
  bindPreviewTabsIn(ui.previewPanel);
}

export function bindPreviewTabsIn(rootElement) {
  if (!rootElement) {
    return;
  }
  const tabs = rootElement.querySelectorAll(".preview-tab");
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
        await navigator.clipboard.writeText(value);
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
        await navigator.clipboard.writeText(copyValue);
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
        await navigator.clipboard.writeText(copyValue);
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
    .map((item) => `
      <tr>
        <td>${escapeHtml(item.key)}</td>
        <td>${escapeHtml(item.lastSerial)}</td>
        <td><button type="button" class="btn-secondary history-reset-btn" data-history-key="${escapeHtml(item.key)}">重置</button></td>
      </tr>
    `)
    .join("");

  panelElement.innerHTML = `
    <h2>歷史記憶</h2>
    <div class="sheet-table-wrap">
      <table class="sheet-table">
        <thead>
          <tr>
            <th>${escapeHtml(keyLabel)}</th>
            <th>已使用流水號</th>
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

  ui.lunfeiPreviewPanel.innerHTML = `
    <h2>倫飛預覽窗格</h2>
    <p>查詢 MO：${escapeHtml(query)}（命中 ${matchCount} 筆，預設取第 1 筆）</p>
    <div class="preview-headline">
      <p class="preview-title">Model：${escapeHtml(model)}</p>
    </div>
    <div class="preview-tabs">
      <button type="button" class="preview-tab active" data-tab="preview">預覽</button>
      <button type="button" class="preview-tab" data-tab="sheet">表格內容</button>
      ${hasHistory ? '<button type="button" class="preview-tab" data-tab="history">生成歷史</button>' : ""}
    </div>
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
  `;
}
