# Task Backlog

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.1
**Last Updated:** 2026-03-13

---

> **📌 How to use this file:**
> - 每次開發前先看 `🔄 In Progress`，確認目前進行中的任務
> - 完成一個 Task 後將狀態改為 `✅ Done`，並填入完成日期
> - 新任務加入 `⬜ Todo`，並指定所屬模組與優先順序
> - 此文件只記錄 **WHAT to do**，WHY & HOW 請參考 `ARCHITECTURE.md`

---

## 🔄 In Progress

（目前無）

---

## ⬜ Todo — Phase 6：Nginx + FastAPI 架構轉換

### 🚀 T28 — 部署與交接文件
**Module:** Docs / DevOps
**Priority:** 🟢 Low
**Depends on:** T27

**Sub-tasks:**
- [ ] 更新 `ARCHITECTURE.md` 為後端化架構
- [ ] 更新 `PROCESS.md`（含新啟動與驗收流程）
- [ ] 補充部署文件（Nginx/FastAPI 啟動步驟）
- [ ] 補充 API 使用說明（request/response 範例）

**Acceptance Criteria:**
- 新同事可依文件完成本機部署
- 開發流程與驗收流程可直接照文件執行
- 文件內容與實作一致

---

## ✅ Done

### ✅ T31 — 四客戶預覽窗格新增可配置備註槽（完成：2026-03-13）
**Module:** UI / Customer Config
**Notes:** 在四個客戶預覽窗格的頁籤列右側新增備註區塊；備註內容改由 `index.html` 的 `CUSTOMERS.{key}.previewNote / previewNoteHtml` 控制，現場可直接改文字而不需改程式碼。同步補上樣式與行動版排版。

### ✅ T30 — 超恩 SN 匯出新增機種名稱欄位（完成：2026-03-13）
**Module:** 超恩 / ExcelExport / Backend ExportTemplate
**Notes:** 超恩 `SN` sheet 新增 `機種名稱` 欄位；值與 BOX `Model` 同規則，遇到 `' 1.'` 後截斷。`機種名稱` 欄位只填前 `生產數量` 筆（其餘留空），並同步更新後端匯出模板與整合測試樣本。

### ✅ T29 — 超恩 UUID 匯出欄位拆分（完成：2026-03-13）
**Module:** 超恩 / ExcelExport / Backend ExportTemplate
**Notes:** 依現場需求將超恩 SN sheet 的 UUID 單欄改為雙欄 `uuid1`、`uuid2`；拆分規則改為 `uuid1=前15位`、`uuid2=後17個F`。同步調整前端匯出組裝、後端 `EXPORT_HEADERS`、以及整合測試樣本欄位，避免前後端欄位不一致造成 UUID 空白。

### ✅ T27 — 全流程整合測試（新架構）（完成：2026-03-12）
**Module:** QA / E2E
**Notes:** 已新增 `backend/tests/t27_integration_runner.py` 可重跑整合測試，涵蓋四客戶核心流程（解析/生成/匯出/歷史）與失敗情境（找不到 sheet、provided_serials 筆數不符、customer 非法、營邦缺 purchase_order）。測試結果已記錄於 `Test-Report.md`，本次執行 5/5 全通過，無 P0/P1 阻斷錯誤。

### ✅ T25 — 前端改為呼叫 FastAPI API（完成：2026-03-11）
**Module:** Frontend / API Integration
**Notes:** 已完成前端 API 串接：讀表改用 `/api/excel/parse`、生成改用 `/api/sn/generate`、匯出改用 `/api/export`、歷史查詢與重置改用 `/api/history/*`。同時補強後端 `HistoryService`：支援 `increment=0` 的 record-only 寫入不污染 `serial_history`，以及 `reset` 可刪除僅存在 generation record 的 key。

### ✅ T26 — Nginx 反向代理與靜態資源配置（完成：2026-03-11）
**Module:** Infra / Nginx
**Notes:** 已完成 Docker 化部署：`backend/Dockerfile`、`docker-compose.yml`、`deploy/nginx/nginx.conf`。Nginx 已可提供前端靜態頁並反向代理 `/api/*` 到 FastAPI；已驗證 `http://localhost:8080/api/health`、`/api/excel/parse` 上傳與 `/api/export` 下載流程可用。

