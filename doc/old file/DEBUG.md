# Debug Log

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.2.2
**Last Updated:** 2026-03-13

---

> **📌 How to use this file:**
> - 每次遇到 Bug 或異常，立即在此記錄
> - 解決後填入 Root Cause 與 Fix，狀態改為 `✅ Resolved`
> - 未解決的問題留在 `🔴 Open`，並記錄已嘗試的方法
> - 此文件同時作為**已知問題庫**，避免重複踩坑
>
> **Bug ID 格式：** `BUG-YYYYMMDD-NNN`（日期 + 當日序號）

---

## 🔴 Open Bugs

*（目前無未解決問題）*

---

## ✅ Resolved Bugs

### BUG-20260313-001 — 超恩匯出 UUID 欄位為空或未正確拆欄

**Status:** ✅ Resolved
**Date Found:** 2026-03-13
**Found By:** 使用者
**Module:** 超恩 / ExcelExport / Backend ExportService
**Severity:** 🔴 Critical

---

**symptom（症狀）:**
> 超恩匯出檔原本 UUID 欄位為空；修正後改成 `uuid1/uuid2` 時，仍出現整串 UUID 全落在 `uuid1`、`uuid2` 為空。

**Steps to Reproduce（重現步驟）:**
1. 超恩頁籤查詢 MO
2. 點「生成序號 & 匯出」
3. 開啟 SN sheet，檢查 UUID 相關欄位

**Expected Result（預期結果）:**
> UUID 應拆成兩欄：`uuid1`（前15位）與 `uuid2`（後17個 F）。

**Actual Result（實際結果）:**
> 一開始因前後端欄位不一致導致 UUID 欄位空白；後續又因拆分規則誤設為前16位，造成部分資料 `uuid2` 仍為空。

**Root Cause（根本原因）:**
> 1) 前端已改 `uuid1/uuid2`，但後端匯出模板仍讀 `UUID` 單欄。  
> 2) UUID 拆分規則與實際資料格式不符（現場格式為前15位 + 後17個 F）。

**Fix（修復方式）:**
> 1) 前後端統一超恩 SN 匯出欄位為 `序號/MAC Address/uuid1/uuid2/BIOS/FW`。  
> 2) UUID 拆分規則調整為 `^([0-9A-F]{15})(F{17})$`。  
> 3) 更新整合測試超恩匯出樣本欄位為 `uuid1/uuid2`。

**Date Resolved:** 2026-03-13

---

### BUG-20260310-001 — 匯出 Excel 匯入 BarTender 失敗（iFK -> iBT 轉型錯誤）

**Status:** ✅ Resolved
**Date Found:** 2026-03-10
**Found By:** 使用者
**Module:** ExcelExportModule
**Severity:** 🔴 Critical

---

**symptom（症狀）:**
> 匯出檔案匯入 BarTender 時，出現錯誤：`[500] Could not execute the specified command: System error: 無法將類型 'rxo190c.iFK' 的物件轉換為類型 'rxo190c.iBT'`

**Steps to Reproduce（重現步驟）:**
1. 在系統內完成查詢並點擊「生成序號 & 匯出」
2. 取得匯出 Excel
3. 將該 Excel 匯入 BarTender

**Expected Result（預期結果）:**
> BarTender 可正常讀取匯出的 Excel 資料來源。

**Actual Result（實際結果）:**
> BarTender 解析失敗並拋出型別轉換錯誤。

**Root Cause（根本原因）:**
> 匯出使用 `.xlsx` 與混合欄位型別，BarTender 在某些情境下對該格式/型別組合相容性不足，導致內部資料物件轉型失敗。

**Fix（修復方式）:**
> 匯出流程改為 BarTender 相容模式：輸出 `xls`（BIFF）並將所有儲存格強制為文字型別（`cell.t = "s"`），同時統一對應 MIME type。

**Date Resolved:** 2026-03-10

---

### BUG-20260305-001 — 倫飛查看歷史欄位標示誤導

