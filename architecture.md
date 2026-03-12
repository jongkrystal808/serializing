# Project Architecture

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.2.5
**Last Updated:** 2026-03-11

---

> **🏗️ Authoritative Source:** This is the SINGLE SOURCE OF TRUTH for:
> - WHY we chose specific technologies (technology choices, design principles)
> - HOW the system is structured (modules, layers, components)
> - Modularity philosophy and patterns
> - Design principles and architecture patterns
>
> **⚠️ NOT for operational checklists:**
> ❌ Don't store detailed implementation tasks here (→ TASK.md)
> ❌ Don't store sprint checklists here (→ TASK.md)
>
> **This file = Reference (WHY & HOW)**
> **TASK.md = Action Plan (WHAT to do now)**

---

## 📊 Technology Stack

### Frontend
```
- Framework:      Vanilla HTML + JavaScript（無框架依賴）
- Language:       JavaScript (ES6 Modules)
- Build Tool:     無（直接開啟 .html 檔案）
- State:          localStorage（序號歷史記憶）
- Browser API:    FileReader API（目前主流程）+ File System Access API + IndexedDB（已預留 sourceBinding 模組）
- UI/CSS:         獨立樣式檔（styles/main.css）
- Icons:          無
- Routing:        無（單頁應用，客戶頁籤切換）
```

### Backend & Infrastructure
```
- Database:       無後端資料庫，使用 localStorage 持久化序號歷史
- File I/O:       使用 SheetJS (xlsx.js) 讀取 Excel（.xlsx/.xls）並輸出 Excel
- 資料來源:        H:\TE\To Claire\出貨記錄總表.xlsx（各客戶各自的 sheet）
- 部署方式:        本機直接開啟 HTML 檔案（無需伺服器）
```

### Key Dependencies
```json
{
  "xlsx (SheetJS)": "CDN ^0.18.x - 讀取與輸出 Excel 檔案",
  "FileSaver.js":   "CDN ^2.x.x - 觸發瀏覽器下載 Excel 輸出檔",
  "localStorage":   "瀏覽器原生 - 持久化序號與生成歷史",
  "FileReader API": "瀏覽器原生 - 讀取上傳的 Excel 檔案",
  "IndexedDB":      "瀏覽器原生 - 保存來源檔 file handle（預留）"
}
```

---

## 🗂️ Project Structure

```
SN-GENERATOR/
├── index.html                     # 主頁（Tab UI + 入口 script）
├── styles/
│   └── main.css                   # 全域樣式
├── js/
│   ├── app.js                     # 應用流程與事件綁定
│   ├── config.js                  # 客戶配置 / active customer / storage prefix
│   ├── state.js                   # UI refs + runtime state
│   └── modules/
│       ├── excel.js               # 讀取 Excel / 生成 SN / 匯出 Excel
│       ├── workOrder.js           # 查詢 / 欄位解析 / QTY 對應
│       ├── ui.js                  # 預覽與歷史渲染、tab/copy 綁定
│       ├── storage.js             # localStorage 歷史與 migration
│       ├── sourceBinding.js       # File System Access + IndexedDB 綁定
│       ├── customerEngine.js      # 客戶策略執行
│       └── utils.js               # 共用工具函式
│
├── (runtime, no files)
│   ├── localStorage               # 各客戶序號歷史（以客戶前綴區分 key）
│   ├── IndexedDB                  # 各客戶來源檔 file handle（sourceBinding 預留）
│   └── FileReader API             # 讀取 Excel 來源檔案
│
└── (output)
    ├── 營邦-SN.xls                # 統一命名（BarTender 相容模式）
    ├── 倫飛-SN.xls                # 統一命名（BarTender 相容模式）
    ├── 超恩-SN.xls                # 統一命名（BarTender 相容模式）
    └── KOYA-SN.xls                # 統一命名（BarTender 相容模式）
```

---

## 🏗️ Core Architecture Decisions

### 1. 單檔 HTML 應用（No Build Tools）

**Decision:** 整個應用程式打包為單一 `index.html`，不使用任何框架或建置流程。

**Reasoning:**
- ✅ 使用者直接點擊 `.html` 即可運行，零安裝門檻
- ✅ 在無網路/內網的製造業環境中可離線使用
- ✅ 維護與交接簡單，不需 Node.js 或開發環境

**Alternatives considered:**
- ❌ React/Vue App — 需要建置流程，對非工程師門檻過高
- ❌ Python Desktop App — 需安裝 Python 環境，跨電腦部署麻煩

---

### 2. 多客戶頁籤架構（Multi-Customer Tab Layout）

**Decision:** 每位客戶為獨立的頁籤（Tab），共用同一份 HTML 內的基礎模組，但各自擁有獨立的 CONFIG、UI 預覽窗格、localStorage namespace 與輸出格式。