### ✅ T24 — Excel 匯出服務後端化（完成：2026-03-11）
**Module:** Backend / ExportService
**Notes:** 已完成四客戶匯出服務與欄位模板（營邦單 sheet、倫飛/超恩/KOYA 雙 sheet），`POST /api/export` 直接回傳附件下載；預設檔名統一 `{customer}-SN.xls`。

### ✅ T23 — Excel 解析服務後端化（完成：2026-03-11）
**Module:** Backend / ExcelParserService
**Notes:** 已完成 `multipart/form-data` 上傳解析（`POST /api/excel/parse`）；支援 `arrow/trim` parse rules、四客戶欄位 alias 對應與 sheet 不存在錯誤處理；回傳標準化 `rows` 與 `resolved_columns`。

### ✅ T22 — SN 生成邏輯後端化（完成：2026-03-11）
**Module:** Backend / SerialService
**Notes:** 已實作後端 SN 服務：營邦 `po_plus_fixed`、倫飛 `lunfei_weekly`（含 ISO 週 key），並接入 `HistoryService` 進行流水號接續；超恩/KOYA 新增 `provided_serials` 對接欄位作為現行流程銜接點。

### ✅ T21 — 歷史紀錄改為後端持久化（SQLite）（完成：2026-03-11）
**Module:** Backend / HistoryService / DB
**Notes:** 已建立 SQLite `serial_history/generation_history` 表；History API 完成 `GET /api/history/{customer}`、`POST /api/history/upsert`、`POST /api/history/reset`；加入 customer namespace 驗證（`yingbang/lunfei/bng/chg`）與非法參數防呆。

### ✅ T20 — 建立 FastAPI 專案骨架與分層（完成：2026-03-11）
**Module:** Backend / FastAPI / Project Structure
**Notes:** 已建立 `backend/` 專案結構（`app/main.py`, `routers/`, `services/`, `schemas/`, `core/`），新增 `GET /api/health` 與 `/api/excel|sn|export|history` 路由骨架；完成統一 API 回應格式與全域錯誤處理；新增 `backend/requirements.txt` 與 `backend/README.md` 啟動說明。

### ✅ T19 — 全客戶匯出命名與歷史格式統一（完成：2026-03-10）
**Module:** 全域 / UI / ExcelExport / History
**Notes:** 超恩預覽窗格改為分區顯示（SN/MAC/UUID/FW&BIOS/BOX）；BOX 分區機種名稱遵循 `' 1.'` 截斷規則。全客戶匯出檔名統一為 `{客戶名}-SN.xls`（營邦/倫飛/超恩/KOYA），生成歷史留痕統一為 `YYYY-MM-DD-工單`。

### ✅ T18 — KOYA 客戶模組（完成：2026-03-09）
**Module:** KOYA / 全域
**Notes:** 已依 `intake-new-customer.md` 新增 `chg`（KOYA）客戶：讀取「KOYA出貨」sheet，工單欄位支援模糊查詢；預覽顯示工單/機種/PO/批量，並分為 Label 分區（PN、小張貼紙）與 Box Label 分區（滿箱數量、需求、尾數數量）。匯出改為雙 sheet（`SN` + `BOX`）：SN 欄位為 `工單/PN` 並依小張貼紙數量重複列；BOX 欄位為 `PO/PN/full PN/DDC PN/DDC LOT/QTY/DATE`，其中 DATE 取匯出當天 `yyyy/mm/dd`。歷史鍵使用工單，支援查看歷史、單筆重置與清空當前工單歷史。

### ✅ T17 — 超恩客戶模組（完成：2026-03-06）
**Module:** 超恩 / 全域
**Notes:** 已依 intake 規格更新超恩（`bng`）流程：讀取「超恩出貨」後以 `MO` 模糊查詢；預覽顯示日期/工單/機種名稱/機種料號/生產數量/MAC Address/MAC數量/MAC板子用量數量/序號區間/UUID區間；區間格式可自動補 ` ~ `，UUID=`0` 顯示「無」。匯出改為雙 sheet（`SN` + `BOX`）：SN 欄位為 `序號/MAC Address/UUID/BIOS/FW`，BOX 欄位為 `PO/Model/料號/SN/思創PN/Date`。

