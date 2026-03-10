# Task Backlog

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.2.4
**Last Updated:** 2026-03-10

---

> **📌 How to use this file:**
> - 每次開發前先看 `🔄 In Progress`，確認目前進行中的任務
> - 完成一個 Task 後將狀態改為 `✅ Done`，並填入完成日期
> - 新任務加入 `⬜ Todo`，並指定所屬模組與優先順序
> - 此文件只記錄 **WHAT to do**，WHY & HOW 請參考 `ARCHITECTURE.md`

---

## 🔄 In Progress

*（目前無進行中任務）*

---

## ⬜ Todo — Phase 2：多客戶骨架 + 倫飛模組

### 📥 T12 — 倫飛 ExcelReaderModule
**Module:** 倫飛 / ExcelReaderModule（共用）
**Priority:** 🔴 High
**Depends on:** T11

**Sub-tasks:**
- [x] 設定倫飛 CONFIG：sheetName = `'倫飛出貨'`，searchField = `'MO'`  ✅ 2026-03-05
- [x] 倫飛「讀取表格」按鈕：綁定/讀取 `出貨記錄總表.xlsx` 的「倫飛出貨」sheet  ✅ 2026-03-05
- [x] 所有欄位套用共用 `parseArrow()`  ✅ 2026-03-05
- [x] 解析欄位：MO、Model、工單、P/N、加工WO#、對應PCBA、Q'ty  ✅ 2026-03-05
- [x] rowData 暫存為 `lunfeiRowData[]`（與 `yingbangRowData[]` 分開）  ✅ 2026-03-05
- [x] 載入成功後顯示：「已載入倫飛出貨 N 筆資料」  ✅ 2026-03-05

**Acceptance Criteria:**
- 「倫飛出貨」sheet 正確解析，`lunfeiRowData[]` 含所有欄位
- 欄位含 `→` → 取最後值
- 找不到「倫飛出貨」sheet → 顯示友善錯誤

---

### 🔍 T13 — 倫飛搜尋 MO + 特殊型號彈窗
**Module:** 倫飛 / LunfeiPreviewModule
**Priority:** 🔴 High
**Depends on:** T12

**Sub-tasks:**
- [x] 建立倫飛搜尋框（搜尋 `MO` 欄位，非工單號）  ✅ 2026-03-05
- [x] 建立「查詢/刷新」按鈕，支援 Enter 觸發  ✅ 2026-03-05
- [x] 搜尋邏輯：精確匹配優先，其次部分匹配  ✅ 2026-03-05
- [x] 查詢成功：  ✅ 2026-03-05
  - [x] Model 顯示於預覽窗格最上方（醒目標示）  ✅ 2026-03-05
  - [x] 欄位帶入：SN預覽、工單、P/N、加工WO#、對應PCBA、Q'ty（可複製）  ✅ 2026-03-05
  - [x] 立即執行 `checkModelAlert(model)` 彈窗判斷：  ✅ 2026-03-05
    - [x] Model 開頭 BAG017- / BAG159- / BAG016- → `window.alert` 或自訂 Modal 顯示列印提示 + 版本號路徑  ✅ 2026-03-05
    - [x] Model = BAG428-001D → 彈窗提示「此型號不需要序號」+ 禁用「生成序號」按鈕  ✅ 2026-03-05
- [x] 查詢失敗：顯示「找不到 MO：{輸入值}」  ✅ 2026-03-05

**Acceptance Criteria:**
- 搜尋 MO 成功 → Model 置頂，6 個欄位帶入且可複製
- BAG017-/BAG159-/BAG016- 開頭 → 查詢後立即彈窗，訊息含路徑
- BAG428-001D → 彈窗後「生成序號」按鈕為 disabled 狀態
- 其他 Model → 無彈窗，正常顯示

---

### 🔢 T14 — 倫飛 LunfeiSNGeneratorModule
**Module:** 倫飛 / LunfeiSNGeneratorModule
**Priority:** 🔴 High
**Depends on:** T13

**Sub-tasks:**
- [x] 實作 `getLunfeiWeekKey()` → 返回 `"YYYY-WNN"`（e.g. `"2026-W09"`）  ✅ 2026-03-05
- [x] 實作 `buildLunfeiSN(weekNum2, serial5)` → 返回 `"106" + WW + "62" + NNNNN`  ✅ 2026-03-05
- [x] 實作 `generateLunfeiSNList(mo, qty)`：  ✅ 2026-03-05
  - [x] 取 `lunfei_sn_history[weekKey]` 作為 lastSerial（預設 0）  ✅ 2026-03-05
  - [x] 產生 qty 筆 SN，流水號五位補零，從 lastSerial+1 起  ✅ 2026-03-05
  - [x] 更新 `lunfei_sn_history[weekKey]`  ✅ 2026-03-05
  - [x] 追加 `lunfei_sn_generation_history_by_mo[MO]`  ✅ 2026-03-05
