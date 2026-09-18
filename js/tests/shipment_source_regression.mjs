import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";

const source = await readFile(new URL("../modules/sourceMaintenance.js", import.meta.url), "utf8");
assert.doesNotMatch(source, /!shouldShow \|\| state\.shipmentSourceEntries\.length > 0/, "展開維護頁不得因資料已在記憶體而跳過表單渲染");
const api = await readFile(new URL("../modules/api.js", import.meta.url), "utf8");
const { createShipmentSourceByApi } = await import(`data:text/javascript;base64,${Buffer.from(api).toString("base64")}`);
const ui = new Proxy({}, { get(target, key) { return target[key] ??= { value: "", hidden: false }; } });
const requests = [];
globalThis.fetch = async (url, options) => {
  requests.push({ url, ...options });
  return { ok: true, headers: new Headers({ "Content-Type": "application/json" }),
    json: async () => ({ success: true, data: { key: "custom_test", label: "新客戶" } }) };
};
const context = vm.createContext({
  document: { getElementById() { return { hidden: true, value: "" }; } },
  ui, state: { shipmentSourceEntries: [] }, createShipmentSourceByApi,
  loadShipmentSourceEntries: async (key) => assert.equal(key, "custom_test"),
  setButtonLoading() {}, showToast() {}, updateStatus() {},
  sourceRulesEditor: { load() {}, read() { return null; } },
  getSafeErrorMessage: (error) => { throw error; }
});
function extract(name, next) {
  return source.slice(source.indexOf(name), source.indexOf(next, source.indexOf(name)));
}
vm.runInContext(extract("function getSelectedShipmentSource()", "function renderShipmentSourceTable()") +
  extract("function populateShipmentSourceForm()", "async function loadShipmentSourceEntries") +
  extract("async function onShipmentSourceSubmit(event)", "async function onShipmentSourceReset()"), context);
ui.shipmentSourceSelect.value = "__new__";
vm.runInContext("populateShipmentSourceForm()", context);
assert.equal(ui.shipmentSourceNameInput.required, true);
assert.equal(ui.shipmentSourceSheetRuleInput.required, true);
assert.equal(ui.shipmentSourceFileRuleInput.required, true);
assert.equal(ui.shipmentSourceRecentFilesInput.value, 1);
ui.shipmentSourceRecentFilesInput.value = "1";
ui.shipmentSourceNameInput.value = "新客戶";
ui.shipmentSourceKindSelect.value = "file";
ui.shipmentSourcePathInput.value = "/mnt/new.xlsx";
ui.shipmentSourceSheetRuleInput.value = "出貨";
ui.shipmentSourceFileRuleInput.value = "new";
await vm.runInContext("onShipmentSourceSubmit({ preventDefault() {} })", context);
assert.equal(requests.length, 1);
assert.equal(requests[0].url, "/api/shipment-sources");
assert.equal(requests[0].method, "POST");
assert.deepEqual(JSON.parse(requests[0].body), {
  label: "新客戶", path_kind: "file", path: "/mnt/new.xlsx",
  sheet_rule: "出貨", file_rule: "new", recent_files: 1, rules: null,
  customer_keywords: "", search_customer: "", work_order_column: ""
});
const css = await readFile(new URL("../../styles/main.css", import.meta.url), "utf8");
assert.match(css, /\.shipment-source-form \[hidden\]\s*\{\s*display:\s*none\s*!important/);
console.log("Shipment source form and POST regression passed.");