**Reasoning:**
- ✅ 使用者不需切換多個 HTML 檔案
- ✅ 共用模組減少重複程式碼
- ✅ 新增客戶只需新增一個 Tab + CONFIG，不影響現有客戶
- ✅ localStorage 以前綴區分，各客戶歷史互不干擾

**Alternatives considered:**
- ❌ 每位客戶獨立 HTML 檔案 — 共用邏輯需重複維護
- ❌ 動態載入 JSON config — 過度設計

**客戶 CONFIG 結構：**
```javascript
const CUSTOMERS = {
  yingbang: {
    label:       '營邦',
    sheetName:   '營邦出貨',
    storageKey:  'yingbang',       // localStorage prefix
    searchField: '工單號',
    parseRules:  ['arrow'],        // 表格讀取特殊規則
    serialRule:  { type: 'po_plus_fixed', fixed: '1', padLength: 4 },
    exportStrategy: 'single_sn',   // 匯出內容策略
    exportColumns: ['SN', 'Datecode', 'PN']
  },
  lunfei: {
    label:       '倫飛',
    sheetName:   '倫飛出貨',
    storageKey:  'lunfei',
    searchField: 'MO',
    parseRules:  ['arrow'],
    serialRule:  { type: 'lunfei_weekly' },
    exportStrategy: 'dual_sn_box'
  },
  bng: {
    label:       '超恩',
    sheetName:   '超恩出貨',
    storageKey:  'bng',
    searchField: 'MO',
    parseRules:  ['trim'],
    serialRule:  { type: 'range_expand' },
    exportStrategy: 'dual_sn_box',
    exportColumns: ['序號', 'MAC Address', 'UUID', 'BIOS', 'FW']
  },
  chg: {
    label:       'KOYA',
    sheetName:   'KOYA出貨',
    storageKey:  'chg',
    searchField: '工單',
    parseRules:  ['trim'],
    serialRule:  { type: 'none' },
    exportStrategy: 'chg_dual_sheet',
    exportColumns: ['工單', 'PN']
  }
};
```

---

### 3. localStorage 多客戶命名空間

**Decision:** 各客戶以 `{storageKey}_` 為前綴區分 localStorage key，防止跨客戶資料污染。

**營邦 localStorage Schema：**
```javascript
"yingbang_sn_history"
  → { "工單號": lastSerial(整數) }

"yingbang_sn_generation_history_by_work_order"
  → { "工單號": ["YYYY-MM-DD-工單號", ...] }
```

**倫飛 localStorage Schema：**
```javascript
"lunfei_sn_history"
  // 倫飛流水號以「週」為單位，key = ISO週字串
  → { "2026-W09": 3, "2026-W10": 0 }

"lunfei_sn_generation_history_by_mo"
  // key 仍以 MO 分組；record 採統一 YYYY-MM-DD-工單（若缺工單則 fallback MO）
  → { "MO號": ["YYYY-MM-DD-工單", ...] }

"bng_sn_history"
  → { "工單": lastSerial(整數) }

"bng_sn_generation_history_by_work_order"
  → { "工單": ["YYYY-MM-DD-工單", ...] }

"chg_sn_history"
  → { "工單": lastSerial(整數) }

"chg_sn_generation_history_by_work_order"
  → { "工單": ["YYYY-MM-DD-工單", ...] }
```

---

### 4. 營邦 SN 編碼邏輯（不變）

**Decision:** SN = `採單號碼` + `1` + `四位流水號`，流水號依工單號接續，同一工單不重複。

```
SN = {採單號碼} + "1" + {NNNN}

e.g. 506-25101400810001
     506-25101400810002（同工單接續）
```

流水號歷史 key = 工單號，每次接續上次最後序號。

---

### 5. 倫飛 SN 編碼邏輯

**Decision:** SN = `106` + `當週週數(兩位)` + `62` + `五位流水號`，流水號以 ISO 週為單位重置，同週內跨 MO 連續不重複。

```
SN = "106" + WW + "62" + NNNNN

週數：ISO Week，兩位補零
流水號：五位數，補零，同週內所有 MO 共用連續流水號
新的一週 → 流水號重置為 00001

e.g. 2026年第2週，第1筆  → 106026200001
     2026年第2週，第2筆  → 106026200002（同週接續，不管 MO）
     2026年第3週，第1筆  → 106036200001（新週重置）
```

**歷史 key = ISO 週字串（`YYYY-WNN`）：**
```javascript
// localStorage: "lunfei_sn_history"
{ "2026-W02": 5, "2026-W03": 0 }
```

**實作：**
```javascript
function getLunfeiWeekKey() {
  const now = new Date();
  const year = now.getFullYear();
  const week = String(getISOWeek(now)).padStart(2, '0');
  return `${year}-W${week}`;
}

function buildLunfeiSN(weekNum2digit, serial5) {
  return `106${weekNum2digit}62${serial5}`;
}
```

