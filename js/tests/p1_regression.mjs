import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";


const copiedValues = [];
globalThis.window = {
  isSecureContext: true,
  CUSTOMERS: Object.fromEntries(
    ["yingbang", "lunfei", "bng", "chg", "hmg", "clg"].map((key) => [key, { key }])
  )
};
globalThis.localStorage = { getItem: () => null, setItem: () => {} };
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
const { getCustomerRegistry } = await import("../modules/customers.js");
const { createUiRefs } = await import("../state.js");
const { readJsonStorage, setStorageErrorHandler, writeStorageItem } = await import("../modules/storage.js");
const { splitBngModelAndRemark } = await import("../modules/bngReceipt.js");
const { escapeHtmlAttribute } = await import("../modules/utils.js");
const { updateStatus } = await import("../modules/ui.js");
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

const stylesheet = readFileSync(new URL("../../styles/main.css", import.meta.url), "utf8");
assert.doesNotMatch(stylesheet, /^\s*#[A-Za-z_-][\w-]*/m, "CSS 不應使用 ID 選擇器");

for (const customer of ["yingbang", "lunfei", "bng", "chg", "hmg", "clg"]) {
  assert.match(
    stylesheet,
    new RegExp(`\\.home-theme-${customer}\\s*\\{[^}]*--home-theme-accent:`, "s"),
    `${customer} 主題應透過 --home-theme-accent 設定`
  );
}

const fixedLayoutPixels = stylesheet
  .split("\n")
  .filter((line) => /\d+(?:\.\d+)?px/.test(line))
  .filter((line) => !/^\s*(?:border(?:-(?!radius)[\w-]+)?|outline|box-shadow)\s*:/.test(line))
  .filter((line) => !/^\s*border-radius:\s*999px/.test(line));
assert.deepEqual(fixedLayoutPixels, [], "版面與字級尺寸應使用 rem/em，僅保留像素邊線與膠囊圓角");

assert.equal(Object.keys(getCustomerRegistry()).length, 6, "CUSTOMERS 初始化後應通過集中驗證");
const originalCustomers = window.CUSTOMERS;
delete window.CUSTOMERS;
assert.throws(() => getCustomerRegistry(), /CUSTOMERS 尚未初始化/);
window.CUSTOMERS = originalCustomers;

assert.throws(
  () => createUiRefs({ getElementById: () => null }),
  /缺少必要 DOM 元素/,
  "DOM 不完整時應在初始化階段提供明確錯誤"
);

const storageErrors = [];
setStorageErrorHandler((detail) => storageErrors.push(detail));
const originalConsoleError = console.error;
console.error = () => {};
globalThis.localStorage = {
  setItem() {
    throw new DOMException("quota exceeded", "QuotaExceededError");
  }
};
assert.equal(writeStorageItem("test-key", "value"), false);
assert.equal(storageErrors[0]?.operation, "write", "localStorage 寫入失敗必須通知呼叫端");
globalThis.localStorage = { getItem: () => "{broken-json" };
assert.deepEqual(readJsonStorage("broken-key", {}), {});
assert.equal(storageErrors[1]?.operation, "parse", "損壞的 localStorage JSON 不得靜默忽略");
console.error = originalConsoleError;

assert.deepEqual(
  splitBngModelAndRemark("MODEL-X   1． 更換 BIOS"),
  { model: "MODEL-X", remark: "1． 更換 BIOS" }
);
assert.deepEqual(
  splitBngModelAndRemark("MODEL-X 1.2"),
  { model: "MODEL-X 1.2", remark: "" },
  "版本號不可誤判為備註"
);

const encodedAttribute = escapeHtmlAttribute("\"'`=\r\n<img>");
assert.doesNotMatch(encodedAttribute, /["'`=\r\n<>]/, "屬性 encoder 必須處理控制字元與屬性分隔符");

const rendererSource = readFileSync(new URL("../modules/uiPreviewRenderers.js", import.meta.url), "utf8");
for (const functionName of ["renderLunfeiSearchSuccess", "renderBngSearchSuccess", "renderChgSearchSuccess"]) {
  const functionStart = rendererSource.indexOf(`export function ${functionName}`);
  const nextExport = rendererSource.indexOf("\nexport function ", functionStart + 1);
  const functionSource = rendererSource.slice(functionStart, nextExport < 0 ? undefined : nextExport);
  assert.match(functionSource, /renderCustomerSearchSuccessLayout\(/, `${functionName} 應使用資料驅動共用元件`);
  assert.doesNotMatch(functionSource, /\.innerHTML\s*=/, `${functionName} 不應自行維護完整 HTML shell`);
}

const homeControllerSource = readFileSync(new URL("../modules/homeController.js", import.meta.url), "utf8");
assert.doesNotMatch(
  homeControllerSource,
  /["'](?:yingbang|lunfei|bng|chg|hmg|clg)["']/,
  "homeController 客戶 key 應集中於 CUSTOMER_KEYS"
);

const indexSource = readFileSync(new URL("../../index.html", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../state.js", import.meta.url), "utf8");
const requiredDomIds = [...stateSource.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
const missingDomIds = requiredDomIds.filter((id) => !indexSource.includes(`id="${id}"`));
assert.deepEqual(missingDomIds, [], "state.js 的必要 DOM refs 必須全部存在於 index.html");

const statusClasses = new Set(["status-message"]);
const statusElement = {
  textContent: "",
  classList: {
    toggle(name, enabled) {
      enabled ? statusClasses.add(name) : statusClasses.delete(name);
    }
  }
};
updateStatus({ status: statusElement }, "失敗", true);
assert.equal(statusClasses.has("status-message"), true, "狀態更新不得清除語意 class");
assert.equal(statusClasses.has("error"), true);
updateStatus({ status: statusElement }, "MO 命中 2 筆", false, false, false, true);
assert.equal(statusClasses.has("duplicate-hit"), true, "MO 重複命中提示應套用醒目樣式");

assert.match(rendererSource, /renderDuplicateMoRows\(matchedRows\)/, "MO 命中兩筆時預覽應顯示兩筆來源資料");
assert.match(homeControllerSource, /matchedRows\.length === 2/, "首頁應辨識 MO 恰好命中兩筆的情境");

const moduleDirectory = new URL("../modules/", import.meta.url);
const directInnerHtmlModules = readdirSync(moduleDirectory)
  .filter((name) => name.endsWith(".js") && name !== "dom.js")
  .filter((name) => /\.innerHTML\s*=/.test(readFileSync(new URL(name, moduleDirectory), "utf8")));
assert.deepEqual(
  directInnerHtmlModules,
  [],
  "功能模組不得直接寫入 innerHTML，模板解析只能位於 dom.js 的受控邊界"
);

const appSource = readFileSync(new URL("../app.js", import.meta.url), "utf8");
assert.doesNotMatch(
  appSource,
  /\.innerHTML\s*=/,
  "app.js 不得繞過 dom.js 的受控模板邊界直接寫入 innerHTML"
);
assert.doesNotMatch(
  appSource,
  /\.innerHTML\b/,
  "app.js 複製預覽內容時應 clone DOM 節點，不得重新解析 HTML 字串"
);

process.stdout.write("P1 frontend architecture, safety and CSS regression passed.\n");