**Status:** ✅ Resolved
**Date Found:** 2026-03-05
**Found By:** 使用者
**Module:** HistoryModule / UI
**Severity:** 🟡 Major

---

**symptom（症狀）:**
> 倫飛「查看歷史」表格第一欄標示為「工單/採單號碼」，但實際 key 為週別（`YYYY-WNN`）。

**Steps to Reproduce（重現步驟）:**
1. 切換到倫飛頁籤
2. 先生成一批序號
3. 點擊「查看歷史」

**Expected Result（預期結果）:**
> 欄位名稱應清楚顯示週別 key，避免誤判為工單或採單。

**Actual Result（實際結果）:**
> 欄位名稱與實際 key 類型不一致。

**Root Cause（根本原因）:**
> 歷史表格共用渲染函式，欄位標題固定未依客戶上下文調整。

**Fix（修復方式）:**
> 將歷史表格渲染改為可傳入 `keyLabel`；營邦顯示「採單號碼」，倫飛顯示「週別 key」。

**Date Resolved:** 2026-03-05

---

### BUG-20260305-002 — 倫飛 MO/Q'ty 斜線配對未生效

**Status:** ✅ Resolved
**Date Found:** 2026-03-05
**Found By:** 使用者
**Module:** LunfeiPreviewModule / LunfeiSNGeneratorModule
**Severity:** 🔴 Critical

---

**symptom（症狀）:**
> 同列資料 `MO` 與 `Q'ty` 以 `/` 分隔時（如 `11116160/11115829` 與 `10/340`），查詢 MO 後 Q'ty 未按順序對應，導致生成數量錯誤。

**Steps to Reproduce（重現步驟）:**
1. 在倫飛資料中準備 `MO=11116160/11115829`, `Q'ty=10/340`
2. 查詢 `11116160` 與 `11115829`
3. 觀察預覽與生成數量

**Expected Result（預期結果）:**
> `11116160 -> 10`、`11115829 -> 340`，預覽與生成一致。

**Actual Result（實際結果）:**
> 系統未按位置對應，可能使用整欄原值或錯誤數量。

**Root Cause（根本原因）:**
> 倫飛數量計算只讀單一 Q'ty 值，缺少 `MO/Q'ty` 斜線位置配對邏輯。

**Fix（修復方式）:**
> 新增 `resolveQtyByPairedSlash(row, query, 'MO', 'QTY')`，以 `/` 分隔後按位置對應；倫飛查詢預覽與生成流程皆改用此函式。

**Date Resolved:** 2026-03-05

---

## 📋 Bug Template

每次新增 Bug 請複製以下模板：

```markdown
### BUG-YYYYMMDD-001 — [Bug 標題]

**Status:** 🔴 Open / 🟡 In Progress / ✅ Resolved
**Date Found:** YYYY-MM-DD
**Found By:** [發現者]
**Module:** [ExcelReaderModule / SNGeneratorModule / PreviewModule / ExcelExportModule / HistoryModule / UI]
**Severity:** 🔴 Critical / 🟡 Major / 🟢 Minor

---

**symptom（症狀）:**
> 描述看到的異常現象，例如「點擊匯出後瀏覽器無反應」

**Steps to Reproduce（重現步驟）:**
1. 步驟一
2. 步驟二
3. 步驟三

**Expected Result（預期結果）:**
> 正常情況下應該發生什麼

**Actual Result（實際結果）:**
> 實際發生了什麼

**Console Error（若有）:**
\`\`\`
貼上 console 錯誤訊息
\`\`\`

**Root Cause（根本原因）:**
> 找到原因後填入

**Fix（修復方式）:**
> 說明怎麼修的，或修改了哪個函式 / 哪行程式碼

**Date Resolved:** YYYY-MM-DD
```

---

## ⚠️ Known Limitations（已知限制，非 Bug）