---

### 6. 倫飛特殊型號提示邏輯

**Decision:** 查詢 MO 成功後，依 `Model` 欄位值判斷是否需要彈窗提示，查詢完成後立即觸發。

**規則：**
```
Model 開頭為 BAG017- / BAG159- / BAG016- →
  彈窗：「請列印所有貼紙（外箱及客人提供的 MAC 除外）」
  + 版本號搜尋位置：H:\工程-倫飛\excel\172.17.1.44\Common\工程-倫飛(不可刪)

Model = BAG428-001D →
  彈窗：「此型號不需要序號」
  + 禁用「生成序號」按鈕
```

**實作：**
```javascript
const LUNFEI_MODEL_ALERTS = [
  {
    match: (model) => /^BAG017-|^BAG159-|^BAG016-/.test(model),
    message: '請列印所有貼紙（外箱及客人提供的 MAC 除外）\n版本號搜尋位置：H:\\工程-倫飛\\excel\\172.17.1.44\\Common\\工程-倫飛(不可刪)',
    disableGenerate: false
  },
  {
    match: (model) => model === 'BAG428-001D',
    message: '此型號不需要序號',
    disableGenerate: true
  }
];
```

---

### 6.1 超恩區間展開規則

**Decision:** 超恩序號採來源欄位區間直接展開，不使用流水號累加格式。輸入格式可為 `A ~ B` 或 `A B`（自動補 ` ~ `）。

**規則：**
```
MAC Address 區間：展開後筆數必須等於 MAC數量
序號區間：展開後筆數必須等於 生產數量
UUID區間：若為 0 顯示「無」；若有區間則展開後筆數必須等於 生產數量
UUID 尾碼固定 17 個 F（FFFFFFFFFFFFFFFFF）
```

**輸出：**
```
雙 Sheet（SN + BOX）
SN sheet 欄位：序號 / MAC Address / UUID / BIOS / FW
BOX sheet 欄位：PO / Model / 料號 / SN / 思創PN / Date
其中 BOX 的 Model 會套用 `' 1.'` 截斷規則（只保留前段機種名稱）
```

---

### 7. Excel 來源讀取方式（UTF-8 + 箭頭欄位更新邏輯）

**Decision:** 使用 SheetJS 以 UTF-8 讀取，若欄位值含 `→`、`->` 或 `>`，取最後箭頭後的內容。所有客戶共用此邏輯。

```javascript
function parseArrow(cellValue) {
  const text = String(cellValue ?? '').trim();
  const arrowPattern = /(?:->|→|>)/;
  if (!arrowPattern.test(text)) return text;
  const parts = text.split(arrowPattern).map(p => p.trim()).filter(Boolean);
  return parts.length ? parts[parts.length - 1] : '';
}
```

---

### 8. Datecode 編碼邏輯（營邦專用）

```
Datecode = "D" + YY + WW（ISO Week，兩位補零）
e.g. 2026年第4週 → D2604
```

---

### 5.1 倫飛 MO/Q'ty 斜線配對規則

**Decision:** 當同列 `MO` 與 `Q'ty` 都包含 `/` 多值時，必須按位置配對數量，不可直接取整格字串。

```
MO:    11116160/11115829
Q'ty:  10/340

查詢 11116160 → Q'ty = 10
查詢 11115829 → Q'ty = 340
```

**Fallback:**
```
若無法形成有效斜線配對（例如只有單值），改用 Q'ty 單值解析。
```

**實作：**
```javascript
resolveQtyByPairedSlash(row, query, "MO", "QTY")
```

---

### 9. 客戶策略模板（Customer Strategy Template）

**Decision:** 將客戶差異收斂為三種策略，讓新增客戶時只需補 `CUSTOMERS` 設定，不必重寫主流程。

**三種策略：**
```javascript
parseRules      // 表格讀取特殊規則（例如 arrow）
serialRule      // SN 生成規則（例如 po_plus_fixed、lunfei_weekly）
exportStrategy  // 匯出 Excel 內容策略（single_sn、dual_sn_box、chg_dual_sheet）
```

**共用引擎：**
```javascript
applyParseRules(value, rules)
buildSerialByRule(serialRule, context)
buildWorkbookByStrategy(exportStrategy, args)
// 超恩與 KOYA 目前使用 custom exporter（exportBngExcel / exportChgExcel）
```

**Consequences:**
- ✅ 新客戶差異（sheet、SN 規則、匯出欄位/內容）可配置化
- ✅ 主流程維持共用，降低客戶擴充成本
- ✅ 可持續擴充新策略（例如客製化多 sheet / 欄位轉換）

---

## 🔧 Key Services & Components

