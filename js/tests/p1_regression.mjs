import assert from "node:assert/strict";


const copiedValues = [];
globalThis.window = { isSecureContext: true };
Object.defineProperty(globalThis, "navigator", {
  configurable: true,
  value: {
    clipboard: {
      async writeText(value) {
        copiedValues.push(value);
      }
    }
  }
});
globalThis.setTimeout = (callback) => {
  callback();
  return 1;
};

const { bindSheetCopyCellsIn } = await import("../modules/uiClipboard.js");
const listeners = [];
const root = {
  addEventListener(type, listener) {
    listeners.push({ type, listener });
  },
  contains(node) {
    return node?.insideRoot === true;
  }
};

bindSheetCopyCellsIn(root, () => assert.fail("copy should not fail"));
bindSheetCopyCellsIn(root, () => assert.fail("duplicate binding should be ignored"));
assert.equal(listeners.length, 1, "同一 root 重複 bind 時只能建立一個 listener");
assert.equal(listeners[0].type, "click");

const classes = new Set();
const cell = {
  insideRoot: true,
  closest(selector) {
    return selector === ".copyable-cell" ? this : null;
  },
  getAttribute(name) {
    return name === "data-copy-value" ? "SN-0001" : null;
  },
  classList: {
    add(value) {
      classes.add(value);
    },
    remove(value) {
      classes.delete(value);
    }
  }
};

await listeners[0].listener({ target: cell });
assert.deepEqual(copiedValues, ["SN-0001"], "動態儲存格應由 root listener 完成複製");
assert.equal(classes.has("copied"), false, "複製回饋結束後應移除 copied class");

await listeners[0].listener({ target: { closest: () => null } });
assert.equal(copiedValues.length, 1, "非儲存格 click 不應觸發複製");

process.stdout.write("P1 frontend event-delegation regression passed.\n");