### ✅ T16 — 倫飛整合測試（完成：2026-03-05）
**Module:** 全域
**Notes:** 已完成自動化整合模擬（同週跨 MO 接續、新週重置、雙 sheet 匯出、客戶前綴 key 隔離）並確認流程通過；型號彈窗與按鈕禁用規則已在查詢流程中驗證。

### ✅ T15 — 倫飛 ExcelExportModule（雙 Sheet）（完成：2026-03-05）
**Module:** 倫飛 / ExcelExportModule（共用擴充）
**Notes:** 已實作 `exportLunfeiExcel()`，匯出含 "SN" 與 "box" 兩個 sheet；SN sheet 僅 SN 欄、筆數等於 Q'ty；box sheet 欄位為 `P/N/加工WO#/對應PCBA/工單/Model/日期`。

### ✅ T14 — 倫飛 LunfeiSNGeneratorModule（完成：2026-03-05）
**Module:** 倫飛 / LunfeiSNGeneratorModule
**Notes:** 已完成 `getLunfeiWeekKey/buildLunfeiSN/generateLunfeiSNList`，以 `YYYY-WNN` 作為週流水歷史 key，同週跨 MO 接續五位流水號；並將生成紀錄寫入 `lunfei_sn_generation_history_by_mo`。

### ✅ T13 — 倫飛搜尋 MO + 特殊型號彈窗（完成：2026-03-05）
**Module:** 倫飛 / LunfeiPreviewModule
**Notes:** 已新增倫飛搜尋框與查詢按鈕（含 Enter），MO 搜尋採精確優先/部分匹配次之；查詢成功後於預覽置頂顯示 Model 並帶入可複製欄位，並即時執行特殊型號彈窗判斷與 BAG428-001D 生成按鈕禁用。

### ✅ T12 — 倫飛 ExcelReaderModule（完成：2026-03-05）
**Module:** 倫飛 / ExcelReaderModule（共用）
**Notes:** 已新增倫飛來源設定區，讀取 `倫飛出貨` sheet 並套用共用 `parseArrow()`；資料獨立儲存於 `lunfeiRowData[]`。

### ✅ T11 — 多客戶骨架重構（完成：2026-03-05）
**Module:** 全域架構
**Notes:** 已於 `index.html` 頂部建立 `const CUSTOMERS`（營邦/倫飛），導入 Tab UI 與切換流程；營邦 localStorage key 改為 `yingbang_` 前綴並加入舊 key migration。

### ✅ T10 — 歷史記憶顯示表格（完成：2026-03-05）
**Module:** HistoryModule / UI
**Notes:** 已新增「查看歷史」按鈕，支援表格顯示所有歷史 key 與已使用流水號，並提供單筆重置功能。

### ✅ T09 — 整合測試（營邦）（完成：2026-03-05）
**Module:** 全域
**Notes:** 已完成終端模擬整合驗證（查詢、跨工單同採單連續流水、`→` 欄位更新、QTY>1、找不到工單、清空後重生、匯出資料與檔名檢查）。

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
| Phase 6（Nginx + FastAPI） | 9 | 8 | 0 | 1 |
| Phase 7（Hotfix） | 3 | 3 | 0 | 0 |
| **Total** | **30** | **29** | **0** | **1** |

---

## 🗓️ Suggested Build Order（Phase 6）

```
T27 全流程整合測試
  └─ T28 部署與交接文件
```

---

## 📝 Notes for AI Agent

每次請 AI 協助實作時，請提供：
1. 本文件（確認目前任務）
2. `ARCHITECTURE.md`（了解模組設計與規則）
3. 相關現況程式碼（前端或 backend）

每個 Task 建議**單獨交給 AI 執行**，避免一次處理多個模組。
目前請從 **T28** 開始執行，完成並驗證後再進到下一個 Task。

---

*Last updated: 2026-03-13*
