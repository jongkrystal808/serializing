# Task Backlog

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.13
**Last Updated:** 2026-03-18

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

### ✅ T43 — 實作 Excel 上傳持久化與自動恢復（完成：2026-04-24）
**Module:** Backend / Frontend / Excel
**Notes:** 已實作自動記憶最後一次上傳的功能。後端在上傳時會將檔案與參數存入 `backend/data/uploads/`，並提供 `/api/excel/load-last` 接口供恢復資料。前端在 `main()` 初始化時會自動嘗試呼叫此接口，達成「免重複上傳」的目標。

### ✅ T42 — 新增赫星（hmg）客戶模組（完成：2026-03-18）
**Module:** HMG / Frontend / Backend
**Notes:** 已新增 `hmg` 客戶頁籤與獨立上傳流程（`Sheet1`）；查詢改為沿用 Cubepilot 提示清單體驗，並以 Model 前六碼 `contains` 比對。匯出採單 sheet `HEX`（`Model/PN/EAN Code/PCBA`），檔名格式為 `[yyyymmdd]-[Model].xls`。SN 生成流程維持「不輸出 SN 欄」，但歷史主鍵改為 `Model`（`sn_history` + `generation_history`），且規則僅作用於 `hmg` 不影響其他客戶。後端已同步加入 `hmg` allowlist、Excel 欄位 alias 與匯出模板。

### ✅ T41 — Cubepilot 無 Excel 直出模式（完成：2026-03-17）
**Module:** Cubepilot / Frontend
**Notes:** Cubepilot 現在可在未上傳 Excel、未查詢機種的情況下直接使用序號生成設定並匯出。生成按鈕啟用條件改為「序號設定有效」而非「已查詢機種」。未上傳 Excel 時仍可顯示生成前預覽（前/後 10 筆），匯出流程會以手動模式執行。

### ✅ T40 — Cubepilot 新增「1–6 循環進位制」（完成：2026-03-17）
**Module:** Cubepilot / Frontend Serial Rule
**Notes:** Cubepilot 進制選單已新增 `1–6 循環進位制`。序號規則採分段進位：每段 `x1~x6`，遇 `x6` 後跳至下一段 `x1`（如 `00016 -> 00021`）。新規則已同步套用於「生成前預覽（前 10 / 後 10）」與「生成匯出」流程，並補齊起始流水號格式驗證（僅數字且個位數必須 1~6）。

### ✅ T39 — Cubepilot 新增「0–6 循環進位制」（完成：2026-03-17）
**Module:** Cubepilot / Frontend Serial Rule
**Notes:** Cubepilot 進制選單已新增 `0–6 循環進位制`。序號規則採分段進位：每段 `x0~x6`，遇 `x6` 後跳至下一段 `x0`（如 `00016 -> 00020`）。新規則已同步套用於「生成前預覽（前 10 / 後 10）」與「生成匯出」流程，並補齊起始流水號格式驗證（僅數字且個位數必須 0~6）。

### ✅ T38 — Cubepilot 序號預覽時機調整（完成：2026-03-17）
**Module:** Cubepilot / Frontend Preview
**Notes:** 已將 Cubepilot 的「前 10 筆 / 後 10 筆」改為生成前即時預覽。使用者在查詢機種後，只要調整前綴/起始流水號/後綴/進制/數量，預覽區段會立即刷新。若輸入不完整或格式錯誤，預覽區會顯示對應提示訊息。

### ✅ T37 — Cubepilot 生成後序號區段預覽（完成：2026-03-17）
**Module:** Cubepilot / Frontend Preview
**Notes:** Cubepilot 在生成並匯出後，預覽窗格會顯示最近一次生成結果的「前 10 筆」與「後 10 筆」序號清單；若總筆數不足 10，則依實際筆數顯示。新增顯示條件為「目前查詢機種 = 最近一次生成機種」，避免切換機種時顯示錯誤結果。

### ✅ T36 — Cubepilot UX/匯出熱修（完成：2026-03-17）
**Module:** Cubepilot / Frontend / Backend Export
**Notes:** `clg` 匯出 sheet 名稱已改為 `MES`。Cubepilot 序號設定區欄位順序調整為前綴/起始流水號/後綴/進制/數量（數量移到最後）。預覽窗格改為空值欄位自動隱藏。查詢機種改為關鍵字提示清單並可點選，移除 `prompt` 強制輸入序號的流程。另補上整合測試驗證 `clg` 匯出 sheet 為 `MES`。

