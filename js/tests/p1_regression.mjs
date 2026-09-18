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
function createMockDomElement() {
  return {
    children: [],
    isConnected: true,
    className: "",
    classList: { add() {} },
    setAttribute() {},
    addEventListener() {},
    appendChild(child) {
      this.children.push(child);
      child.isConnected = true;
      return child;
    },
    remove() {
      this.isConnected = false;
    }
  };
}
globalThis.document = {
  body: createMockDomElement(),
  createElement: () => createMockDomElement()
};
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
const { bindPreviewTabsIn, updateStatus } = await import("../modules/ui.js");
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
for (const functionName of ["renderLunfeiSearchSuccess", "renderBngSearchSuccess", "renderChgSearchSuccess", "renderGenericSourceSearchSuccess"]) {
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
const sheetJsSource = readFileSync(new URL("../../assets/vendor/sheetjs/xlsx.full.min.js", import.meta.url), "utf8");
const stateSource = readFileSync(new URL("../state.js", import.meta.url), "utf8");
const requiredDomIds = [...stateSource.matchAll(/getElementById\("([^"]+)"\)/g)].map((match) => match[1]);
const missingDomIds = requiredDomIds.filter((id) => !indexSource.includes(`id="${id}"`));
assert.deepEqual(missingDomIds, [], "state.js 的必要 DOM refs 必須全部存在於 index.html");

for (const statusId of ["home-status", "status", "status-lunfei", "status-bng", "status-chg", "status-hmg", "status-clg"]) {
  assert.match(
    indexSource,
    new RegExp(`<p[^>]*id="${statusId}"[^>]*role="status"[^>]*aria-live="polite"[^>]*aria-atomic="true"`),
    `${statusId} 應作為可即時播報的搜尋狀態區域`
  );
}

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

function createAccessibleTabElement(attributes = {}, initialClasses = []) {
  const attributeMap = new Map(Object.entries(attributes));
  const classNames = new Set(initialClasses);
  const eventListeners = new Map();
  return {
    id: attributes.id || "",
    hidden: false,
    tabIndex: 0,
    focused: false,
    classList: {
      contains: (name) => classNames.has(name),
      toggle(name, enabled) {
        enabled ? classNames.add(name) : classNames.delete(name);
      }
    },
    getAttribute: (name) => attributeMap.get(name) ?? null,
    setAttribute(name, value) {
      attributeMap.set(name, String(value));
    },
    addEventListener(type, listener) {
      eventListeners.set(type, listener);
    },
    focus() {
      this.focused = true;
    },
    dispatch(type, event = {}) {
      eventListeners.get(type)?.(event);
    }
  };
}

const tabList = createAccessibleTabElement();
const previewTab = createAccessibleTabElement({ "data-tab": "preview" }, ["active"]);
const sheetTab = createAccessibleTabElement({ "data-tab": "sheet" });
const previewPane = createAccessibleTabElement({ "data-pane": "preview" }, ["active"]);
const sheetPane = createAccessibleTabElement({ "data-pane": "sheet" });
const tabRoot = {
  id: "home-preview-panel",
  querySelector(selector) {
    return selector === ".preview-tabs" ? tabList : null;
  },
  querySelectorAll(selector) {
    if (selector === ".preview-tab[data-tab]") return [previewTab, sheetTab];
    if (selector === ".preview-pane[data-pane]") return [previewPane, sheetPane];
    return [];
  }
};
bindPreviewTabsIn(tabRoot);
assert.equal(tabList.getAttribute("role"), "tablist");
assert.equal(previewTab.getAttribute("role"), "tab");
assert.equal(previewTab.getAttribute("aria-selected"), "true");
assert.equal(previewTab.getAttribute("aria-controls"), previewPane.id);
assert.equal(previewPane.getAttribute("role"), "tabpanel");
assert.equal(previewPane.getAttribute("aria-labelledby"), previewTab.id);
assert.equal(sheetPane.hidden, true, "非作用中 tabpanel 應從無障礙樹隱藏");
let keyboardDefaultPrevented = false;
previewTab.dispatch("keydown", {
  key: "ArrowRight",
  preventDefault() {
    keyboardDefaultPrevented = true;
  }
});
assert.equal(keyboardDefaultPrevented, true);
assert.equal(sheetTab.getAttribute("aria-selected"), "true", "方向鍵切換時需同步 aria-selected");
assert.equal(sheetTab.tabIndex, 0);
assert.equal(sheetTab.focused, true);
assert.equal(previewPane.hidden, true);
assert.equal(sheetPane.hidden, false);

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
const apiSource = readFileSync(new URL("../modules/api.js", import.meta.url), "utf8");
const sourceMaintenanceSource = readFileSync(new URL("../modules/sourceMaintenance.js", import.meta.url), "utf8");
const genericPreviewBranch = appSource.match(/function syncHomePreviewPanel\(customerKey\) \{([\s\S]*?)\n\}/)?.[1] || "";
assert.match(genericPreviewBranch, /if \(source\)[\s\S]*renderGenericSourceSearchSuccess/, "所有後續新增來源都應使用超恩式通用預覽");
assert.doesNotMatch(genericPreviewBranch, /source\.key\s*===|includes\(source\.key\)/, "通用預覽不得要求新增來源 key 白名單");
assert.match(
  apiSource,
  /requestJson\("\/print-notice",\s*\{\s*method:\s*"DELETE"/s,
  "列印公告刪除應使用 DELETE /print-notice"
);
assert.doesNotMatch(apiSource, /print-notice\/delete/, "前端不得再呼叫舊的 POST /print-notice/delete");
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

assert.match(indexSource, /id="home-search-input"[^>]*type="search"[^>]*autofocus[^>]*autocomplete="off"[^>]*spellcheck="false"/);
assert.match(indexSource, /styles\/toast\.css/, "首頁必須載入 Toast 樣式");
assert.match(indexSource, /Content-Security-Policy/, "首頁必須設定 CSP");
assert.match(indexSource, /\.\/assets\/vendor\/sheetjs\/xlsx\.full\.min\.js" integrity="sha384-[^"]+"/, "SheetJS 必須從本機載入並驗證完整性");
assert.doesNotMatch(indexSource, /cdn\.jsdelivr\.net/, "首頁不得依賴外部 CDN");
assert.match(sheetJsSource, /SheetJS/, "本機 SheetJS 資產必須存在");
assert.doesNotMatch(indexSource, /共用 Excel共用 Excel/, "共用 Excel 狀態文字不得重複");
assert.match(indexSource, /Compatibility shell:[^\n]+js\/state\.js[^\n]+migrate/, "legacy-root 必須標記相容用途與移除條件");
assert.match(indexSource, /id="home-preview-shell"[\s\S]*id="home-preview-panel"[\s\S]*id="fzg-serial-card"[\s\S]*id="deg-generator-card"/, "FZG／DEG 編碼器必須固定在預覽資訊下方");
assert.match(
  indexSource,
  /<details id="home-print-notice-board"[^>]*open>[\s\S]*<summary class="home-print-notice-head">/,
  "已列印公告欄應可收合且預設展開"
);
assert.match(
  stylesheet,
  /\.home-layout:has\(\.home-print-notice-board:not\(\[open\]\)\)\s*\{[^}]*grid-template-columns:\s*3\.25rem minmax\(0, 1fr\)/s,
  "已列印公告欄收合時應向左縮小並讓主內容擴寬"
);
assert.match(stylesheet, /button\s*\{[^}]*min-height:\s*2\.5rem/s, "按鈕觸擊高度至少應為 40px");
assert.match(stylesheet, /\.btn-loading\s*\{/, "必須提供按鈕 loading 狀態");
assert.match(stylesheet, /\.collapsible-panel\[hidden\]/, "展開式面板必須提供 hidden 過渡狀態");
assert.match(stylesheet, /prefers-reduced-motion:\s*reduce/, "互動動畫必須尊重 reduced motion 偏好");
assert.match(appSource, /event\.ctrlKey/, "首頁搜尋框必須支援 Ctrl+Enter 匯出");
assert.match(appSource, /event\.key === "Escape"/, "必須支援 Escape 收合設定面板");
assert.match(appSource, /scrollIntoView\(\{ behavior, block: "nearest" \}\)/, "搜尋與匯出後必須提供平滑捲動");
assert.match(indexSource, /id="clg-export-format-select"[\s\S]*<option value="xls">XLS<\/option>[\s\S]*value="xlsx"/, "自定義序號下載應預設 XLS 並保留 XLSX 選項");
assert.match(indexSource, /id="clg-export-column-select"[\s\S]*value="SN"[\s\S]*value="LabelName"/, "自定義序號下載應可選 SN 或 LabelName 欄名");
assert.match(appSource, /book_append_sheet\(workbook, worksheet, "MES"\)/, "自定義序號下載的工作表名稱應為 MES");
assert.match(appSource, /serialList\.map\(\(serial\) => \[serial\]\)/, "自定義序號下載應包含全部序號");
assert.match(appSource, /slice\(-2\)[\s\S]*padStart\(2, "0"\)[\s\S]*padStart\(2, "0"\)[\s\S]*datePrefix/, "自定義下載檔名應自動使用 yymmdd- 日期前綴");
assert.match(appSource, /window\.prompt\("請輸入檔案名稱"/, "自定義序號下載前應允許輸入檔名");
assert.match(indexSource, /id="btn-shipment-refresh"/, "首頁必須提供手動更新資料按鈕");
assert.match(indexSource, /id="shipment-last-updated"/, "首頁必須顯示最近總表更新日期");
assert.match(stylesheet, /\.shipment-last-updated\.status-message\s*\{[^}]*background:\s*color-mix[^}]*color:\s*var\(--text\)/s, "最近更新日期必須提供主題相容的底色與文字顏色");
assert.match(sourceMaintenanceSource, /shipmentLastUpdated\.textContent[\s\S]*job\.last_updated_at/, "最近更新日期必須讀取後端時間");
assert.match(indexSource, /id="shipment-refresh-progress-bar"[^>]*max="100"/, "更新資料必須顯示百分比進度條");
assert.match(indexSource, /id="shipment-refresh-progress"[^>]*hidden/, "尚未更新時不得顯示進度與執行狀態");
assert.match(stylesheet, /\.shipment-refresh-progress\[hidden\]\s*\{[^}]*display:\s*none/s, "hidden 進度區不得被 grid 樣式重新顯示");
assert.match(sourceMaintenanceSource, /onShipmentRefreshClick\(\)[\s\S]*shipmentRefreshProgress\.hidden\s*=\s*false/, "點擊更新後才顯示進度區");
assert.match(apiSource, /requestJson\("\/shipment-refresh\/run",\s*\{\s*method:\s*"POST"/s, "更新按鈕必須呼叫背景更新 API");
assert.match(sourceMaintenanceSource, /getShipmentRefreshStatusByApi\(\)/, "更新期間必須輪詢後端真實狀態");
const refreshRenderBody = sourceMaintenanceSource.match(/function renderShipmentRefreshStatus\(job\) \{([\s\S]*?)\n  \}/)?.[1];
assert.ok(refreshRenderBody, "必須能驗證更新狀態顯示邏輯");
const refreshUi = Object.fromEntries([
  "shipmentLastUpdated", "shipmentRefreshProgress", "shipmentRefreshProgressBar",
  "shipmentRefreshPercent", "shipmentRefreshStage", "shipmentRefreshMessage", "shipmentRefreshBtn"
].map((key) => [key, { hidden: true, dataset: {}, classList: { toggle() {} } }]));
const refreshRenderer = new Function("ui", "job", refreshRenderBody);
const renderRefresh = (ui, job) => refreshRenderer(ui, job);
renderRefresh(refreshUi, { status: "idle", last_updated_at: "2026-09-14 12:00:00" });
assert.equal(refreshUi.shipmentRefreshProgress.hidden, true, "初次載入不得顯示進度");
renderRefresh(refreshUi, { status: "running" });
assert.equal(refreshUi.shipmentRefreshProgress.hidden, false, "更新期間必須顯示進度");
renderRefresh(refreshUi, { status: "succeeded", progress: 100 });
assert.equal(refreshUi.shipmentRefreshProgress.hidden, true, "更新成功必須自動隱藏進度區");
assert.equal(refreshUi.shipmentRefreshBtn.disabled, false, "更新完成必須恢復按鈕");
assert.match(refreshUi.shipmentLastUpdated.textContent, /2026-09-14 12:00:00/, "隱藏進度不得清除最近更新日期");
renderRefresh(refreshUi, { status: "running" });
renderRefresh(refreshUi, { status: "failed" });
assert.equal(refreshUi.shipmentRefreshProgress.hidden, false, "更新失敗應保留錯誤訊息區");
assert.match(indexSource, /id="btn-shipment-source-toggle"/, "首頁必須提供資料來源維護入口");
assert.match(indexSource, /id="btn-shipment-source-toggle"[^>]*hidden/, "資料來源維護入口預設必須隱藏");
assert.match(indexSource, /id="btn-koya-model-toggle"[^>]*hidden/, "KOYA 維護入口預設必須隱藏");
assert.match(indexSource, /id="btn-nyx-model-toggle"[^>]*hidden/, "NYX 維護入口預設必須隱藏");
assert.match(appSource, /event\.ctrlKey\s*&&\s*event\.shiftKey[\s\S]*toLowerCase\(\)\s*===\s*"d"/, "Ctrl+Shift+D 必須切換維護入口");
assert.match(indexSource, /id="shipment-source-path"[^>]*required/, "來源維護必須要求有效路徑");
assert.match(apiSource, /requestJson\(`\/shipment-sources\/\$\{key\}`,[\s\S]*method:\s*"PUT"/, "來源維護必須透過 API 持久化");
assert.match(apiSource, /shipment-sources\/\$\{key\}\/reset/, "來源維護必須提供回退至預設值的操作");

const toastSource = readFileSync(new URL("../modules/toast.js", import.meta.url), "utf8");
assert.match(toastSource, /export function showToast\(/, "Toast 模組必須匯出 showToast");
assert.match(toastSource, /toast-success|`toast toast-\$\{validType\}`/, "Toast 必須支援狀態類型");

process.stdout.write("P1 frontend architecture, safety and CSS regression passed.\n");