- [x] 預覽窗格顯示第一筆 SN（可複製）  ✅ 2026-03-05

**Acceptance Criteria:**
- 2026 第9週，QTY=3 → `106096200001`, `106096200002`, `106096200003`
- 同週再生 QTY=2 → 接續 `106096200004`, `106096200005`
- 新一週（第10週）→ `106106200001` 重置
- `lunfei_sn_history` 正確更新

---

### 📤 T15 — 倫飛 ExcelExportModule（雙 Sheet）
**Module:** 倫飛 / ExcelExportModule（共用擴充）
**Priority:** 🔴 High
**Depends on:** T14

**Sub-tasks:**
- [x] 實作倫飛匯出邏輯，產生含 2 個 sheet 的 Excel：  ✅ 2026-03-05
  - [x] Sheet "SN"：欄位 `SN`，依 Q'ty 生成對應筆數，無其他欄位  ✅ 2026-03-05
  - [x] Sheet "box"：欄位順序 `P/N`、`加工WO#`、`對應PCBA`、`工單`、`Model`、`日期(yyyy/mm/dd)`，日期為當日，1 筆資料  ✅ 2026-03-05
- [x] 檔名格式：`{YYYYMMDD}-{MO號}.xlsx`  ✅ 2026-03-05
- [x] 建立「生成序號 & 匯出」按鈕，串接 T14 + T15 完整流程  ✅ 2026-03-05
- [x] BAG428-001D 時「生成序號」按鈕為 disabled，不可觸發此流程  ✅ 2026-03-05

**Acceptance Criteria:**
- 下載 Excel 含 2 sheets，名稱分別為 "SN" 與 "box"
- SN sheet：只有 SN 欄，筆數 = Q'ty
- box sheet：6 欄資料正確，日期格式 `yyyy/mm/dd`
- 檔名含正確日期與 MO 號

---

### 🧪 T16 — 倫飛整合測試
**Module:** 全域
**Priority:** 🟡 Medium
**Depends on:** T12~T15

**Sub-tasks:**
- [x] 測試完整流程：讀取表格 → 搜尋 MO → 預覽 → 生成序號 & 匯出  ✅ 2026-03-05
- [x] 測試同週不同 MO 流水號接續（不重複）  ✅ 2026-03-05
- [x] 測試新一週流水號重置為 00001  ✅ 2026-03-05
- [x] 測試 BAG017- / BAG159- / BAG016- 彈窗提示  ✅ 2026-03-05
- [x] 測試 BAG428-001D 彈窗 + 按鈕禁用  ✅ 2026-03-05
- [x] 測試其他 Model 無彈窗  ✅ 2026-03-05
- [x] 測試切換 Tab：倫飛 ↔ 營邦 互不干擾  ✅ 2026-03-05
- [x] 測試 localStorage key 前綴正確（`lunfei_` vs `yingbang_`）  ✅ 2026-03-05

**Acceptance Criteria:**
- 所有情境無 console error
- 倫飛與營邦 localStorage 互相獨立，不污染

---

## ⬜ Todo — Phase 1 殘項

### 🧪 T09 — 整合測試（營邦）
**Module:** 全域
**Priority:** 🟡 Medium
**Depends on:** T02~T08

**Sub-tasks:**
- [x] 測試完整流程：載入 Excel → 查詢工單 → 預覽 → 匯出  ✅ 2026-03-05
- [x] 測試跨工單流水號防重複（同採單號碼兩次生成）  ✅ 2026-03-05
- [x] 測試 `→` 欄位更新邏輯（含多個 `→`）  ✅ 2026-03-05
- [x] 測試 QTY > 1 時所有序號均正確產生  ✅ 2026-03-05
- [x] 測試找不到工單的錯誤處理  ✅ 2026-03-05
- [x] 測試 localStorage 清空後重新生成  ✅ 2026-03-05

**Acceptance Criteria:**
- 所有情境無 console error
- 輸出 Excel 資料與預覽一致

---

## ✅ Done

### ✅ T19 — 全客戶匯出命名與歷史格式統一（完成：2026-03-10）
**Module:** 全域 / UI / ExcelExport / History
**Notes:** 超恩預覽窗格改為分區顯示（SN/MAC/UUID/FW&BIOS/BOX）；BOX 分區機種名稱遵循 `' 1.'` 截斷規則。全客戶匯出檔名統一為 `{客戶名}-SN.xlsx`（營邦/倫飛/超恩/KOYA），生成歷史留痕統一為 `YYYY-MM-DD-工單`。

