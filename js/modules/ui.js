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
    <div class="preview-tabs">
      <button type="button" class="preview-tab active" data-tab="preview">預覽</button>
      <button type="button" class="preview-tab" data-tab="sheet">表格內容</button>
      ${hasHistory ? '<button type="button" class="preview-tab" data-tab="history">生成歷史</button>' : ""}
    </div>
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
    <div class="preview-tabs">
      <button type="button" class="preview-tab active" data-tab="preview">預覽</button>
      <button type="button" class="preview-tab" data-tab="sheet">表格內容</button>
      ${hasHistory ? '<button type="button" class="preview-tab" data-tab="history">生成歷史</button>' : ""}
    </div>
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
  `;
}