### ✅ T35 — Excel 解析原生支援 `.xls`（完成：2026-03-17）
**Module:** Backend / ExcelParserService
**Notes:** 後端 `ExcelService` 新增雙格式讀取流程，會依檔案內容與副檔名自動嘗試 `.xlsx(openpyxl)` 與 `.xls(xlrd)`。`/api/excel/parse` 現在可直接解析 `.xls`；不可解析時統一回傳 `INVALID_EXCEL_FILE`（400，訊息含 `.xls/.xlsx`）。另新增 `xlrd==2.0.1` 依賴，並完成本地 `.xls` 實檔 API 驗證（`sheet=SN` 解析成功）。

### ✅ T34 — 新增 Cubepilot 客戶模組（完成：2026-03-17）
**Module:** Cubepilot / Frontend / Backend
**Notes:** 已新增 `clg`（Cubepilot）客戶：讀取 `Sheet1` 並以 `機種名` 做 `contains` 查詢（忽略大小寫），多筆命中可由使用者選擇單筆。新增手動序號規則（前綴/起始流水號/數量/後綴/10或16進制）並串接 `/api/sn/generate`（`provided_serials`）。匯出採單 sheet（`SN`）且檔名由使用者輸入。歷史 key 以機種名管理，支援歷史面板查看與單筆重置。`clg` 改為獨立上傳解析，不再與營邦/倫飛/超恩/KOYA 共用同一份 Excel。後端已同步加入 `clg` allowlist、Excel 欄位 alias、SN 分流與匯出模板。

### ✅ T33 — 預覽窗格改為可新增/編輯的自訂附加頁籤（完成：2026-03-16）
**Module:** 全客戶 / UI / Preview Tabs
**Notes:** 移除原本頁籤列右側備註區（綠框）；改為頁籤列右側顯示 `+ 新增頁籤`，可輸入頁籤名稱後建立自訂頁籤。自訂頁籤內容改為在該頁籤內容區直接編輯（`contenteditable`），失焦即自動儲存；並支援單頁籤移除。新增內容儲存於 localStorage（`sn_preview_custom_tabs`），重整後可保留；固定設定頁籤（`previewCustomTabs`）與動態新增頁籤可同時存在，樣式與預設三頁籤區隔。

### ✅ T32 — 超恩收據明細套印列印（完成：2026-03-16）
**Module:** 超恩 / UI / Print Layout
**Notes:** 新增超恩「列印收據明細」按鈕與列印版型；欄位對應為 `DDC Model<-Model`、`MO<-MO`、`Work Order Number<-工單`、`Model<-機種名稱(去除 " 1." 起)`、`Number of MACs<-MAC數量`、`Part Number<-機種料號`、`MAC range<-MAC Address`、`Quantity<-生產數量`、`Remark<-機種名稱中 " 1." 起內容`。列印尺寸調整為約 A4 直向高度的 1/5，並套用淺灰標題底色。

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
| Phase 7（Hotfix） | 5 | 5 | 0 | 0 |
| Phase 8（新增 Cubepilot） | 1 | 1 | 0 | 0 |
| Phase 9（Hotfix：Excel `.xls` 支援） | 1 | 1 | 0 | 0 |
| Phase 10（Hotfix：Cubepilot UX/匯出） | 1 | 1 | 0 | 0 |
| Phase 11（Hotfix：Cubepilot 序號區段預覽） | 1 | 1 | 0 | 0 |
| Phase 12（Hotfix：Cubepilot 預覽時機） | 1 | 1 | 0 | 0 |
| Phase 13（Hotfix：Cubepilot 新進制） | 1 | 1 | 0 | 0 |
| Phase 14（Hotfix：Cubepilot 1–6 新進制） | 1 | 1 | 0 | 0 |
| Phase 15（Hotfix：Cubepilot 無 Excel 直出） | 1 | 1 | 0 | 0 |
| Phase 16（新增赫星 HMG） | 1 | 1 | 0 | 0 |
| **Total** | **41** | **40** | **0** | **1** |

---

## 🗓️ Suggested Build Order（Phase 6 + Phase 16）

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
優先執行 `🔄 In Progress` 任務；若無進行中任務，再依 `⬜ Todo` 由上而下處理。

---

*Last updated: 2026-03-18*