| # | 說明 | 影響範圍 | 備註 |
|---|------|----------|------|
| L01 | localStorage 歷史綁定於特定瀏覽器，換電腦需手動匯出匯入 | HistoryModule | Phase 2 T10 預計解決 |
| L02 | 若資料欄位本身合法包含 `→` 符號，會誤觸更新邏輯 | ExcelReaderModule | 目前業務資料無此情況 |
| L03 | SheetJS CDN 首次載入需要網路連線 | 全域 | 離線環境需改為本地引入 |
| L04 | 不支援 `.xls`（舊版 Excel 格式），僅支援 `.xlsx` | ExcelReaderModule | 來源檔案為 `.xlsx`，無影響 |

---

## 🔍 Debugging Checklists

### Excel 讀取問題
- [ ] 確認選取的是 `.xlsx` 格式（非 `.xls` 或 `.csv`）
- [ ] 開啟 DevTools → Console，確認 SheetJS 是否有載入錯誤
- [ ] 確認 Sheet 名稱為「營邦出貨」（注意全形/半形空格）
- [ ] 確認來源 Excel 未被其他程式鎖定開啟（Windows 檔案鎖定問題）
- [ ] 檢查 `rowData[]` 長度（`console.log(rowData.length)`）

### 搜尋 / 查詢問題
- [ ] 確認已先點擊「讀取表格」載入 Excel
- [ ] 確認工單號輸入無多餘空白（前後 trim）
- [ ] `console.log(rowData)` 確認工單欄位名稱是否與 CONFIG 一致
- [ ] 確認搜尋比對邏輯（大小寫 / 全形半形）

### SN 生成問題
- [ ] 確認 localStorage `"sn_history"` 內容（DevTools → Application → Local Storage）
- [ ] 確認採單號碼讀取正確（`console.log(currentRow)`）
- [ ] 確認 `getISOWeek()` 計算結果（`console.log(getDatecode())`）
- [ ] 確認 QTY 為正整數（非字串 `"5"` 需 `parseInt()`）

### Excel 匯出問題
- [ ] 確認 FileSaver.js CDN 已成功載入
- [ ] 確認 `snList[]` 不為空（`console.log(snList.length)`）
- [ ] 確認瀏覽器未封鎖自動下載（檢查網址列右側下載提示）
- [ ] 嘗試不同瀏覽器（Chrome / Edge）

### localStorage 問題
- [ ] DevTools → Application → Local Storage → 確認 `"sn_history"` 存在
- [ ] 確認 JSON 格式正確（`JSON.parse(localStorage.getItem("sn_history"))`）
- [ ] 若懷疑資料損毀 → 執行 `clearHistory()` 重置後重試

---

## 🛠️ Common Error Messages

| Error Message | 可能原因 | 解決方式 |
|---------------|----------|----------|
| `Cannot read properties of undefined (reading 'Sheets')` | SheetJS 未載入或 Excel 讀取失敗 | 確認 CDN 載入 + 檔案格式 |
| `Sheet "營邦出貨" not found` | Sheet 名稱不符 | 確認 Excel 內 Sheet 名稱（含空白） |
| `navigator.clipboard is undefined` | 非 HTTPS 環境或舊瀏覽器 | 改用 `document.execCommand('copy')` fallback |
| `localStorage is not available` | 無痕模式或瀏覽器限制 | 提示使用者關閉無痕模式 |
| `NaN` 出現在 SN 中 | QTY 欄位讀取為字串未轉整數 | 加上 `parseInt()` 或 `Number()` |
| `Datecode 週數錯誤` | `getISOWeek()` 計算邏輯錯誤 | 對照線上 ISO Week 計算器驗證 |

---

## 📝 Debug Notes（臨時筆記區）

> 開發過程中的臨時觀察、懷疑方向、或尚未確認的異常，可先記在這裡

- 2026-03-10：完成超恩預覽分區調整，並統一全客戶匯出檔名為 `{客戶名}-SN.xlsx`、生成歷史格式為 `YYYY-MM-DD-工單`；本次未新增 Open Bug。

---

*Last updated: 2026-03-13*
