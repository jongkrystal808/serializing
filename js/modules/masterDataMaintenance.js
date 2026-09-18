import {
  deleteKoyaModelByApi,
  deleteMonthlyReferenceByApi,
  deleteNyxModelByApi,
  getKoyaModelsByApi,
  getMonthlyReferencesByApi,
  getNyxModelsByApi,
  upsertKoyaModelByApi,
  upsertMonthlyReferenceByApi,
  upsertNyxModelByApi
} from "./api.js?v=0.3.70";
import { resolveCustomerColumnKey } from "./customerColumns.js";
import { replaceChildrenFromTrustedTemplate } from "./dom.js";
import { showToast } from "./toast.js";
import { updateStatus } from "./ui.js";
import { escapeHtml, normalizeText } from "./utils.js";

export function createMasterDataMaintenance({
  ui,
  state,
  customers,
  homeRuntime,
  setButtonLoading,
  scrollToElement,
  getSafeErrorMessage,
  setHomeExportEnabled,
  updateHomeStatus
}) {
  // 【用途】依 Model 主檔補 PN/full PN，再依工單月份主檔補 PO。
  function enrichKoyaShipmentRows(rows) {
    const koyaColumns = customers.chg?.columns || {};
    const entriesByModel = new Map(
      state.koyaModelEntries.map((entry) => [normalizeText(entry.model), entry])
    );
    const poByMonth = new Map(
      state.koyaMonthEntries.map((entry) => [normalizeText(entry.month), entry.value])
    );
    return (Array.isArray(rows) ? rows : []).map((row) => {
      const modelKey = resolveCustomerColumnKey("chg", row, "MODEL") || koyaColumns.MODEL;
      const shipmentModel = normalizeText(row?.[modelKey]);
      const modelEntry = entriesByModel.get(shipmentModel) || state.koyaModelEntries.find((entry) => {
        const pattern = normalizeText(entry.model);
        return pattern.endsWith("xxxx") && shipmentModel.startsWith(pattern.slice(0, -4));
      });
      const nextRow = { ...row };
      if (modelEntry) {
        Object.entries({ PN: modelEntry.pn, FULL_PN: modelEntry.full_pn }).forEach(([columnCode, value]) => {
          const columnKey = resolveCustomerColumnKey("chg", nextRow, columnCode) || koyaColumns[columnCode];
          nextRow[columnKey] = value;
        });
      }
      const monthKey = resolveCustomerColumnKey("chg", nextRow, "WORK_ORDER_MONTH") || koyaColumns.WORK_ORDER_MONTH;
      const poKey = resolveCustomerColumnKey("chg", nextRow, "PO") || koyaColumns.PO;
      nextRow[poKey] = poByMonth.get(normalizeText(nextRow[monthKey])) || "";
      return nextRow;
    });
  }
  
  // 【用途】保存未套用主檔的 KOYA 出貨列，讓主檔刪改後可重新建立畫面資料。
  function setChgShipmentRows(rows) {
    state.chgSourceRowData = (Array.isArray(rows) ? rows : []).map((row) => ({ ...row }));
    state.chgRowData = enrichKoyaShipmentRows(state.chgSourceRowData);
  }
  
  // 【用途】呈現 KOYA 型號主檔表格，按鈕以索引定位，不把使用者文字放入屬性。
  function renderKoyaModelTable() {
    if (state.koyaModelEntries.length === 0) {
      replaceChildrenFromTrustedTemplate(
        ui.koyaModelTableBody,
        '<tr><td colspan="4" class="koya-model-empty">目前沒有型號資料。</td></tr>'
      );
      return;
    }
    const rowsHtml = state.koyaModelEntries.map((entry, index) => `
      <tr>
        <td>${escapeHtml(entry.model)}</td>
        <td>${escapeHtml(entry.pn)}</td>
        <td>${escapeHtml(entry.full_pn)}</td>
        <td class="koya-model-row-actions">
          <button type="button" class="btn-secondary" data-koya-action="edit" data-koya-index="${index}">編輯</button>
          <button type="button" class="btn-danger" data-koya-action="delete" data-koya-index="${index}">刪除</button>
        </td>
      </tr>
    `).join("");
    replaceChildrenFromTrustedTemplate(ui.koyaModelTableBody, rowsHtml);
  }
  
  // 【用途】清除 KOYA 主檔表單的編輯狀態。
  function resetKoyaModelForm() {
    ui.koyaModelForm.reset();
    ui.koyaModelOriginalInput.value = "";
    delete ui.koyaModelForm.dataset.originalModel;
    ui.koyaModelSaveBtn.textContent = "新增資料";
    ui.koyaModelCancelBtn.hidden = true;
  }
  
  // 【用途】展開或收合首頁的 KOYA 型號主檔維護區。
  function setKoyaModelMaintenanceVisibility(visible) {
    const shouldShow = Boolean(visible);
    ui.koyaModelMaintenanceCard.hidden = !shouldShow;
    ui.koyaModelToggleBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
    if (shouldShow) {
      scrollToElement(ui.koyaModelMaintenanceCard);
    }
  }
  
  // 【用途】切換 KOYA 型號主檔維護區。
  function toggleKoyaModelMaintenance() {
    setKoyaModelMaintenanceVisibility(ui.koyaModelMaintenanceCard.hidden);
  }
  
  // 【用途】從後端重新載入 KOYA 主檔，並重新套用至已載入的出貨資料。
  async function loadKoyaModelEntries() {
    const payload = await getKoyaModelsByApi();
    state.koyaModelEntries = Array.isArray(payload.entries) ? payload.entries : [];
    state.chgRowData = enrichKoyaShipmentRows(state.chgSourceRowData);
    renderKoyaModelTable();
    updateStatus(
      { status: ui.koyaModelStatus },
      `已載入 ${state.koyaModelEntries.length} 筆 KOYA 型號資料。`,
      false,
      false,
      true
    );
  }
  
  // 【用途】主檔異動後撤銷既有 KOYA 查詢結果，避免使用者匯出異動前的快照。
  function invalidateKoyaSearchSelection() {
    ui.chgExportBtn.disabled = true;
    if (homeRuntime.customer === "chg") {
      state.currentRow = null;
      state.currentQuery = "";
      homeRuntime.customer = "";
      homeRuntime.query = "";
      setHomeExportEnabled(false);
      updateHomeStatus("KOYA 型號主檔已更新，請重新查詢工單。", false, false, true);
    }
  }
  
  // 【用途】新增或更新 KOYA 主檔，完成後刷新表格與出貨對照結果。
  async function onKoyaModelSubmit(event) {
    event.preventDefault();
    const payload = {
      original_model: String(ui.koyaModelForm.dataset.originalModel ?? "").trim() || null,
      model: ui.koyaModelModelInput.value.trim(),
      pn: ui.koyaModelPnInput.value.trim(),
      full_pn: ui.koyaModelFullPnInput.value.trim()
    };
    setButtonLoading(ui.koyaModelSaveBtn, true);
    try {
      await upsertKoyaModelByApi(payload);
      resetKoyaModelForm();
      await loadKoyaModelEntries();
      invalidateKoyaSearchSelection();
      showToast(`KOYA Model ${payload.model} 已儲存。`, "success");
    } catch (error) {
      const message = `KOYA 型號儲存失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: ui.koyaModelStatus }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(ui.koyaModelSaveBtn, false);
    }
  }
  
  // 【用途】以事件委派處理 KOYA 主檔的編輯與刪除按鈕。
  async function onKoyaModelTableClick(event) {
    const button = event.target.closest("button[data-koya-action][data-koya-index]");
    if (!button) {
      return;
    }
    const entry = state.koyaModelEntries[Number(button.dataset.koyaIndex)];
    if (!entry) {
      return;
    }
    if (button.dataset.koyaAction === "edit") {
      ui.koyaModelOriginalInput.value = entry.model;
      ui.koyaModelForm.dataset.originalModel = entry.model;
      ui.koyaModelModelInput.value = entry.model;
      ui.koyaModelPnInput.value = entry.pn;
      ui.koyaModelFullPnInput.value = entry.full_pn;
      ui.koyaModelSaveBtn.textContent = "儲存修改";
      ui.koyaModelCancelBtn.hidden = false;
      ui.koyaModelModelInput.focus();
      return;
    }
    if (button.dataset.koyaAction !== "delete" || !window.confirm(`確定刪除 Model ${entry.model}？`)) {
      return;
    }
    setButtonLoading(button, true);
    try {
      await deleteKoyaModelByApi({ model: entry.model });
      resetKoyaModelForm();
      await loadKoyaModelEntries();
      invalidateKoyaSearchSelection();
      showToast(`KOYA Model ${entry.model} 已刪除。`, "success");
    } catch (error) {
      const message = `KOYA 型號刪除失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: ui.koyaModelStatus }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(button, false);
    }
  }
  
  // 【用途】呈現 NYX 的 Model 與 PN 型號主檔。
  function renderNyxModelTable() {
    if (state.nyxModelEntries.length === 0) {
      replaceChildrenFromTrustedTemplate(
        ui.nyxModelTableBody,
        '<tr><td colspan="3" class="koya-model-empty">目前沒有型號資料。</td></tr>'
      );
      return;
    }
    const rowsHtml = state.nyxModelEntries.map((entry, index) => `
      <tr>
        <td>${escapeHtml(entry.model)}</td>
        <td>${escapeHtml(entry.pn)}</td>
        <td class="koya-model-row-actions">
          <button type="button" class="btn-secondary" data-nyx-action="edit" data-nyx-index="${index}">編輯</button>
          <button type="button" class="btn-danger" data-nyx-action="delete" data-nyx-index="${index}">刪除</button>
        </td>
      </tr>
    `).join("");
    replaceChildrenFromTrustedTemplate(ui.nyxModelTableBody, rowsHtml);
  }
  
  // 【用途】清除 NYX 主檔表單的編輯狀態。
  function resetNyxModelForm() {
    ui.nyxModelForm.reset();
    delete ui.nyxModelForm.dataset.originalModel;
    ui.nyxModelSaveBtn.textContent = "新增資料";
    ui.nyxModelCancelBtn.hidden = true;
  }
  
  // 【用途】展開或收合首頁的 NYX 型號主檔維護區。
  function setNyxModelMaintenanceVisibility(visible) {
    const shouldShow = Boolean(visible);
    ui.nyxModelMaintenanceCard.hidden = !shouldShow;
    ui.nyxModelToggleBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
    if (shouldShow) {
      scrollToElement(ui.nyxModelMaintenanceCard);
    }
  }
  
  // 【用途】切換 NYX 型號主檔維護區。
  function toggleNyxModelMaintenance() {
    setNyxModelMaintenanceVisibility(ui.nyxModelMaintenanceCard.hidden);
  }
  
  // 【用途】從後端讀取並顯示 NYX 型號主檔。
  async function loadNyxModelEntries() {
    const payload = await getNyxModelsByApi();
    state.nyxModelEntries = Array.isArray(payload.entries) ? payload.entries : [];
    renderNyxModelTable();
    updateStatus(
      { status: ui.nyxModelStatus },
      `已載入 ${state.nyxModelEntries.length} 筆 NYX 型號資料。`,
      false,
      false,
      true
    );
  }
  
  // 【用途】新增或更新 NYX 的 Model 與 PN 主檔。
  async function onNyxModelSubmit(event) {
    event.preventDefault();
    const payload = {
      original_model: String(ui.nyxModelForm.dataset.originalModel ?? "").trim() || null,
      model: ui.nyxModelModelInput.value.trim(),
      pn: ui.nyxModelPnInput.value.trim()
    };
    setButtonLoading(ui.nyxModelSaveBtn, true);
    try {
      await upsertNyxModelByApi(payload);
      resetNyxModelForm();
      await loadNyxModelEntries();
      showToast(`NYX Model ${payload.model} 已儲存。`, "success");
    } catch (error) {
      const message = `NYX 型號儲存失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: ui.nyxModelStatus }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(ui.nyxModelSaveBtn, false);
    }
  }
  
  // 【用途】以事件委派處理 NYX 主檔的編輯與刪除按鈕。
  async function onNyxModelTableClick(event) {
    const button = event.target.closest("button[data-nyx-action][data-nyx-index]");
    if (!button) {
      return;
    }
    const entry = state.nyxModelEntries[Number(button.dataset.nyxIndex)];
    if (!entry) {
      return;
    }
    if (button.dataset.nyxAction === "edit") {
      ui.nyxModelForm.dataset.originalModel = entry.model;
      ui.nyxModelModelInput.value = entry.model;
      ui.nyxModelPnInput.value = entry.pn;
      ui.nyxModelSaveBtn.textContent = "儲存修改";
      ui.nyxModelCancelBtn.hidden = false;
      ui.nyxModelModelInput.focus();
      return;
    }
    if (button.dataset.nyxAction !== "delete" || !window.confirm(`確定刪除 Model ${entry.model}？`)) {
      return;
    }
    setButtonLoading(button, true);
    try {
      await deleteNyxModelByApi({ model: entry.model });
      resetNyxModelForm();
      await loadNyxModelEntries();
      showToast(`NYX Model ${entry.model} 已刪除。`, "success");
    } catch (error) {
      const message = `NYX 型號刪除失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: ui.nyxModelStatus }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(button, false);
    }
  }
  
  // 【用途】取得 KOYA 或 NYX 月份維護元件與狀態設定。
  function getMonthlyReferenceUi(customer) {
    if (customer === "koya") {
      return {
        entries: state.koyaMonthEntries,
        setEntries: (entries) => { state.koyaMonthEntries = entries; },
        form: ui.koyaMonthForm,
        monthInput: ui.koyaMonthMonthInput,
        valueInput: ui.koyaMonthValueInput,
        saveButton: ui.koyaMonthSaveBtn,
        cancelButton: ui.koyaMonthCancelBtn,
        tableBody: ui.koyaMonthTableBody,
        status: ui.koyaModelStatus,
        label: "PO"
      };
    }
    return {
      entries: state.nyxMonthEntries,
      setEntries: (entries) => { state.nyxMonthEntries = entries; },
      form: ui.nyxMonthForm,
      monthInput: ui.nyxMonthMonthInput,
      valueInput: ui.nyxMonthValueInput,
      saveButton: ui.nyxMonthSaveBtn,
      cancelButton: ui.nyxMonthCancelBtn,
      tableBody: ui.nyxMonthTableBody,
      status: ui.nyxModelStatus,
      label: "LOT"
    };
  }
  
  // 【用途】呈現指定客戶的月份／PO 或月份／LOT 對照表。
  function renderMonthlyReferenceTable(customer) {
    const config = getMonthlyReferenceUi(customer);
    if (config.entries.length === 0) {
      replaceChildrenFromTrustedTemplate(
        config.tableBody,
        '<tr><td colspan="3" class="koya-model-empty">載入出貨資料後會自動帶入月份。</td></tr>'
      );
      return;
    }
    const rowsHtml = config.entries.map((entry, index) => `
      <tr>
        <td>${escapeHtml(entry.month)}</td>
        <td>${escapeHtml(entry.value || "—")}</td>
        <td class="koya-model-row-actions">
          <button type="button" class="btn-secondary" data-month-action="edit" data-month-index="${index}">編輯</button>
          <button type="button" class="btn-danger" data-month-action="delete" data-month-index="${index}">刪除</button>
        </td>
      </tr>
    `).join("");
    replaceChildrenFromTrustedTemplate(config.tableBody, rowsHtml);
  }
  
  // 【用途】清除指定客戶的月份編輯表單。
  function resetMonthlyReferenceForm(customer) {
    const config = getMonthlyReferenceUi(customer);
    config.form.reset();
    delete config.form.dataset.originalMonth;
    config.saveButton.textContent = "新增月份";
    config.cancelButton.hidden = true;
  }
  
  // 【用途】讀取指定客戶的月份對照，KOYA 更新後會重新套用至出貨資料。
  async function loadMonthlyReferenceEntries(customer) {
    const config = getMonthlyReferenceUi(customer);
    const payload = await getMonthlyReferencesByApi(customer);
    const entries = Array.isArray(payload.entries) ? payload.entries : [];
    config.setEntries(entries.sort((a, b) =>
      String(a.month).localeCompare(String(b.month), "zh-Hant", { numeric: true })
    ));
    renderMonthlyReferenceTable(customer);
    if (customer === "koya") {
      state.chgRowData = enrichKoyaShipmentRows(state.chgSourceRowData);
    }
  }
  
  // 【用途】從 KOYA 出貨列補齊尚未建立的月份；既有手動值不覆寫。
  async function ensureMonthlyReferencesFromKoyaRows() {
    if (state.chgSourceRowData.length === 0) {
      return;
    }
    const koyaColumns = customers.chg?.columns || {};
    const months = new Map();
    state.chgSourceRowData.forEach((row) => {
      const monthKey = resolveCustomerColumnKey("chg", row, "WORK_ORDER_MONTH") || koyaColumns.WORK_ORDER_MONTH;
      const poKey = resolveCustomerColumnKey("chg", row, "PO") || koyaColumns.PO;
      const month = String(row?.[monthKey] ?? "").trim();
      const po = String(row?.[poKey] ?? "").trim();
      if (!month) {
        return;
      }
      const normalizedMonth = normalizeText(month);
      const current = months.get(normalizedMonth);
      if (!current || (!current.po && po)) {
        months.set(normalizedMonth, { month, po });
      }
    });
    const ensureForCustomer = async (customer, existingEntries) => {
      const existingMonths = new Set(existingEntries.map((entry) => normalizeText(entry.month)));
      const missing = [...months.values()].filter((item) => !existingMonths.has(normalizeText(item.month)));
      await Promise.all(missing.map((item) => upsertMonthlyReferenceByApi(customer, {
        original_month: null,
        month: item.month,
        value: customer === "koya" ? item.po : ""
      })));
      if (missing.length > 0) {
        await loadMonthlyReferenceEntries(customer);
      }
    };
    await ensureForCustomer("koya", state.koyaMonthEntries);
    await ensureForCustomer("nyx", state.nyxMonthEntries);
  }
  
  // 【用途】儲存指定客戶的月份對照資料。
  async function onMonthlyReferenceSubmit(customer, event) {
    event.preventDefault();
    const config = getMonthlyReferenceUi(customer);
    const payload = {
      original_month: String(config.form.dataset.originalMonth ?? "").trim() || null,
      month: config.monthInput.value.trim(),
      value: config.valueInput.value.trim()
    };
    setButtonLoading(config.saveButton, true);
    try {
      await upsertMonthlyReferenceByApi(customer, payload);
      resetMonthlyReferenceForm(customer);
      await loadMonthlyReferenceEntries(customer);
      if (customer === "koya") {
        invalidateKoyaSearchSelection();
      }
      showToast(`${customer === "koya" ? "KOYA" : "NYX"} ${payload.month} ${config.label} 已儲存。`, "success");
    } catch (error) {
      const message = `月份對照儲存失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: config.status }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(config.saveButton, false);
    }
  }
  
  // 【用途】以事件委派處理指定客戶月份對照的編輯與刪除。
  async function onMonthlyReferenceTableClick(customer, event) {
    const config = getMonthlyReferenceUi(customer);
    const button = event.target.closest("button[data-month-action][data-month-index]");
    if (!button) {
      return;
    }
    const entry = config.entries[Number(button.dataset.monthIndex)];
    if (!entry) {
      return;
    }
    if (button.dataset.monthAction === "edit") {
      config.form.dataset.originalMonth = entry.month;
      config.monthInput.value = entry.month;
      config.valueInput.value = entry.value;
      config.saveButton.textContent = "儲存修改";
      config.cancelButton.hidden = false;
      config.valueInput.focus();
      return;
    }
    if (button.dataset.monthAction !== "delete" || !window.confirm(`確定刪除月份 ${entry.month}？`)) {
      return;
    }
    setButtonLoading(button, true);
    try {
      await deleteMonthlyReferenceByApi(customer, { month: entry.month });
      resetMonthlyReferenceForm(customer);
      await loadMonthlyReferenceEntries(customer);
      if (customer === "koya") {
        invalidateKoyaSearchSelection();
      }
      showToast(`月份 ${entry.month} 已刪除。`, "success");
    } catch (error) {
      const message = `月份對照刪除失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: config.status }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(button, false);
    }
  }

  function bindEvents() {
    ui.koyaModelForm.addEventListener("submit", onKoyaModelSubmit);
    ui.koyaModelCancelBtn.addEventListener("click", resetKoyaModelForm);
    ui.koyaModelTableBody.addEventListener("click", onKoyaModelTableClick);
    ui.koyaModelToggleBtn.addEventListener("click", toggleKoyaModelMaintenance);
    ui.nyxModelForm.addEventListener("submit", onNyxModelSubmit);
    ui.nyxModelCancelBtn.addEventListener("click", resetNyxModelForm);
    ui.nyxModelTableBody.addEventListener("click", onNyxModelTableClick);
    ui.nyxModelToggleBtn.addEventListener("click", toggleNyxModelMaintenance);
    ui.koyaMonthForm.addEventListener("submit", (event) => onMonthlyReferenceSubmit("koya", event));
    ui.koyaMonthCancelBtn.addEventListener("click", () => resetMonthlyReferenceForm("koya"));
    ui.koyaMonthTableBody.addEventListener("click", (event) => onMonthlyReferenceTableClick("koya", event));
    ui.nyxMonthForm.addEventListener("submit", (event) => onMonthlyReferenceSubmit("nyx", event));
    ui.nyxMonthCancelBtn.addEventListener("click", () => resetMonthlyReferenceForm("nyx"));
    ui.nyxMonthTableBody.addEventListener("click", (event) => onMonthlyReferenceTableClick("nyx", event));
  }

  return {
    bindEvents,
    ensureMonthlyReferencesFromKoyaRows,
    loadKoyaModelEntries,
    loadMonthlyReferenceEntries,
    loadNyxModelEntries,
    setChgShipmentRows,
    setKoyaModelMaintenanceVisibility,
    setNyxModelMaintenanceVisibility
  };
}

