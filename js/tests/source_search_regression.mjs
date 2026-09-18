import assert from "node:assert/strict";
import { findCustomerSources, findSourceRows } from "../modules/sourceSearch.js";
import { createHomeController } from "../modules/homeController.js";
import { normalizeText } from "../modules/utils.js";

const source = { key: "custom_new", label: "新客戶", rows: [
  { "工令號": "00123", Model: "NewModel", "數量": "7" },
  { "工令號": "MO-2 / MO-3", Model: "Other" },
] };
assert.equal(findSourceRows(source, "00123", true).length, 1);
assert.equal(findSourceRows(source, "newmodel").length, 1);
assert.equal(findSourceRows(source, "MO-3", true).length, 1);
assert.equal(findSourceRows({ ...source, column: "工令號" }, "NewModel").length, 0);
assert.equal(findSourceRows(source, "missing").length, 0);
assert.deepEqual(findCustomerSources([
  { key: "a", customer_keywords: "營邦, ALG" },
  { key: "b", customer_keywords: "超恩\nVECOW" }
], "vecow").map((item) => item.key), ["b"]);
const state = { customSourceData: [source], currentRow: null };
for (const key of ["yingbang", "lunfei", "bng", "chg", "hmg", "clg"]) state[`${key}RowData`] = [];
state.yingbangRowData = [{ WORK_ORDER: "0012345" }];
const ui = { homeSearchInput: { value: "00123" } };
let target, message, exportEnabled, previewTarget;
const noop = () => {};
const controller = createHomeController({ ui, state, homeRuntime: {}, normalizeText, escapeHtml: String, getSafeErrorMessage: String,
  setHomeCustomerTheme: noop, runHomeSearchByCustomer: async (key, query) => { target = key; state.currentRow = findSourceRows(state.customSourceData.find((item) => item.key === key), query)[0] || null; },
  getRowValueByCustomerColumnCode: (_key, row, code) => row[code], findHmgRowsByModel: () => [], findClgRowsByModel: () => [],
  setHomeLoading: noop, setHomeExportEnabled: (value) => { exportEnabled = value; }, setHomeBngPrintEnabled: noop,
  updateHomeStatus: (value) => { message = value; }, showToast: noop, scrollToElement: noop, syncHomePreviewPanel: (key) => { previewTarget = key; } });
await controller.performHomeSearch();
assert.equal(target, "custom_new");
assert.match(message, /新客戶/);
assert.equal(exportEnabled, false);
// 不需要修改客戶列表，新增的來源會直接進入同一搜尋。
state.customSourceData.push({ key: "custom_later", label: "下一個客戶", rows: [{ 工單: "LATER-1" }] });
ui.homeSearchInput.value = "LATER-1";
await controller.performHomeSearch();
assert.equal(target, "custom_later");
assert.match(message, /下一個客戶/);
state.customSourceData.push({ key: "dcg", label: "富弘年出貨", rows: [{ 製令單號: "DCG-001", 產品型號: "D1" }] });
ui.homeSearchInput.value = "DCG-001";
await controller.performHomeSearch();
assert.equal(target, "dcg");
assert.equal(previewTarget, "dcg");
assert.match(message, /富弘年出貨/);
assert.equal(exportEnabled, false);

state.shipmentSourceEntries = [{ key: "custom_new", label: "新客戶", customer_keywords: "新客戶, NEW" }];
ui.homeSearchTypeSelect = { value: "customer" };
ui.homeSearchInput.value = "new";
let customerResults = [];
const customerController = createHomeController({ ui, state, homeRuntime: {}, normalizeText, escapeHtml: String, getSafeErrorMessage: String,
  setHomeCustomerTheme: noop, runHomeSearchByCustomer: noop,
  getRowValueByCustomerColumnCode: noop, findHmgRowsByModel: () => [], findClgRowsByModel: () => [],
  setHomeLoading: noop, setHomeExportEnabled: noop, setHomeBngPrintEnabled: noop,
  updateHomeStatus: (value) => { message = value; }, showToast: noop, scrollToElement: noop, syncHomePreviewPanel: noop,
  renderHomeCustomerResults: (sources) => { customerResults = sources; }
});
await customerController.performHomeSearch();
assert.equal(customerResults[0].rows.length, 2);
assert.match(message, /2 筆/);
ui.homeSearchTypeSelect.value = "workorder";
console.log("Dynamic source search, exact priority, full fields and custom columns passed.");

const fzg = { key: "fzg", label: "勤誠", column: "DDC MO", rows: [{ "DDC MO": "11115986(200)*100", "Chenbro PN": "380-41710-3000A0", "DDC PN": "FZG109-0018", QTY: "100" }] };
state.customSourceData.push(fzg);
let fzgHit = null;
const fzgController = createHomeController({ ui, state, homeRuntime: {}, normalizeText, escapeHtml: String, getSafeErrorMessage: String,
  setHomeCustomerTheme: noop,
  runHomeSearchByCustomer: async (key, query) => { target = key; state.currentRow = findSourceRows(fzg, query)[0] || null; },
  getRowValueByCustomerColumnCode: (_key, row, code) => row[code], findHmgRowsByModel: () => [], findClgRowsByModel: () => [],
  setHomeLoading: noop, setHomeExportEnabled: noop, setHomeBngPrintEnabled: noop,
  updateHomeStatus: noop, showToast: noop, scrollToElement: noop, syncHomePreviewPanel: noop,
  setFzgSearchResult: (hit) => { fzgHit = hit; }
});
ui.homeSearchInput.value = "11115986";
await fzgController.performHomeSearch();
assert.equal(target, "fzg");
assert.equal(fzgHit?.row?.["Chenbro PN"], "380-41710-3000A0");

const fields = { kind: { value: "customer", addEventListener: noop }, part_number: { value: "" }, start_hex: { value: "200000" }, qty: { value: "1" } };
const form = { elements: fields, addEventListener: noop };
const elements = Object.fromEntries(["fzg-serial-card", "fzg-status", "fzg-output", "fzg-copy", "fzg-work-order", "fzg-part-label", "fzg-start-label", "fzg-view-status", "fzg-reset"].map((id) => [id, { addEventListener: noop }]));
elements["fzg-serial-form"] = form;
globalThis.document = { getElementById: (id) => elements[id] };
const { initFzgSerialGenerator } = await import("../modules/fzgSerial.js");
initFzgSerialGenerator()(fzgHit);
assert.equal(fields.part_number.value, "380-41710-3000A0");
assert.equal(fields.qty.value, "100");
assert.equal(elements["fzg-serial-card"].hidden, false);
assert.equal(elements["fzg-serial-card"].open, true);
ui.homeSearchInput.value = "MISSING";
await fzgController.performHomeSearch();
assert.equal(fzgHit, null);
