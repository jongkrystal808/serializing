import assert from "node:assert/strict";
import { getDegTodayValues, findDegWorkOrderRows, setDegGeneratorVisible } from "../modules/deg.js";
import { createHomeController } from "../modules/homeController.js";
import { normalizeText } from "../modules/utils.js";

assert.deepEqual(getDegTodayValues(new Date(2026, 8, 14)), {
  hl: "2638", pizza_carton: "260914", week: "38", weekday: "1", year_last: "6"
});
// 原程式使用日曆年份 + ISO 週數，跨年時不可改成 ISO 年份。
assert.deepEqual(getDegTodayValues(new Date(2021, 0, 1)), {
  hl: "2153", pizza_carton: "210101", week: "53", weekday: "5", year_last: "1"
});
assert.equal(getDegTodayValues(new Date(2026, 8, 20)).weekday, "7");
const card = { hidden: true, open: false };
globalThis.document = { getElementById: () => card };
const degRows = [{ "製令單號": "01234567", "型號": "M2A" }, { MO: "MO-2 / MO-3" }];
assert.equal(findDegWorkOrderRows(degRows, "01234567").length, 1);
assert.equal(findDegWorkOrderRows(degRows, "MO-3", true).length, 1);
assert.equal(findDegWorkOrderRows(degRows, "M2A").length, 0);
assert.equal(findDegWorkOrderRows([{ MO: "OTHER", "工令號": "20260323001" }], "20260323001", true, "工令號").length, 1);
assert.equal(findDegWorkOrderRows([{ MO: "OTHER", "工令號": "20260323001" }], "OTHER", false, "工令號").length, 0);
const state = { degRowData: degRows, currentRow: null };
for (const key of ["yingbang", "lunfei", "bng", "chg", "hmg", "clg"]) state[`${key}RowData`] = [];
state.yingbangRowData = [{ WORK_ORDER: "OTHER-1" }];
const ui = { homeSearchInput: { value: "01234567" } };
const runtime = {};
let target;
const noop = () => {};
const controller = createHomeController({
  ui, state, homeRuntime: runtime, normalizeText, escapeHtml: String, getSafeErrorMessage: String,
  setHomeCustomerTheme: (key) => setDegGeneratorVisible(key === "deg" && Boolean(state.currentRow)),
  runHomeSearchByCustomer: async (key) => { target = key; state.currentRow = key === "deg" ? degRows[0] : state.yingbangRowData[0]; },
  getRowValueByCustomerColumnCode: (_key, row, code) => row[code],
  findHmgRowsByModel: () => [], findClgRowsByModel: () => [],
  setHomeLoading: noop, setHomeExportEnabled: noop, setHomeBngPrintEnabled: noop,
  updateHomeStatus: noop, showToast: noop, scrollToElement: noop, syncHomePreviewPanel: noop,
});
await controller.performHomeSearch();
assert.equal(target, "deg");
assert.equal(card.hidden, false);
assert.equal(card.open, true);
ui.homeSearchInput.value = "OTHER-1";
await controller.performHomeSearch();
assert.equal(target, "yingbang");
assert.equal(card.hidden, true);
ui.homeSearchInput.value = "MISSING";
await controller.performHomeSearch();
assert.equal(card.hidden, true);
ui.homeSearchInput.value = "01234567";
await controller.performHomeSearch();
ui.homeSearchInput.value = "";
await controller.performHomeSearch();
assert.equal(card.hidden, true);
ui.homeSearchInput.value = "01234567";
ui.homeSearchTypeSelect = { value: "model" };
await controller.performHomeSearch();
assert.equal(card.hidden, true);
console.log("DEG date and ISO week regression passed.");