### [共用] ExcelReaderModule
**Purpose:** 讀取 Excel 來源，解析指定 sheet，套用箭頭更新邏輯

```javascript
- loadExcel(file)              → 讀取上傳檔案，依 active customer 的 sheetName 解析 row 陣列
- extractSheetData(workbook)   → 解析指定 sheet 並套用 parseRules（arrow/trim）
- parseArrow(cellValue)        → 處理含 → 的欄位，返回最新有效值
// sourceBinding.js 仍存在，作為後續「來源檔綁定」能力預留
```

---

### [共用] HistoryModule
**Purpose:** 管理各客戶序號歷史（各自使用 storageKey 前綴）

```javascript
- getHistory(storageKey)             → 讀取指定客戶的歷史物件
- getLastSerial(storageKey, key)     → 指定 key 的最後流水號
- updateHistory(storageKey, key, n)  → 更新流水號
- clearHistory(storageKey, key)      → 清除指定 key 歷史
```

---

### [共用] ExcelExportModule
**Purpose:** 依各客戶輸出格式產生並下載 Excel

```javascript
- exportExcel(snList, exportConfig)  → 營邦共用匯出（策略引擎）
- exportLunfeiExcel(snList, boxRecord) → 倫飛雙 Sheet 匯出
- exportBngExcel(bundle)             → 超恩雙 Sheet 匯出（SN + BOX）
- exportChgExcel(bundle)             → KOYA 雙 Sheet 匯出（SN + BOX）
// 檔名統一：{客戶名}-SN.xls（BarTender 相容模式）
```

---

### [共用] CustomerEngineModule
**Purpose:** 執行客戶差異策略（讀取規則 / 序號規則 / 匯出規則）

```javascript
- applyParseRules(value, rules)                → 套用欄位特殊規則
- buildSerialByRule(serialRule, context)       → 依規則生成 SN
- buildWorkbookByStrategy(strategy, args)      → 依策略產生 workbook 資料
```

---

### [營邦] SNGeneratorModule
**Purpose:** 生成營邦 SN / Datecode，確保工單流水號不重複

```javascript
- generateSNList(poNumber, pn, qty, workOrder) → 返回 {SN, datecode, PN}[]
- getDatecode()                                → 返回 D+YY+WW
- buildSN(poNumber, serial4)                   → 組合 SN 字串
```

---

### [倫飛] LunfeiSNGeneratorModule
**Purpose:** 生成倫飛 SN，以週為單位管理流水號，跨 MO 連續不重複

```javascript
- generateLunfeiSNList(mo, qty)      → 返回 {SN}[]
- getLunfeiWeekKey()                 → 返回 "YYYY-WNN"
- buildLunfeiSN(weekNum2, serial5)   → 組合 SN 字串
- checkModelAlert(model)             → 返回 {message, disableGenerate} | null
```

---

### [營邦] PreviewModule
**Purpose:** 顯示 DDC料號/品名，帶入 SN/Datecode/PN/QTY，提供複製與生成歷史分頁

---

### [倫飛] LunfeiPreviewModule
**Purpose:** 顯示 Model，帶入各欄位，提供複製，查詢後彈窗特殊型號提示

**Key features:**
```
- 查詢成功後：Model 顯示於最上方（醒目標示）
- 欄位帶入：SN（第一筆預覽）、工單、P/N、加工WO#、對應PCBA、Q'ty（可複製）
- Q'ty 帶入遵循 `MO/Q'ty` 斜線位置配對規則
- 查詢成功後立即判斷特殊型號 → 符合條件即彈窗
- BAG428-001D → 禁用「生成序號」按鈕
```

---

## 📡 Data Flow & Integration Patterns

### 營邦流程（不變）

```
讀取表格 → 解析「營邦出貨」sheet → 搜尋工單號
  → DDC料號/品名置頂，欄位帶入
  → 生成序號（採單號碼+1+NNNN）
  → 匯出 Excel（1 sheet：SN/Datecode/PN）
```

---

### 倫飛流程

```
讀取表格 →
├── 解析「倫飛出貨」sheet（UTF-8，套用 parseArrow）
└── rowData[] 暫存記憶體

搜尋 MO →
├── 比對 MO 欄位（精確匹配優先，其次部分匹配）
├── 查詢成功：
│   ├── Model 顯示於最上方
│   ├── 欄位帶入：SN預覽、工單、P/N、加工WO#、對應PCBA、Q'ty（含斜線配對）
│   └── 立即執行 checkModelAlert(model) → 符合即彈窗
└── 查詢失敗：顯示「找不到 MO：{輸入值}」