### ✅ T18 — KOYA 客戶模組（完成：2026-03-09）
**Module:** KOYA / 全域
**Notes:** 已依 `intake-new-customer.md` 新增 `chg`（KOYA）客戶：讀取「KOYA出貨」sheet，工單欄位支援模糊查詢；預覽顯示工單/機種/PO/批量，並分為 Label 分區（PN、小張貼紙）與 Box Label 分區（滿箱數量、需求、尾數數量）。匯出改為雙 sheet（`SN` + `BOX`）：SN 欄位為 `工單/PN` 並依小張貼紙數量重複列；BOX 欄位為 `PO/PN/full PN/DDC PN/DDC LOT/QTY/DATE`，其中 DATE 取匯出當天 `yyyy/mm/dd`。歷史鍵使用工單，支援查看歷史、單筆重置與清空當前工單歷史。

### ✅ T17 — 超恩客戶模組（完成：2026-03-06）
**Module:** 超恩 / 全域
**Notes:** 已依 intake 規格更新超恩（`bng`）流程：讀取「超恩出貨」後以 `MO` 模糊查詢；預覽顯示日期/工單/機種名稱/機種料號/生產數量/MAC Address/MAC數量/MAC板子用量數量/序號區間/UUID區間；區間格式可自動補 ` ~ `，UUID=`0` 顯示「無」。匯出改為雙 sheet（`SN` + `BOX`）：SN 欄位為 `序號/MAC Address/UUID/BIOS/FW`，BOX 欄位為 `PO/Model/料號/SN/思創PN/Date`，檔名格式 `{YYYYMMDD}-{工單}-超恩.xlsx`。生成歷史紀錄改為 `工單-YYYYMMDDHHmmss`。

### ✅ T16 — 倫飛整合測試（完成：2026-03-05）
**Module:** 全域
**Notes:** 已完成自動化整合模擬（同週跨 MO 接續、新週重置、雙 sheet 匯出、客戶前綴 key 隔離）並確認流程通過；型號彈窗與按鈕禁用規則已在查詢流程中驗證。後續依 test-report 完成 hotfix：倫飛歷史欄位改為週別 key、`MO/Q'ty` 斜線配對導入預覽與生成流程。

---

### ✅ T09 — 整合測試（營邦）（完成：2026-03-05）
**Module:** 全域
**Notes:** 已完成終端模擬整合驗證（查詢、跨工單同採單連續流水、`→` 欄位更新、QTY>1、找不到工單、清空後重生、匯出資料與檔名檢查），核心流程通過。

---

### ✅ T15 — 倫飛 ExcelExportModule（雙 Sheet）（完成：2026-03-05）
**Module:** 倫飛 / ExcelExportModule（共用擴充）
**Notes:** 已實作 `exportLunfeiExcel()`，匯出含 "SN" 與 "box" 兩個 sheet；SN sheet 僅 SN 欄、筆數等於 Q'ty；box sheet 欄位為 `P/N/加工WO#/對應PCBA/工單/Model/日期`。倫飛「生成序號 & 匯出」已串接 T14 生成流程，檔名為 `{YYYYMMDD}-{MO}.xlsx`，且 BAG428-001D 保持 disabled 防呆。

---

### ✅ T14 — 倫飛 LunfeiSNGeneratorModule（完成：2026-03-05）
**Module:** 倫飛 / LunfeiSNGeneratorModule
**Notes:** 已完成 `getLunfeiWeekKey/buildLunfeiSN/generateLunfeiSNList`，以 `YYYY-WNN` 作為週流水歷史 key，同週跨 MO 接續五位流水號；並將生成紀錄寫入 `lunfei_sn_generation_history_by_mo`。倫飛查詢後預覽可顯示第一筆 SN 並可複製。

---

### ✅ T13 — 倫飛搜尋 MO + 特殊型號彈窗（完成：2026-03-05）
**Module:** 倫飛 / LunfeiPreviewModule
**Notes:** 已新增倫飛搜尋框與查詢按鈕（含 Enter），MO 搜尋採精確優先/部分匹配次之；查詢成功後於預覽置頂顯示 Model 並帶入可複製欄位，並即時執行特殊型號彈窗判斷與 BAG428-001D 生成按鈕禁用。

---

