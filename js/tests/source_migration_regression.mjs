import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import vm from "node:vm";
import { normalizeText } from "../modules/utils.js";

const source = await readFile(new URL("../app.js", import.meta.url), "utf8");
const workOrder = await readFile(new URL("../modules/workOrder.js", import.meta.url), "utf8");
const context = vm.createContext({ normalizeText, resolveColumnKey: (row, code) => code });
vm.runInContext(source.slice(source.indexOf("function getLunfeiModelAlert("), source.indexOf("function getLunfeiPreviewSN(")), context);
vm.runInContext(workOrder.slice(workOrder.indexOf("export function resolveQtyByPairedSlash("), workOrder.indexOf("export function resolveWorkOrderQty(")).replace("export ", ""), context);
assert.equal(vm.runInContext('getLunfeiModelAlert(" bag428-001d ").disableGenerate', context), true);
assert.equal(vm.runInContext('getLunfeiModelAlert("BAG017-TEST").disableGenerate', context), false);
assert.equal(vm.runInContext('resolveQtyByPairedSlash({MO:"M1/M2",QTY:"2/3"},"M2","MO","QTY")', context), 3);
assert.equal(vm.runInContext('resolveQtyByPairedSlash({MO:"M1/M2",QTY:"2/3"},"M3","MO","QTY")', context), 0);
console.log("Legacy Lunfei model restriction and MO/quantity pairing passed.");