生成序號 & 匯出 →
├── weekKey = getLunfeiWeekKey()
├── lastSerial = lunfei_sn_history[weekKey] ?? 0
├── qty = resolveQtyByPairedSlash(row, query, "MO", "QTY")
├── 產生 qty 筆 SN（接續流水號）
├── 更新 lunfei_sn_history[weekKey]
├── 追加 lunfei_sn_generation_history_by_mo[MO]
└── 匯出 Excel（2 sheets）：
    ├── Sheet "SN"：SN 欄（Q'ty 筆）
    └── Sheet "box"：P/N、加工WO#、對應PCBA、工單、Model、日期(yyyy/mm/dd)
```

---

### 超恩流程

```
讀取表格 →
├── 解析「超恩出貨」sheet（trim 規則）
└── rowData[] 暫存記憶體

搜尋 MO →
├── 比對 MO 欄位（精確匹配優先，其次部分匹配）
├── 查詢成功：
│   ├── 分區預覽：SN / MAC / UUID / FW&BIOS / BOX
│   └── 區間顯示正規化（空白分隔自動補為 ` ~ `）
└── 查詢失敗：顯示「查無對應資料，請確認 MO 是否正確」

生成序號 & 匯出 →
├── 展開 MAC 區間（hex/dec 自動判斷）
├── 展開 SN 區間（hex/dec 自動判斷）
├── 展開 UUID 區間（尾碼 17 個 F；值為 0 則顯示無）
├── 驗證筆數（MAC=MAC數量，SN/UUID=生產數量）
├── 更新 bng_sn_history[工單]
├── 追加 bng_sn_generation_history_by_work_order[工單]
└── 匯出 Excel（2 sheets）：
    ├── Sheet "SN"：序號、MAC Address、UUID、BIOS、FW
    └── Sheet "BOX"：PO、Model、料號、SN、思創PN、Date
```

---

### KOYA 流程

```
讀取表格 →
├── 解析「KOYA出貨」sheet（trim 規則）
└── rowData[] 暫存記憶體

搜尋工單 →
├── 比對工單欄位（精確匹配優先，其次部分匹配）
├── 查詢成功：
│   ├── 顯示工單/機種/PO/批量
│   ├── Label 分區：PN、小張貼紙
│   └── Box Label 分區：滿箱數量、需求、尾數數量
└── 查詢失敗：顯示「查無對應資料，請確認工單是否正確」

生成序號 & 匯出 →
├── 以「小張貼紙」作為 SN sheet 筆數
├── SN sheet 欄位：工單、PN（重複列）
├── BOX sheet 欄位：PO、PN、full PN、DDC PN、DDC LOT、QTY、DATE
├── DATE 為匯出當日（yyyy/mm/dd）
└── 更新 chg_sn_history / chg_sn_generation_history_by_work_order
```

---

### 全客戶基本配置（Baseline）

每位客戶都必須具備以下基本功能：
```
1) 預覽窗格「表格內容」分頁（可點儲存格複製）
2) 資料來源設定「查看歷史」+ 單筆重置
3) 預覽窗格「生成歷史」分頁 + 清空歷史序號
```

歷史表格第一欄標示必須依客戶語意顯示：
```
- 營邦：採單號碼
- 倫飛：週別 key（YYYY-WNN）
- 超恩：工單
- KOYA：工單
```

---

### 倫飛週流水號防重複邏輯

```
生成前：
├── weekKey = 當前 ISO 週（e.g. "2026-W09"）
├── lastSerial = lunfei_sn_history[weekKey] ?? 0
├── 新序號從 lastSerial + 1 起，產生 Q'ty 筆
└── 更新 lastSerial = lastSerial + Q'ty

新的一週：
├── weekKey 自動變為新值（e.g. "2026-W10"）
└── lastSerial = 0 → 流水號從 00001 起
```

---

## 🎯 Development Standards

### Code Organization
- **1 HTML 檔案** — 所有邏輯集中，方便非工程師維護
- **客戶區塊以註解分隔** — `// ===== 營邦 / 倫飛 / 超恩 / KOYA =====`
- **Function 命名** — 客戶專屬函式加前綴（`lunfei_`），共用函式無前綴
- **常數集中定義** — 各客戶 CONFIG 在頂部 `const CUSTOMERS` 物件內
- **中文註解** — 業務邏輯使用中文

### Error Handling
- **檔案讀取失敗** — Alert 提示，不崩潰
- **MO/工單找不到** — 顯示友善提示訊息於預覽窗格
- **localStorage 損毀** — 自動 fallback 為空歷史
- **特殊型號彈窗** — 查詢成功後立即觸發，使用 `window.alert()` 或自訂 Modal

### Data Validation
- **QTY / Q'ty** — 必須為正整數（`parseInt()`）
- **Model** — 從表格直接讀取後進行特殊型號比對
- **週數計算** — 使用 ISO 8601 週數算法

---

## 🧩 Module Architecture