### ✅ T12 — 倫飛 ExcelReaderModule（完成：2026-03-05）
**Module:** 倫飛 / ExcelReaderModule（共用）
**Notes:** 已新增倫飛來源設定區（綁定來源/讀取表格），讀取 `倫飛出貨` sheet 並套用共用 `parseArrow()`；資料獨立儲存於 `lunfeiRowData[]`，與 `yingbangRowData[]` 分離；載入成功顯示「已載入倫飛出貨 N 筆資料」。

---

### ✅ T11 — 多客戶骨架重構（完成：2026-03-05）
**Module:** 全域架構
**Notes:** 已於 `index.html` 頂部建立 `const CUSTOMERS`（營邦/倫飛），導入 Tab UI（營邦/倫飛）與切換流程；營邦 localStorage key 改為 `yingbang_` 前綴並加入舊 key migration；倫飛頁籤目前為可切換空殼工作區，待 T12 起逐步實作。

---

### ✅ T10 — 歷史記憶顯示表格（完成：2026-03-05）
**Module:** HistoryModule / UI
**Notes:** 已新增「查看歷史」按鈕，支援表格顯示所有歷史 key 與已使用流水號，並提供單筆重置功能。

### ✅ T08 — UI 整體版面與樣式（完成：2026-03-04）
**Module:** UI
**Notes:** 查詢/操作區與預覽區分層、DDC料號/品名視覺強調、欄位複製卡片樣式、響應式排版、錯誤提示框、loading 狀態。

### ✅ T07 — ExcelExportModule（完成：2026-03-04）
**Module:** ExcelExportModule
**Notes:** 實作 `exportExcel()`（SN/Datecode/PN 三欄），使用 FileSaver 下載，串接生成流程。

### ✅ T06 — SNGeneratorModule（完成：2026-03-04）
**Module:** SNGeneratorModule
**Notes:** 實作 `getISOWeek/getDatecode/buildSN/generateSNList`，透過 HistoryModule 接續流水號。

### ✅ T05 — HistoryModule（完成：2026-03-04）
**Module:** HistoryModule
**Notes:** 實作 `getHistory/getLastSerial/updateHistory/getWorkOrderHistory/appendWorkOrderHistory/clearWorkOrderHistory`，工單級清空歷史 + 確認對話框。

### ✅ T04 — PreviewModule（完成：2026-03-04）
**Module:** PreviewModule
**Notes:** DDC料號/品名置頂，SN/Datecode/PN/QTY 欄位複製，1.5 秒回饋。

### ✅ T03 — 搜尋 UI（完成：2026-03-04）
**Module:** UI / PreviewModule
**Notes:** 精確匹配優先、部分匹配次之，Enter 觸發，查詢失敗友善提示。

### ✅ T02 — ExcelReaderModule（完成：2026-03-04）
**Module:** ExcelReaderModule
**Notes:** 檔案選擇、SheetJS 讀取、`parseArrow()` 全欄套用，File System Access API + IndexedDB 來源檔綁定。

### ✅ T01 — 專案骨架（完成：2026-03-04）
**Module:** 全域
**Notes:** `index.html` 建立，SheetJS / FileSaver CDN 引入，頂部 `CONFIG` 物件建立。

---

## 📊 Progress Summary

| Phase | Total | Done | In Progress | Todo |
|-------|-------|------|-------------|------|
| Phase 1 MVP（營邦） | 9 | 9 | 0 | 0 |
| Phase 2（多客戶 + 倫飛） | 6 | 6 | 0 | 0 |
| Phase 3（新增超恩） | 1 | 1 | 0 | 0 |
| Phase 4（新增 KOYA） | 1 | 1 | 0 | 0 |
| Phase 5（全客戶規則統一） | 1 | 1 | 0 | 0 |
| **Total** | **18** | **18** | **0** | **0** |

---

## 🗓️ Suggested Build Order（Phase 2）

```
T11 多客戶骨架重構（Tab UI + storageKey 前綴）
  └─ T12 倫飛 ExcelReaderModule
       └─ T13 倫飛搜尋 MO + 特殊型號彈窗
            └─ T14 倫飛 LunfeiSNGeneratorModule
                 └─ T15 倫飛 ExcelExportModule（雙 Sheet）
                      └─ T16 倫飛整合測試
```

---

## 📝 Notes for AI Agent

每次請 AI 協助實作時，請提供：
1. 本文件（確認目前任務）
2. `ARCHITECTURE.md`（了解模組設計與規則）
3. 目前 `index.html` 內容（若已有部分實作）

每個 Task 建議**單獨交給 AI 執行**，避免一次處理多個模組。
Phase 2 從 **T11** 開始，T11 完成後確認營邦功能正常再繼續。

---

*Last updated: 2026-03-10*
