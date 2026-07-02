import { escapeHtml } from "./utils.js";

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