```
┌──────────────────────────────────────────────────────────────┐
│                  SN-GENERATOR (index.html)                    │
├──────────────────────────────────────────────────────────────┤
│  ┌──────────────────────┐   ┌──────────────────────────────┐ │
│  │  [共用]               │   │  [共用]                       │ │
│  │  ExcelReaderModule   │   │  HistoryModule                │ │
│  └──────────────────────┘   └──────────────────────────────┘ │
│  ┌──────────────────────────────────────────────────────┐    │
│  │  [共用] ExcelExportModule                             │    │
│  └──────────────────────────────────────────────────────┘    │
│                                                               │
│  ┌──────────────── Tab: 營邦 ──────────────────────┐         │
│  │  SNGeneratorModule       │  PreviewModule        │         │
│  └─────────────────────────────────────────────────┘         │
│                                                               │
│  ┌──────────────── Tab: 倫飛 ──────────────────────┐         │
│  │  LunfeiSNGeneratorModule │  LunfeiPreviewModule  │         │
│  └─────────────────────────────────────────────────┘         │
│                                                               │
│  ┌──────────────── Tab: 超恩 ──────────────────────┐         │
│  │  BngRangeExpandModule     │  BngPreviewModule    │         │
│  └─────────────────────────────────────────────────┘         │
│                                                               │
│  ┌──────────────── Tab: KOYA ──────────────────────┐         │
│  │  ChgExportBundleModule    │  ChgPreviewModule    │         │
│  └─────────────────────────────────────────────────┘         │
└──────────────────────────────────────────────────────────────┘
```

---

## 🗄️ Data Schema

### 營邦 — 來源欄位對應（出貨記錄總表 → 營邦出貨 sheet）

```
採單號碼   → SN 生成基底
DDC料號    → 預覽窗格最上方
品名       → 預覽窗格最上方
料號(PN)  → 輸出欄位
數量(QTY) → 生成序號數量
工單號     → 搜尋鍵值
```

### 倫飛 — 來源欄位對應（出貨記錄總表 → 倫飛出貨 sheet）

```
MO         → 搜尋鍵值
Model      → 預覽窗格最上方 + 特殊型號判斷
工單        → 預覽/輸出（box sheet）
P/N        → 預覽/輸出（box sheet）
加工WO#    → 預覽/輸出（box sheet）
對應PCBA   → 預覽/輸出（box sheet）
Q'ty       → 生成序號數量
```

### 倫飛 — 輸出 Excel Schema（2 Sheets）

```
Sheet "SN"
  欄A: SN（依 Q'ty 數量生成，e.g. 106026200001）

Sheet "box"
  欄A: P/N
  欄B: 加工WO#
  欄C: 對應PCBA
  欄D: 工單
  欄E: Model
  欄F: 日期（yyyy/mm/dd，當日，1 筆）
```

### 超恩 — 來源欄位對應（出貨記錄總表 → 超恩出貨 sheet）

```
日期               → 預覽/輸出 Date
工單               → 歷史主鍵 / 輸出 PO
MO                → 搜尋鍵值
機種名稱            → 預覽顯示 / 輸出 Model
機種料號            → 輸出料號
生產數量            → 生成筆數驗證（SN / UUID）
MAC Address         → MAC 區間展開
MAC數量             → MAC 區間筆數驗證
MAC板子用量數量      → 預覽顯示
序號區間            → 匯出 SN 來源
UUID區間            → UUID 區間展開（0 表示無）
```

### 超恩 — 輸出 Excel Schema（2 Sheets）

```
Sheet "SN"
  欄A: 序號
  欄B: MAC Address
  欄C: UUID
  欄D: BIOS
  欄E: FW

Sheet "BOX"
  欄A: PO
  欄B: Model（套用 `' 1.'` 截斷規則）
  欄C: 料號
  欄D: SN（序號區間原文）
  欄E: 思創PN
  欄F: Date（yyyy/mm/dd）
```

### KOYA — 來源欄位對應（出貨記錄總表 → KOYA出貨 sheet）

```
工單         → 搜尋鍵值 / SN sheet 欄位
機種         → 預覽顯示 / BOX 的 DDC PN
PN          → 預覽顯示 / SN + BOX 欄位
PO          → 預覽顯示 / BOX 欄位
小張貼紙      → SN sheet 生成筆數
滿箱數量      → 預覽顯示 / BOX 的 QTY
需求         → 預覽顯示
尾數數量      → 預覽顯示
full PN     → BOX 欄位
```

### KOYA — 輸出 Excel Schema（2 Sheets）

```
Sheet "SN"
  欄A: 工單（依小張貼紙數量重複列）
  欄B: PN

Sheet "BOX"
  欄A: PO
  欄B: PN
  欄C: full PN
  欄D: DDC PN（機種）
  欄E: DDC LOT（工單）
  欄F: QTY（滿箱數量）
  欄G: DATE（yyyy/mm/dd）
```

### localStorage Schema（多客戶）

