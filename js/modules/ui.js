import { CONFIG } from "../config.js";
import { escapeHtml } from "./utils.js";
import { renderTitleWithHelp } from "./uiPreviewRenderers.js";

export {
  copyTextToClipboard,
  bindSheetCopyCells,
  bindSheetCopyCellsIn,
  bindCopyButtons,
  bindCopyButtonsIn
} from "./uiClipboard.js";

export {
  renderSerialHistoryTableIn,
  bindHistoryResetButtons,
  bindHistoryResetButtonsIn
} from "./uiHistory.js";

export {
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
  renderClgSearchSuccess
} from "./uiPreviewRenderers.js";

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
    ${renderTitleWithHelp("預覽窗格", "preview-panel")}
    <p>來源檔案：${fileName}</p>
    <p>已載入 ${rows.length} 筆資料（工作表：${CONFIG.SHEET_NAME}）。</p>
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
      <div class="history-actions">
        <button type="button" class="btn-secondary" id="btn-copy-clg-serial-text">複製整串序號（純文字）</button>
      </div>
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
  const root = ui?.clgSettingsPlannedPreviewRoot;
  if (!root) {
    return;
  }
  root.innerHTML = renderClgPlannedSerialPreview(plannedSerialPreview);
}
