import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

let storedUrl = "https://example.com/VECOW.xlsx";
globalThis.vecowTestApi = {
  getVecowLinkByApi: async () => ({ url: storedUrl }),
  saveVecowLinkByApi: async (url) => { storedUrl = url; return { url }; }
};
const source = (await readFile(new URL("../modules/vecowLink.js", import.meta.url), "utf8"))
  .replace(/^import .*;\r?\n/, "const { getVecowLinkByApi, saveVecowLinkByApi } = globalThis.vecowTestApi;\n");
const { createVecowLinkController } = await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
const elements = new Map();
globalThis.document = {
  getElementById(id) {
    if (!elements.has(id)) elements.set(id, {
      hidden: true, value: "", disabled: false, handlers: {}, attributes: {},
      addEventListener(type, handler) { this.handlers[type] = handler; },
      setAttribute(name, value) { this.attributes[name] = value; },
      removeAttribute(name) { delete this[name]; },
      scrollIntoView() {}
    });
    return elements.get(id);
  }
};
const notices = [];
const controller = createVecowLinkController((message, type) => notices.push({ message, type }));
const node = (id) => elements.get(id);
await controller.load();
assert.equal(node("bng-vecow-link").hidden, false);
assert.equal(node("home-vecow-link").hidden, true);
controller.setHomeCustomer("bng");
assert.equal(node("home-vecow-link").hidden, false);
controller.setHomeCustomer("chg");
assert.equal(node("home-vecow-link").hidden, true);
controller.setMaintenanceVisible(true);
assert.equal(node("btn-vecow-link-toggle").hidden, false);
node("vecow-link-url").value = "https://example.com/new.xlsx";
await node("vecow-link-form").handlers.submit({ preventDefault() {} });
assert.equal(node("bng-vecow-link").href, storedUrl);
assert.equal(notices.at(-1).type, "success");
node("vecow-link-url").value = "";
await node("vecow-link-form").handlers.submit({ preventDefault() {} });
assert.equal(node("bng-vecow-link").hidden, true);
assert.equal(node("bng-vecow-link").href, undefined);
controller.setMaintenanceVisible(false);
assert.equal(node("btn-vecow-link-toggle").hidden, true);
assert.equal(node("vecow-link-maintenance-card").hidden, true);
console.log("VECOW link display and maintenance regression passed.");