```javascript
// 營邦
"yingbang_sn_history"                          → { "工單號": lastSerial }
"yingbang_sn_generation_history_by_work_order" → { "工單號": ["YYYY-MM-DD-工單號"] }

// 倫飛
"lunfei_sn_history"                            → { "YYYY-WNN": lastSerial }
"lunfei_sn_generation_history_by_mo"           → { "MO號": ["YYYY-MM-DD-工單"] } // 缺工單時 fallback MO

// 超恩
"bng_sn_history"                               → { "工單": lastSerial }
"bng_sn_generation_history_by_work_order"      → { "工單": ["YYYY-MM-DD-工單"] }

// KOYA
"chg_sn_history"                               → { "工單": lastSerial }
"chg_sn_generation_history_by_work_order"      → { "工單": ["YYYY-MM-DD-工單"] }
```

---

## 🔄 Evolution & Migration Strategy

### 新增客戶流程
1. 在 `CUSTOMERS` 物件新增該客戶 CONFIG（sheetName、storageKey、欄位 mapping、SN 規則）
2. 在 HTML 新增對應 Tab 頁籤與預覽窗格
3. 實作該客戶的 SNGeneratorModule 與 PreviewModule
4. 共用模組（ExcelReader、History、Export）無需修改

### Migration Pattern
```
需求確認 → 修改 CONFIG/邏輯 → 瀏覽器測試 → 更新文件 → 交付 .html
```

### Version History
- **0.1.0** - 2026-03-04 - 初版架構設計（營邦單客戶）
- **0.1.1** - 2026-03-04 - 新增來源檔綁定（File System Access API + IndexedDB）
- **0.1.2** - 2026-03-04 - 新增預覽窗格「生成歷史」分頁
- **0.1.3** - 2026-03-04 - 清空歷史序號移至生成歷史分頁，僅清當前工單
- **0.1.4** - 2026-03-04 - 清空歷史序號時同步重置採單流水號
- **0.1.5** - 2026-03-04 - 新增「表格內容」分頁
- **0.1.6** - 2026-03-04 - 支援工單欄位 `工單*數量` 拆分
- **0.1.7** - 2026-03-04 - 序號歷史主鍵改為工單號
- **0.2.0** - 2026-03-05 - 重構為多客戶骨架，新增倫飛客戶模組
- **0.2.1** - 2026-03-05 - 客戶差異策略化（parseRules/serialRule/exportStrategy），匯出欄位與內容可依客戶自訂，並定義全客戶基本配置
- **0.2.2** - 2026-03-05 - 倫飛新增 MO/Q'ty 斜線配對規則；歷史表格 key 標示改為依客戶語意顯示（營邦採單號碼 / 倫飛週別 key）
- **0.2.3** - 2026-03-06 - 新增超恩客戶（bng）：機種名稱查詢、區間展開生成（MAC/SN/UUID）、UUID=0 顯示無、single_sn 匯出欄位 `PO/Model/料號/SN/Date`
- **0.2.4** - 2026-03-09 - 新增 KOYA 客戶（chg）：工單查詢、Label/Box Label 分區預覽、雙 sheet 匯出（SN:工單/PN；BOX:PO/PN/full PN/DDC PN/DDC LOT/QTY/DATE）
- **0.2.5** - 2026-03-11 - 對齊 T19：全客戶匯出檔名統一 `{客戶名}-SN.xls`、生成歷史格式統一 `YYYY-MM-DD-工單`、超恩改為雙 sheet 匯出與分區預覽

---

## 🧪 Module Testing

### [共用] ExcelReaderModule
- **Test 1:** 讀取「營邦出貨」→ rowData 正確
- **Test 2:** 讀取「倫飛出貨」→ rowData 正確
- **Test 3:** 欄位含 `→` → 取最後值
- **Test 4:** 找不到指定 sheet → 友善錯誤

### [共用] HistoryModule
- **Test 1:** 不同客戶 storageKey 互不干擾
- **Test 2:** 倫飛 weekKey 新週 → lastSerial 為 0

### [倫飛] LunfeiSNGeneratorModule
- **Test 1:** 同週不同 MO → 流水號接續不重複
- **Test 2:** 新一週 → 流水號從 00001 重置
- **Test 3:** Model=BAG017-XXXX → checkModelAlert 返回正確訊息
- **Test 4:** Model=BAG428-001D → disableGenerate: true
- **Test 5:** SN 格式：106+WW(2位)+62+NNNNN(5位) 正確
- **Test 6:** `MO/Q'ty` 為斜線多值時，查詢 MO 後 qty 依位置正確配對

### [倫飛] ExcelExportModule
- **Test 1:** 輸出 Excel 含 2 sheets（SN、box）
- **Test 2:** SN sheet 筆數與 Q'ty 相同
- **Test 3:** box sheet 6 欄正確，日期格式 yyyy/mm/dd

