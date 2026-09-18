import {
  createShipmentSourceByApi,
  getShipmentRefreshStatusByApi,
  getShipmentSourcesByApi,
  previewShipmentSourceByApi,
  resetShipmentSourceByApi,
  startShipmentRefreshByApi,
  updateShipmentSourceByApi
} from "./api.js?v=0.3.70";
import { replaceChildrenFromTrustedTemplate } from "./dom.js";
import { renderSourcePreview } from "./sourcePreview.js?v=0.3.66";
import { createSourceRulesEditor, describeSourceRules } from "./sourceRulesEditor.js?v=0.3.75";
import { state } from "../state.js?v=0.3.70";
import { showToast } from "./toast.js";
import { updateStatus } from "./ui.js";
import { escapeHtml } from "./utils.js";

export function createSourceMaintenance({
  ui,
  autoRestoreExcelData,
  getSafeErrorMessage,
  scrollToElement,
  setButtonLoading,
  setKoyaModelMaintenanceVisibility,
  setNyxModelMaintenanceVisibility,
  vecowLinkController
}) {
  const sourceRulesEditor = createSourceRulesEditor(ui.shipmentSourceForm);
  let shipmentRefreshPollTimer = null;
  let shipmentRefreshWasRunning = false;

  function renderShipmentRefreshStatus(job) {
    if (job && "last_updated_at" in job) {
      ui.shipmentLastUpdated.textContent = job.last_updated_at
        ? `最近更新：${job.last_updated_at}（台北時間）`
        : "最近更新：尚無總表更新日期";
    }
    const status = String(job?.status || "idle");
    const progress = Math.max(0, Math.min(100, Number(job?.progress) || 0));
    if (status === "running") {
      ui.shipmentRefreshProgress.hidden = false;
    } else if (status === "succeeded") {
      ui.shipmentRefreshProgress.hidden = true;
    }
    ui.shipmentRefreshProgress.dataset.status = status;
    ui.shipmentRefreshProgressBar.value = progress;
    ui.shipmentRefreshProgressBar.textContent = `${progress}%`;
    ui.shipmentRefreshPercent.textContent = `${progress}%`;
    ui.shipmentRefreshStage.textContent = String(job?.stage || "尚未執行");
    ui.shipmentRefreshMessage.textContent = String(job?.message || "按下更新資料後開始重建總表。");
    ui.shipmentRefreshMessage.classList.toggle("error", status === "failed");
    ui.shipmentRefreshBtn.disabled = status === "running";
    ui.shipmentRefreshBtn.textContent = status === "running" ? "更新中…" : "更新資料";
  }
  
  function getSelectedShipmentSource() {
    const key = String(ui.shipmentSourceSelect.value || "").trim();
    return state.shipmentSourceEntries.find((entry) => entry.key === key) || null;
  }
  
  let sourcePreviewRevision = 0;
  async function onShipmentSourcePreview() {
    const entry = getSelectedShipmentSource();
    const creating = ui.shipmentSourceSelect.value === "__new__";
    if (!creating && !entry?.is_custom && !entry?.rule_editable) return;
    if (!ui.shipmentSourceForm.reportValidity()) return;
    const panel = document.getElementById("shipment-source-preview");
    const button = document.getElementById("btn-shipment-source-preview");
    const revision = ++sourcePreviewRevision;
    panel.hidden = true;
    setButtonLoading(button, true);
    updateStatus({ status: ui.shipmentSourceStatus }, "正在讀取來源並套用目前規則…");
    try {
      const result = await previewShipmentSourceByApi({
        label: creating ? ui.shipmentSourceNameInput.value.trim() : entry.label,
        path_kind: creating ? ui.shipmentSourceKindSelect.value : entry.path_kind,
        path: ui.shipmentSourcePathInput.value.trim(),
        sheet_rule: ui.shipmentSourceSheetRuleInput.value.trim(),
        file_rule: ui.shipmentSourceFileRuleInput.value.trim(),
        recent_files: ui.shipmentSourceRecentFilesInput.value ? Number(ui.shipmentSourceRecentFilesInput.value) : 1,
        rules: sourceRulesEditor.read()
      });
      if (revision !== sourcePreviewRevision) return;
      renderSourcePreview(panel, result);
      updateStatus({ status: ui.shipmentSourceStatus }, result.error ? "預覽失敗，請查看下方原因。" : "預覽完成；尚未保存設定或更新總表。", Boolean(result.error));
    } catch (error) {
      if (revision === sourcePreviewRevision) updateStatus({ status: ui.shipmentSourceStatus }, `預覽失敗：${getSafeErrorMessage(error)}`, true);
    } finally {
      setButtonLoading(button, false);
    }
  }
  
  function renderShipmentSourceTable() {
    const entries = state.shipmentSourceEntries;
    if (entries.length === 0) {
      replaceChildrenFromTrustedTemplate(
        ui.shipmentSourceTableBody,
        '<tr><td colspan="4" class="koya-model-empty">目前沒有資料來源設定。</td></tr>'
      );
      return;
    }
    const rows = entries.map((entry, index) => {
      const rules = [];
      if (entry.sheet_rule_label) rules.push(`${entry.sheet_rule_label}：${entry.sheet_rule || "未設定"}`);
      if (entry.file_rule_label) rules.push(`${entry.file_rule_label}：${entry.file_rule || "未設定"}`);
      if (entry.recent_files_label) rules.push(`${entry.recent_files_label}：${entry.recent_files ?? "未設定"}`);
      if (entry.customer_keywords) rules.push(`客戶關鍵字：${entry.customer_keywords}`);
      if (entry.rules) rules.push(describeSourceRules(entry));
      return `
        <tr>
          <td>${escapeHtml(entry.label)}</td>
          <td>${escapeHtml(entry.path)}</td>
          <td>${escapeHtml(rules.join("；") || "固定解析規則")}</td>
          <td><button type="button" class="btn-secondary" data-shipment-source-index="${index}">編輯</button></td>
        </tr>
      `;
    }).join("");
    replaceChildrenFromTrustedTemplate(ui.shipmentSourceTableBody, rows);
  }
  
  function populateShipmentSourceForm() {
    sourcePreviewRevision++;
    document.getElementById("shipment-source-preview").hidden = true;
    const selected = getSelectedShipmentSource();
    const creating = ui.shipmentSourceSelect.value === "__new__";
    const entry = selected || (creating ? { path: "", sheet_rule_label: "工作表關鍵字", file_rule_label: "檔名關鍵字", recent_files_label: "最近檔案數", recent_files: 1, is_custom: true } : null);
    if (!entry) return;
    ui.shipmentSourceNameField.hidden = !creating;
    ui.shipmentSourceNameInput.required = creating;
    ui.shipmentSourceKindField.hidden = !creating;
    ui.shipmentSourceResetBtn.hidden = creating || entry.is_custom;
    ui.shipmentSourceSaveBtn.textContent = creating ? "新增來源" : "儲存設定";
    ui.shipmentSourcePathInput.value = entry.path;
    ui.shipmentSourceSheetField.hidden = !entry.sheet_rule_label;
    ui.shipmentSourceSheetRuleInput.required = Boolean(entry.sheet_rule_label);
    ui.shipmentSourceSheetLabel.textContent = entry.sheet_rule_label || "工作表";
    ui.shipmentSourceSheetRuleInput.value = entry.sheet_rule || "";
    ui.shipmentSourceFileField.hidden = !entry.file_rule_label;
    ui.shipmentSourceFileRuleInput.required = Boolean(entry.file_rule_label);
    ui.shipmentSourceFileLabel.textContent = entry.file_rule_label || "檔名關鍵字";
    ui.shipmentSourceFileRuleInput.value = entry.file_rule || "";
    ui.shipmentSourceRecentField.hidden = !entry.recent_files_label;
    ui.shipmentSourceRecentFilesInput.required = Boolean(entry.recent_files_label);
    ui.shipmentSourceRecentLabel.textContent = entry.recent_files_label || "最近檔案數";
    ui.shipmentSourceRecentFilesInput.value = entry.recent_files ?? "";
    document.getElementById("shipment-source-customer-keywords").value = entry.customer_keywords || "";
    sourceRulesEditor.load(entry);
    const ruleSummary = document.getElementById("shipment-source-rule-summary");
    ruleSummary.hidden = !(entry.rule_summary || entry.rule_editable);
    ruleSummary.textContent = entry.rule_summary || (entry.rules ? "目前使用共用可編輯規則；儲存後於下次更新生效。" : "已載入現有規則的可編輯範本；儲存後才會改用共用規則，還原預設可回到專用處理器。");
    document.getElementById("shipment-source-search-fields").hidden = !entry.is_custom;
    document.getElementById("shipment-source-search-customer").value = entry.search_customer || "";
    const workOrderColumn = document.getElementById("shipment-source-work-order-column");
    workOrderColumn.value = entry.work_order_column || "";
    workOrderColumn.disabled = !entry.is_custom;
    document.getElementById("btn-shipment-source-preview").hidden = !entry.is_custom && !entry.rule_editable;
  }
  
  async function loadShipmentSourceEntries(preferredKey = "") {
    const payload = await getShipmentSourcesByApi();
    state.shipmentSourceEntries = Array.isArray(payload.entries) ? payload.entries : [];
    const selectedKey = preferredKey || ui.shipmentSourceSelect.value || state.shipmentSourceEntries[0]?.key || "";
    const options = state.shipmentSourceEntries
      .map((entry) => `<option value="${escapeHtml(entry.key)}">${escapeHtml(entry.label)}</option>`)
      .join("") + '<option value="__new__">＋ 新增資料來源</option>';
    replaceChildrenFromTrustedTemplate(ui.shipmentSourceSelect, options);
    ui.shipmentSourceSelect.value = state.shipmentSourceEntries.some((entry) => entry.key === selectedKey)
      ? selectedKey
      : (state.shipmentSourceEntries[0]?.key || "");
    populateShipmentSourceForm();
    renderShipmentSourceTable();
    updateStatus(
      { status: ui.shipmentSourceStatus },
      `已載入 ${state.shipmentSourceEntries.length} 個資料來源設定。`,
      false,
      false,
      true
    );
  }
  
  function setShipmentSourceMaintenanceVisibility(visible) {
    const shouldShow = Boolean(visible);
    ui.shipmentSourceMaintenanceCard.hidden = !shouldShow;
    ui.shipmentSourceToggleBtn.setAttribute("aria-expanded", shouldShow ? "true" : "false");
    if (shouldShow) scrollToElement(ui.shipmentSourceMaintenanceCard);
  }
  
  function setMaintenanceEntriesVisibility(visible, announce = false) {
    const shouldShow = Boolean(visible);
    vecowLinkController.setMaintenanceVisible(shouldShow);
    [ui.shipmentSourceToggleBtn, ui.koyaModelToggleBtn, ui.nyxModelToggleBtn].forEach((button) => {
      button.hidden = !shouldShow;
    });
    if (!shouldShow) {
      setShipmentSourceMaintenanceVisibility(false);
      setKoyaModelMaintenanceVisibility(false);
      setNyxModelMaintenanceVisibility(false);
    }
    if (announce) {
      showToast(shouldShow ? "維護入口已顯示。" : "維護入口已隱藏。", "info");
    }
  }
  
  async function toggleShipmentSourceMaintenance() {
    const shouldShow = ui.shipmentSourceMaintenanceCard.hidden;
    setShipmentSourceMaintenanceVisibility(shouldShow);
    if (!shouldShow) return;
    try {
      await loadShipmentSourceEntries();
    } catch (error) {
      updateStatus({ status: ui.shipmentSourceStatus }, `資料來源載入失敗：${getSafeErrorMessage(error)}`, true);
    }
  }
  
  async function onShipmentSourceSubmit(event) {
    event.preventDefault();
    const entry = getSelectedShipmentSource();
    const creating = ui.shipmentSourceSelect.value === "__new__";
    if (!entry && !creating) return;
    const recentValue = ui.shipmentSourceRecentFilesInput.value;
    const payload = {
      path: ui.shipmentSourcePathInput.value.trim(),
      sheet_rule: creating || entry.sheet_rule_label ? ui.shipmentSourceSheetRuleInput.value.trim() : "",
      file_rule: creating || entry.file_rule_label ? ui.shipmentSourceFileRuleInput.value.trim() : "",
      recent_files: (creating || entry.recent_files_label) && recentValue ? Number(recentValue) : null,
      customer_keywords: document.getElementById("shipment-source-customer-keywords").value.trim()
    };
    setButtonLoading(ui.shipmentSourceSaveBtn, true);
    try {
      if (creating || entry.is_custom || entry.rule_editable) payload.rules = sourceRulesEditor.read();
      if (creating || entry.is_custom) {
        payload.search_customer = document.getElementById("shipment-source-search-customer").value;
        payload.work_order_column = document.getElementById("shipment-source-work-order-column").value.trim();
      }
      const saved = creating
        ? await createShipmentSourceByApi({ ...payload, label: ui.shipmentSourceNameInput.value.trim(), path_kind: ui.shipmentSourceKindSelect.value })
        : await updateShipmentSourceByApi(entry.key, payload);
      await loadShipmentSourceEntries(saved.key);
      showToast(`${saved.label}來源設定已儲存，下次更新時生效。`, "success");
    } catch (error) {
      const message = `資料來源儲存失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: ui.shipmentSourceStatus }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(ui.shipmentSourceSaveBtn, false);
    }
  }
  
  async function onShipmentSourceReset() {
    const entry = getSelectedShipmentSource();
    if (!entry || !window.confirm(`確定將「${entry.label}」還原為正式環境預設設定？`)) return;
    setButtonLoading(ui.shipmentSourceResetBtn, true);
    try {
      await resetShipmentSourceByApi(entry.key);
      await loadShipmentSourceEntries(entry.key);
      showToast(`${entry.label}已還原預設設定。`, "success");
    } catch (error) {
      const message = `還原預設失敗：${getSafeErrorMessage(error)}`;
      updateStatus({ status: ui.shipmentSourceStatus }, message, true);
      showToast(message, "error");
    } finally {
      setButtonLoading(ui.shipmentSourceResetBtn, false);
    }
  }
  
  function onShipmentSourceTableClick(event) {
    const button = event.target.closest("button[data-shipment-source-index]");
    if (!button) return;
    const entry = state.shipmentSourceEntries[Number(button.dataset.shipmentSourceIndex)];
    if (!entry) return;
    ui.shipmentSourceSelect.value = entry.key;
    populateShipmentSourceForm();
    scrollToElement(ui.shipmentSourceForm);
    ui.shipmentSourcePathInput.focus();
  }
  
  function scheduleShipmentRefreshPoll() {
    if (shipmentRefreshPollTimer !== null) {
      window.clearTimeout(shipmentRefreshPollTimer);
    }
    shipmentRefreshPollTimer = window.setTimeout(() => {
      shipmentRefreshPollTimer = null;
      syncShipmentRefreshStatus(true);
    }, 1000);
  }
  
  async function syncShipmentRefreshStatus(notifyCompletion = false) {
    try {
      const job = await getShipmentRefreshStatusByApi();
      renderShipmentRefreshStatus(job);
      if (job.status === "running") {
        shipmentRefreshWasRunning = true;
        scheduleShipmentRefreshPoll();
        return;
      }
      if (!shipmentRefreshWasRunning) {
        return;
      }
      shipmentRefreshWasRunning = false;
      if (job.status === "succeeded") {
        await autoRestoreExcelData();
        if (notifyCompletion) {
          showToast("出貨資料更新完成，已重新載入最新總表。", "success");
        }
      } else if (job.status === "failed" && notifyCompletion) {
        showToast(`資料更新失敗：${job.message}`, "error");
      }
    } catch (error) {
      shipmentRefreshWasRunning = false;
      ui.shipmentRefreshBtn.disabled = false;
      ui.shipmentRefreshMessage.textContent = `無法取得更新狀態：${getSafeErrorMessage(error)}`;
      ui.shipmentRefreshMessage.classList.add("error");
    }
  }
  
  async function onShipmentRefreshClick() {
    ui.shipmentRefreshBtn.disabled = true;
    ui.shipmentRefreshProgress.hidden = false;
    renderShipmentRefreshStatus({
      status: "running",
      progress: 0,
      stage: "準備更新",
      message: "正在送出更新請求。"
    });
    try {
      const job = await startShipmentRefreshByApi();
      shipmentRefreshWasRunning = true;
      renderShipmentRefreshStatus(job);
      scheduleShipmentRefreshPoll();
      showToast("已開始更新出貨資料。", "info");
    } catch (error) {
      ui.shipmentRefreshBtn.disabled = false;
      ui.shipmentRefreshMessage.textContent = `無法啟動更新：${getSafeErrorMessage(error)}`;
      ui.shipmentRefreshMessage.classList.add("error");
      showToast(`無法啟動更新：${getSafeErrorMessage(error)}`, "error");
    }
  }

  function bindEvents() {
    ui.shipmentRefreshBtn.addEventListener("click", onShipmentRefreshClick);
    ui.shipmentSourceToggleBtn.addEventListener("click", toggleShipmentSourceMaintenance);
    ui.shipmentSourceSelect.addEventListener("change", populateShipmentSourceForm);
    ui.shipmentSourceNewBtn.addEventListener("click", () => {
      ui.shipmentSourceSelect.value = "__new__";
      ui.shipmentSourceNameInput.value = "";
      populateShipmentSourceForm();
      ui.shipmentSourceNameInput.focus();
    });
    ui.shipmentSourceForm.addEventListener("submit", onShipmentSourceSubmit);
    document.getElementById("btn-shipment-source-preview").addEventListener("click", onShipmentSourcePreview);
    ui.shipmentSourceForm.addEventListener("input", () => {
      sourcePreviewRevision++;
      document.getElementById("shipment-source-preview").hidden = true;
    });
    ui.shipmentSourceForm.addEventListener("click", (event) => {
      if (event.target.closest("[data-add-rule], .source-rule-row button")) {
        sourcePreviewRevision++;
        document.getElementById("shipment-source-preview").hidden = true;
      }
    });
    ui.shipmentSourceResetBtn.addEventListener("click", onShipmentSourceReset);
    ui.shipmentSourceTableBody.addEventListener("click", onShipmentSourceTableClick);
  }

  return {
    bindEvents,
    setMaintenanceEntriesVisibility,
    setShipmentSourceMaintenanceVisibility,
    syncShipmentRefreshStatus
  };
}

