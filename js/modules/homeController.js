import {
  CUSTOMER_KEYS,
  MODEL_CUSTOMER_KEYS,
  WORK_ORDER_CUSTOMER_KEYS
} from "./customers.js";
import { replaceChildrenFromTrustedTemplate } from "./dom.js";
import { escapeHtmlAttribute } from "./utils.js";

export function createHomeController(deps) {
  const {
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
    updateHomeStatus
  } = deps;

  const HOME_WORKORDER_CUSTOMER_ORDER = WORK_ORDER_CUSTOMER_KEYS;
  const HOME_MODEL_CUSTOMER_ORDER = MODEL_CUSTOMER_KEYS;
  const HOME_CUSTOMER_ORDER = [...HOME_WORKORDER_CUSTOMER_ORDER, ...HOME_MODEL_CUSTOMER_ORDER];
  const HOME_SEARCH_MODE_WORKORDER = "workorder";
  const HOME_SEARCH_MODE_MODEL = "model";
  const HOME_HISTORY_KEY_LABEL_MAP = {
    yingbang: "工單",
    lunfei: "週別 key",
    bng: "MO",
    chg: "工單",
    hmg: "Model",
    clg: "機種名"
  };

  function getHomeCustomerLabel(customerKey) {
    const labels = {
      yingbang: "營邦",
      lunfei: "倫飛",
      bng: "超恩",
      chg: "KOYA",
      hmg: "赫星",
      clg: "Cubepilot"
    };
    return labels[customerKey] || customerKey;
  }

  function clearHomePendingModelSelection() {
    homeRuntime.pendingModelCustomer = "";
    homeRuntime.pendingModelRows = [];
  }

  function getHomeModelDisplayValue(customerKey, row) {
    if (customerKey === CUSTOMER_KEYS.HMG) {
      return getHmgModelValue(row);
    }
    if (customerKey === CUSTOMER_KEYS.CLG) {
      return getClgModelValue(row);
    }
    return "";
  }

  function renderHomeModelSelectionPanel(customerKey, query, rows) {
    if (!ui.homePreviewPanel) {
      return;
    }
    const list = Array.isArray(rows) ? rows.slice(0, 30) : [];
    homeRuntime.pendingModelCustomer = customerKey;
    homeRuntime.pendingModelRows = list;
    const optionsHtml = list
      .map((row, index) => {
        const model = getHomeModelDisplayValue(customerKey, row) || "(空白 Model)";
        return `<button type="button" class="clg-suggest-btn" data-home-model-index="${index}">${escapeHtml(model)}</button>`;
      })
      .join("");
    const hiddenCount = Math.max((rows?.length || 0) - list.length, 0);
    const hiddenText = hiddenCount > 0 ? `<p class="clg-suggest-title">另有 ${hiddenCount} 筆未顯示，請縮小關鍵字。</p>` : "";
    replaceChildrenFromTrustedTemplate(ui.homePreviewPanel, `
      <h2>${escapeHtml(getHomeCustomerLabel(customerKey))} 預覽窗格</h2>
      <p>關鍵字「${escapeHtml(query)}」命中 ${rows.length} 筆，請點選一筆機種：</p>
      <div class="clg-suggest-panel">
        <div class="clg-suggest-list">${optionsHtml}</div>
        ${hiddenText}
      </div>
    `);
  }

  function getHomeSearchMode() {
    const mode = String(ui.homeSearchTypeSelect?.value ?? HOME_SEARCH_MODE_WORKORDER).trim();
    return mode === HOME_SEARCH_MODE_MODEL ? HOME_SEARCH_MODE_MODEL : HOME_SEARCH_MODE_WORKORDER;
  }

  function getHomeSearchModeMessages(mode) {
    if (mode === HOME_SEARCH_MODE_MODEL) {
      return {
        placeholder: "搜尋 hmg / clg 機種（Model）",
        empty: "請先輸入機種（Model）。",
        notFound: "查無對應機種資料（hmg / clg）。"
      };
    }
    return {
      placeholder: "搜尋全客戶工單 / MO",
      empty: "請先輸入工單或 MO。",
      notFound: "查無對應工單 / MO 資料（全客戶）。"
    };
  }

  function syncHomeSearchModeUi() {
    const mode = getHomeSearchMode();
    const messages = getHomeSearchModeMessages(mode);
    if (ui.homeSearchInput) {
      ui.homeSearchInput.placeholder = messages.placeholder;
    }
    updateHomeStatus(mode === HOME_SEARCH_MODE_MODEL
      ? "目前模式：機種（Model）搜尋（hmg / clg）。"
      : "目前模式：工單 / MO 搜尋（全客戶）。");
    clearHomePendingModelSelection();
  }

  function parseHomeSearchTokens(rawValue, options = {}) {
    const { stripAsteriskSuffix = false } = options;
    return String(rawValue ?? "")
      .split(/[\s,，;；/]+/)
      .map((part) => String(part).trim())
      .filter(Boolean)
      .map((token) => {
        const normalizedToken = stripAsteriskSuffix ? String(token).split("*")[0] : token;
        return normalizeText(normalizedToken);
      })
      .filter(Boolean);
  }

  function findRowsByCustomerColumnCode(rows, customerKey, columnCode, keyword, options = {}) {
    if (!Array.isArray(rows) || rows.length === 0) {
      return [];
    }
    const normalizedKeyword = normalizeText(keyword);
    if (!normalizedKeyword) {
      return [];
    }
    const exactMatches = rows.filter((row) => {
      const raw = getRowValueByCustomerColumnCode(customerKey, row, columnCode);
      const tokens = parseHomeSearchTokens(raw, options);
      return tokens.includes(normalizedKeyword);
    });
    if (exactMatches.length > 0) {
      return exactMatches;
    }
    return rows.filter((row) => {
      const raw = getRowValueByCustomerColumnCode(customerKey, row, columnCode);
      const tokens = parseHomeSearchTokens(raw, options);
      return tokens.some((token) => token.includes(normalizedKeyword));
    });
  }

  function hasExactTokenMatch(rows, customerKey, columnCode, query, options = {}) {
    const target = normalizeText(query);
    if (!target || !Array.isArray(rows) || rows.length === 0) {
      return false;
    }
    return rows.some((row) => {
      const raw = getRowValueByCustomerColumnCode(customerKey, row, columnCode);
      const tokens = parseHomeSearchTokens(raw, options);
      return tokens.includes(target);
    });
  }

  function hasExactModelMatch(rows, query, getModelFn) {
    const target = normalizeText(query);
    if (!target || !Array.isArray(rows) || rows.length === 0) {
      return false;
    }
    return rows.some((row) => normalizeText(getModelFn(row)) === target);
  }

  function buildHomeSearchMatchMap(query, mode) {
    const includeWorkOrder = mode === HOME_SEARCH_MODE_WORKORDER;
    const includeModel = mode === HOME_SEARCH_MODE_MODEL;
    return {
      yingbang: includeWorkOrder && state.yingbangRowData.length > 0
        ? findRowsByCustomerColumnCode(state.yingbangRowData, CUSTOMER_KEYS.YINGBANG, "WORK_ORDER", query, { stripAsteriskSuffix: true })
        : [],
      lunfei: includeWorkOrder && state.lunfeiRowData.length > 0
        ? findRowsByCustomerColumnCode(state.lunfeiRowData, CUSTOMER_KEYS.LUNFEI, "MO", query)
        : [],
      bng: includeWorkOrder && state.bngRowData.length > 0
        ? findRowsByCustomerColumnCode(state.bngRowData, CUSTOMER_KEYS.BNG, "MO", query)
        : [],
      chg: includeWorkOrder && state.chgRowData.length > 0
        ? findRowsByCustomerColumnCode(state.chgRowData, CUSTOMER_KEYS.CHG, "WORK_ORDER", query)
        : [],
      hmg: includeModel && state.hmgRowData.length > 0 ? findHmgRowsByModel(state.hmgRowData, query) : [],
      clg: includeModel && state.clgRowData.length > 0 ? findClgRowsByModel(state.clgRowData, query) : []
    };
  }

  function decideHomeSearchTarget(query, matchMap, mode) {
    const hasHit = (key) => Array.isArray(matchMap[key]) && matchMap[key].length > 0;
    const searchOrder = mode === HOME_SEARCH_MODE_MODEL ? HOME_MODEL_CUSTOMER_ORDER : HOME_WORKORDER_CUSTOMER_ORDER;
    const exactOrder = searchOrder.filter((key) => {
      if (!hasHit(key)) {
        return false;
      }
      if (key === CUSTOMER_KEYS.YINGBANG) {
        return hasExactTokenMatch(matchMap[key], CUSTOMER_KEYS.YINGBANG, "WORK_ORDER", query, { stripAsteriskSuffix: true });
      }
      if (key === CUSTOMER_KEYS.LUNFEI || key === CUSTOMER_KEYS.BNG) {
        return hasExactTokenMatch(matchMap[key], key, "MO", query);
      }
      if (key === CUSTOMER_KEYS.CHG) {
        return hasExactTokenMatch(matchMap[key], CUSTOMER_KEYS.CHG, "WORK_ORDER", query);
      }
      if (key === CUSTOMER_KEYS.HMG) {
        return hasExactModelMatch(matchMap[key], query, getHmgModelValue);
      }
      if (key === CUSTOMER_KEYS.CLG) {
        return hasExactModelMatch(matchMap[key], query, getClgModelValue);
      }
      return false;
    });
    if (exactOrder.length > 0) {
      if (exactOrder.includes(homeRuntime.customer)) {
        return homeRuntime.customer;
      }
      return exactOrder[0];
    }
    const partialOrder = searchOrder.filter((key) => hasHit(key));
    if (partialOrder.length > 0) {
      if (partialOrder.includes(homeRuntime.customer)) {
        return homeRuntime.customer;
      }
      return partialOrder[0];
    }
    return "";
  }

  async function performHomeSearch() {
    const mode = getHomeSearchMode();
    const modeMessages = getHomeSearchModeMessages(mode);
    const query = String(ui.homeSearchInput?.value ?? "").trim();
    if (!query) {
      updateHomeStatus(modeMessages.empty, true);
      return;
    }
    const matchMap = buildHomeSearchMatchMap(query, mode);
    const target = decideHomeSearchTarget(query, matchMap, mode);
    if (!target) {
      updateHomeStatus(modeMessages.notFound, true);
      setHomeExportEnabled(false);
      setHomeBngPrintEnabled(false);
      setHomeCustomerTheme("");
      clearHomePendingModelSelection();
      homeRuntime.customer = "";
      homeRuntime.query = query;
      if (ui.homeHistoryPanel) {
        ui.homeHistoryPanel.hidden = true;
      }
      return;
    }

    setHomeLoading(true, "查詢中...");
    try {
      if (ui.homeHistoryPanel) {
        ui.homeHistoryPanel.hidden = true;
      }
      await runHomeSearchByCustomer(target, query);
      const matchedRows = Array.isArray(matchMap[target]) ? matchMap[target] : [];
      homeRuntime.customer = target;
      homeRuntime.query = query;
      setHomeCustomerTheme(target);
      setHomeExportEnabled(Boolean(state.currentRow));
      if (mode === HOME_SEARCH_MODE_MODEL && !state.currentRow && matchedRows.length > 0) {
        renderHomeModelSelectionPanel(target, query, matchedRows);
      } else {
        clearHomePendingModelSelection();
        syncHomePreviewPanel(target);
      }
      if (state.currentRow) {
        const isDuplicateMoHit = mode === HOME_SEARCH_MODE_WORKORDER
          && (target === CUSTOMER_KEYS.LUNFEI || target === CUSTOMER_KEYS.BNG)
          && matchedRows.length === 2;
        updateHomeStatus(
          isDuplicateMoHit
            ? `警示：${getHomeCustomerLabel(target)} MO ${query} 命中 2 筆資料，請確認。`
            : `已命中 ${getHomeCustomerLabel(target)}：${query}`,
          false,
          false,
          !isDuplicateMoHit,
          isDuplicateMoHit
        );
      } else if (matchedRows.length > 0) {
        updateHomeStatus(`已命中 ${getHomeCustomerLabel(target)} ${matchedRows.length} 筆，請選擇目標資料。`, false, false, true);
      } else {
        updateHomeStatus(`查詢完成：${getHomeCustomerLabel(target)} 未選到可匯出資料。`, true);
      }
    } catch (error) {
      updateHomeStatus(`查詢失敗：${getSafeErrorMessage(error)}`, true);
      setHomeExportEnabled(false);
      setHomeBngPrintEnabled(false);
    } finally {
      setHomeLoading(false);
      setHomeBngPrintEnabled(homeRuntime.customer === CUSTOMER_KEYS.BNG && Boolean(state.currentRow));
    }
  }

  function onHomeSearchTypeChange() {
    homeRuntime.customer = "";
    homeRuntime.query = "";
    setHomeExportEnabled(false);
    setHomeBngPrintEnabled(false);
    setHomeCustomerTheme("");
    clearHomePendingModelSelection();
    if (ui.homeHistoryPanel) {
      ui.homeHistoryPanel.hidden = true;
    }
    syncHomeSearchModeUi();
  }

  function onHomePreviewPanelClick(event) {
    const button = event.target.closest("[data-home-model-index]");
    if (!button) {
      return;
    }
    const index = Number(button.getAttribute("data-home-model-index"));
    if (!Number.isInteger(index) || index < 0 || index >= homeRuntime.pendingModelRows.length) {
      return;
    }
    const customerKey = homeRuntime.pendingModelCustomer;
    const row = homeRuntime.pendingModelRows[index];
    const model = getHomeModelDisplayValue(customerKey, row);
    if (!model) {
      return;
    }
    if (ui.homeSearchInput) {
      ui.homeSearchInput.value = model;
    }
    performHomeSearch();
  }

  function bindHomeAggregateHistoryResetButtons(panelElement) {
    if (!panelElement) {
      return;
    }
    const buttons = panelElement.querySelectorAll(".home-history-reset-btn");
    buttons.forEach((button) => {
      button.addEventListener("click", async () => {
        const customerKey = String(button.getAttribute("data-customer-key") ?? "").trim();
        const historyKey = String(button.getAttribute("data-history-key") ?? "").trim();
        if (!customerKey || !historyKey) {
          return;
        }
        await onHomeResetHistoryByCustomer(customerKey, historyKey);
        await openHomeHistoryPanel();
      });
    });
  }

  function renderHomeAggregateHistoryPanel(panelElement, allHistoryItems) {
    if (!panelElement) {
      return;
    }
    if (!Array.isArray(allHistoryItems) || allHistoryItems.length === 0) {
      replaceChildrenFromTrustedTemplate(panelElement, `
        <h2>歷史記憶</h2>
        <div class="error-box">目前沒有可顯示的歷史資料。</div>
      `);
      return;
    }
    const rowsHtml = allHistoryItems
      .map((item) => {
        const lastSerial = Number(item?.lastSerial ?? 0);
        const usedSerialText = Number.isFinite(lastSerial) && lastSerial > 0
          ? `${lastSerial}（共 ${lastSerial} 筆）`
          : "0（共 0 筆）";
        return `
          <tr>
            <td>${escapeHtml(getHomeCustomerLabel(item.customerKey))}</td>
            <td>${escapeHtml(item.keyLabel)}</td>
            <td>${escapeHtml(String(item.historyKey))}</td>
            <td>${escapeHtml(usedSerialText)}</td>
            <td><button type="button" class="btn-secondary home-history-reset-btn" data-customer-key="${escapeHtmlAttribute(item.customerKey)}" data-history-key="${escapeHtmlAttribute(item.historyKey)}">重置</button></td>
          </tr>
        `;
      })
      .join("");
    replaceChildrenFromTrustedTemplate(panelElement, `
      <h2>歷史記憶（全部客戶）</h2>
      <div class="sheet-table-wrap">
        <table class="sheet-table">
          <thead>
            <tr>
              <th>客戶</th>
              <th>欄位語意</th>
              <th>History Key</th>
              <th>已使用流水號（對應數量）</th>
              <th>操作</th>
            </tr>
          </thead>
          <tbody>${rowsHtml}</tbody>
        </table>
      </div>
    `);
  }

  async function openHomeHistoryPanel() {
    if (!ui.homeHistoryPanel) {
      return;
    }
    const customerKey = homeRuntime.customer;
    try {
      if (!customerKey) {
        const results = await Promise.allSettled(
          HOME_CUSTOMER_ORDER.map(async (key) => {
            const snapshot = await loadHistorySnapshot(key);
            return {
              customerKey: key,
              entries: Array.isArray(snapshot?.entries) ? snapshot.entries : []
            };
          })
        );
        const allHistoryItems = [];
        results.forEach((result) => {
          if (result.status !== "fulfilled") {
            return;
          }
          const customer = String(result.value.customerKey ?? "").trim();
          const keyLabel = HOME_HISTORY_KEY_LABEL_MAP[customer] || "Key";
          const entries = Array.isArray(result.value.entries) ? result.value.entries : [];
          entries.forEach((entry) => {
            allHistoryItems.push({
              customerKey: customer,
              keyLabel,
              historyKey: String(entry?.key ?? "").trim(),
              lastSerial: Number(entry?.lastSerial ?? entry?.last_serial ?? 0)
            });
          });
        });
        ui.homeHistoryPanel.hidden = false;
        renderHomeAggregateHistoryPanel(ui.homeHistoryPanel, allHistoryItems);
        bindHomeAggregateHistoryResetButtons(ui.homeHistoryPanel);
        updateHomeStatus("已顯示全部客戶歷史。");
        return;
      }

      const historySnapshot = await loadHistorySnapshot(customerKey);
      ui.homeHistoryPanel.hidden = false;
      renderSerialHistoryTableIn(
        ui.homeHistoryPanel,
        historySnapshot.entries,
        HOME_HISTORY_KEY_LABEL_MAP[customerKey] || "Key"
      );
      bindHistoryResetButtonsIn(ui.homeHistoryPanel, async (historyKey) => {
        await onHomeResetHistoryByCustomer(customerKey, historyKey);
        await openHomeHistoryPanel();
      });
    } catch (error) {
      updateHomeStatus(`歷史讀取失敗：${getSafeErrorMessage(error)}`, true);
    }
  }

  async function onHomeExportClick() {
    const customerKey = homeRuntime.customer;
    if (!customerKey) {
      updateHomeStatus("請先完成查詢後再匯出。", true);
      return;
    }
    setHomeLoading(true, "匯出中...");
    try {
      switchCustomerTab(customerKey);
      await onExportClick();
      syncHomePreviewPanel(customerKey);
      updateHomeStatus(`${getHomeCustomerLabel(customerKey)}匯出完成。`);
    } catch (error) {
      updateHomeStatus(`匯出失敗：${getSafeErrorMessage(error)}`, true);
    } finally {
      setHomeLoading(false);
      setHomeBngPrintEnabled(homeRuntime.customer === CUSTOMER_KEYS.BNG && Boolean(state.currentRow));
    }
  }

  function onHomeBngPrintClick() {
    if (homeRuntime.customer !== CUSTOMER_KEYS.BNG || !state.currentRow) {
      updateHomeStatus("請先搜尋並命中 BNG 工單，再產生收據。", true);
      return;
    }
    try {
      switchCustomerTab(CUSTOMER_KEYS.BNG);
      onBngPrintReceiptClick();
      syncHomePreviewPanel(CUSTOMER_KEYS.BNG);
      updateHomeStatus("已開啟 BNG 收據列印。");
    } catch (error) {
      updateHomeStatus(`產生收據失敗：${getSafeErrorMessage(error)}`, true);
    }
  }

  return {
    performHomeSearch,
    onHomeSearchTypeChange,
    onHomePreviewPanelClick,
    openHomeHistoryPanel,
    onHomeExportClick,
    onHomeBngPrintClick,
    syncHomeSearchModeUi
  };
}
