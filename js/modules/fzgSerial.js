import { generateSnByApi, getFzgStatusByApi, resetFzgByApi } from "./api.js";

export function initFzgSerialGenerator() {
  const card = document.getElementById("fzg-serial-card");
  const form = document.getElementById("fzg-serial-form");
  const status = document.getElementById("fzg-status");
  const output = document.getElementById("fzg-output");
  const copy = document.getElementById("fzg-copy");
  const order = document.getElementById("fzg-work-order");
  const partLabel = document.getElementById("fzg-part-label");
  const startLabel = document.getElementById("fzg-start-label");
  const viewStatus = document.getElementById("fzg-view-status");
  const reset = document.getElementById("fzg-reset");
  let currentOrder = "";
  let busy = false;

  function clearOutput() {
    output.value = "";
    copy.disabled = true;
  }
  function syncKind() {
    const isCustomer = form.elements.kind.value === "customer";
    partLabel.hidden = !isCustomer;
    startLabel.hidden = isCustomer;
    form.elements.part_number.disabled = !isCustomer;
    form.elements.start_hex.disabled = isCustomer;
    clearOutput();
  }
  function setSearchResult(hit) {
    card.hidden = !hit;
    card.open = Boolean(hit);
    currentOrder = hit?.query || "";
    clearOutput();
    if (!hit) return;
    order.textContent = `已命中勤誠工單：${currentOrder}`;
    const row = hit.row || {};
    const partKey = Object.keys(row).find((key) => ["Chenbro PN", "料號", "機種料號", "P/N", "PN", "part number"].includes(key.trim()));
    form.elements.part_number.value = partKey ? String(row[partKey] ?? "").trim() : "";
    const qtyKey = Object.keys(row).find((key) => ["數量", "生產數量", "QTY", "Qty"].includes(key.trim()));
    const qty = qtyKey ? Number(row[qtyKey]) : NaN;
    form.elements.qty.value = Number.isInteger(qty) && qty > 0 && qty <= 99999 ? String(qty) : "1";
    status.textContent = "請確認料號與數量。客序按日曆年份與 ISO 週數共用流水號；MAC 使用獨立流水號。";
  }

  form.elements.kind.addEventListener("change", syncKind);
  form.addEventListener("input", clearOutput);
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!currentOrder || busy) return;
    const kind = form.elements.kind.value;
    const part = form.elements.part_number.value.trim();
    if (kind === "customer" && !part) {
      status.textContent = "請填入勤誠料號。";
      return;
    }
    busy = true;
    form.querySelector("button[type=submit]").disabled = true;
    clearOutput();
    try {
      const result = await generateSnByApi({
        customer: "fzg", key: kind === "customer" ? part : currentOrder,
        qty: Number(form.elements.qty.value), fzg_kind: kind,
        record: `${currentOrder}（${kind === "customer" ? "客序" : "MAC"}）`
      });
      output.value = (result.sn_list || []).join("\n");
      copy.disabled = !output.value;
      status.textContent = `已生成 ${result.generated_count} 筆；本次流水號 ${result.previous_serial + 1}～${result.current_serial}。`;
    } catch (error) {
      status.textContent = error.message || "勤誠序號生成失敗。";
    } finally {
      busy = false;
      form.querySelector("button[type=submit]").disabled = false;
    }
  });
  copy.addEventListener("click", async () => {
    if (!output.value) return;
    try {
      await navigator.clipboard.writeText(output.value);
      status.textContent = "已複製序號。";
    } catch {
      status.textContent = "複製失敗，請選取文字後手動複製。";
    }
  });
  function describe(snapshot) {
    return `MAC 下一號：${snapshot.mac_next || "已達上限"}（剩餘 ${snapshot.mac_remaining}）；客序 ${snapshot.week_key} 下一號：${snapshot.customer_next || "已達上限"}（剩餘 ${snapshot.customer_remaining}）。`;
  }
  viewStatus.addEventListener("click", async () => {
    try { status.textContent = describe(await getFzgStatusByApi()); }
    catch (error) { status.textContent = error.message || "狀態查詢失敗。"; }
  });
  reset.addEventListener("click", async () => {
    if (!currentOrder || busy) return;
    const kind = form.elements.kind.value;
    const label = kind === "mac" ? `MAC 至 ${form.elements.start_hex.value}` : "本週客序至 00001";
    if (!window.confirm(`確定重置勤誠${label}？此操作會重新使用序號。`)) return;
    try {
      const snapshot = await resetFzgByApi({ kind, start_hex: form.elements.start_hex.value });
      clearOutput();
      status.textContent = `已重置。${describe(snapshot)}`;
    } catch (error) { status.textContent = error.message || "重置失敗。"; }
  });
  syncKind();
  return setSearchResult;
}