### [超恩] Bng Export & Range Module
- **Test 1:** MAC/SN/UUID 區間展開筆數驗證正確
- **Test 2:** UUID = 0 時顯示「無」
- **Test 3:** 輸出 Excel 含 2 sheets（SN、BOX）
- **Test 4:** BOX 的 Model 套用 `' 1.'` 截斷規則

### [KOYA] Chg Export Module
- **Test 1:** 以「小張貼紙」數量生成 SN sheet 重複列
- **Test 2:** BOX 欄位（PO/PN/full PN/DDC PN/DDC LOT/QTY/DATE）正確
- **Test 3:** DATE 為匯出當日 yyyy/mm/dd

---

## 📝 Architecture Decision Records (ADR)

### ADR-001: 使用 localStorage 取代後端資料庫
**Date:** 2026-03-04 | **Status:** Accepted
**Decision:** localStorage 持久化序號歷史
**Consequences:** 歷史資料綁定於特定電腦/瀏覽器

### ADR-002: 以 `→` 作為欄位更新標記
**Date:** 2026-03-04 | **Status:** Accepted
**Decision:** 統一套用 `parseArrow()`，取最後一個 `→` 之後的內容

### ADR-003: 多客戶共用單一 HTML 檔案（Tab 架構）
**Date:** 2026-03-05 | **Status:** Accepted
**Context:** 預計擴充至 5–7 位客戶，需要可維護的擴充架構
**Decision:** 單一 HTML + 客戶 Tab + 共用模組 + 各客戶 CONFIG
**Consequences:** 檔案隨客戶增加會變長，以客戶區塊註解分隔維持可讀性

### ADR-004: 倫飛流水號以 ISO 週為單位重置
**Date:** 2026-03-05 | **Status:** Accepted
**Context:** 倫飛 SN 規則要求同週連續、新週從 00001 起
**Decision:** localStorage key 使用 `YYYY-WNN` 週字串，新週自動取到 0
**Consequences:** 跨年週需確認 ISO Week 算法正確性

### ADR-005: 匯出欄位與內容策略化
**Date:** 2026-03-05 | **Status:** Accepted
**Context:** 新客戶差異不只在 SN 規則，也包含輸出 Excel 欄位與內容
**Decision:** 將匯出改為 `exportStrategy`（例如 `single_sn` / `dual_sn_box` / `chg_dual_sheet`），由共用策略引擎產生 workbook；特殊格式可由 custom exporter 補充
**Consequences:** 新客戶可不改主流程直接客製輸出；策略數量增加時需維護策略測試

### ADR-006: 倫飛 Q'ty 採 MO 斜線位置配對
**Date:** 2026-03-05 | **Status:** Accepted
**Context:** 倫飛來源資料存在單列多 MO 與多 Q'ty（以 `/` 分隔）情況，若不配對會生成錯誤筆數
**Decision:** 新增 `resolveQtyByPairedSlash()`，在倫飛預覽與生成流程統一使用
**Consequences:** 可正確處理 `MO=.../...` 對應 `Q'ty=.../...`；異常格式仍保留單值 fallback

### ADR-007: 超恩改用區間展開而非流水號模板
**Date:** 2026-03-06 | **Status:** Accepted
**Context:** 超恩來源資料已提供 `MAC Address/序號區間/UUID區間`，且要求筆數與欄位數量一致驗證
**Decision:** 新增區間展開流程（支援 `A ~ B` 與 `A B`），依字元自動判斷 hex/dec；UUID `0` 視為無
**Consequences:** 可直接遵循客戶來源區間，不依賴固定 SN 模板；若來源區間與數量欄位不一致，匯出前即阻擋並提示

### ADR-008: 全客戶匯出命名與留痕格式統一
**Date:** 2026-03-10 | **Status:** Accepted
**Context:** 多客戶併行後，檔名與生成歷史格式不一致，現場追蹤成本高
**Decision:** 全客戶輸出檔名統一為 `{客戶名}-SN.xls`（BarTender 相容模式）；生成歷史 record 統一 `YYYY-MM-DD-工單`（倫飛缺工單時 fallback MO）
**Consequences:** 現場交付與稽核格式一致；若日後關閉 BarTender 相容模式，副檔名可回復為 `.xlsx`

---

## 🎨 Design Patterns Used

- **Module Pattern** — 每個功能封裝為獨立 function 群組，單一職責
- **Config Object Pattern** — 各客戶規則集中於頂部 `CUSTOMERS` 物件
- **Strategy Pattern** — 各客戶 SN 生成邏輯為獨立策略，由 Tab 切換決定使用哪個
- **History/State Pattern** — localStorage 以前綴區分客戶命名空間

---

*This document maintained in current state for effective development*
*Last updated: 2026-03-11*
