# Project Architecture

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.36
**Last Updated:** 2026-05-11

---

> 本文件是目前實作的架構基準（Source of Truth for WHY/HOW）。
> 任務拆解與進度請看 `TASK.md`，開發流程請看 `PROCESS.md`。

---

## 1. Architecture Overview

系統採用「前端靜態頁 + 後端 API + SQLite」分層架構：

```text
Browser (index.html + js/* + styles/*)
  -> /api/* (Nginx reverse proxy)
FastAPI (backend/app/*)
  -> SQLite (backend/data/sn_generator.db)
```

核心設計重點：
- 前端首頁採「單一操作入口」：左歷史、中央搜尋、右匯出，搜尋同時支援工單與赫星機種。
- 首頁聚合搜尋採「客戶獨立欄位解析」，命中判斷不可依賴 active customer，避免跨客戶誤判或漏判。
- 首頁搜尋新增「類型篩選（工單/MO、機種 Model）」；搜尋模式需顯式分流，避免混搜誤命中。
- 首頁命中結果支援客戶色彩主題（營邦深藍、倫飛綠、超恩紫、KOYA 橘）以降低誤判。
- Excel 解析、SN 生成、歷史記錄、匯出都在後端 API 完成。
- 前端只保留少量本機狀態（例如 active customer），不再承擔歷史主儲存。
- 其他四客戶（營邦/倫飛/超恩/KOYA）共用同一份 Excel；Cubepilot 與赫星（hmg）使用各自獨立 Excel。
- 新客戶規則以 `customer key` 隔離，新增/調整 `hmg` 規則時不得影響既有客戶行為。

---

## 2. Technology Stack

### Frontend
- Vanilla HTML + JavaScript（ES Modules）
- CSS：`styles/main.css`
- API 呼叫：`fetch`（`js/modules/api.js`）
- 檔案下載：瀏覽器 Blob 下載（保留 FileSaver CDN）

### Backend
- FastAPI + Uvicorn
- Pydantic v2 schema
- openpyxl（`.xlsx` 讀取/輸出）
- xlrd（`.xls` 讀取）
- SQLite（序號歷史與生成留痕）

### Infra
- Nginx：靜態檔提供 + `/api/*` 反向代理
- Docker Compose（現有部署方式）
- 可改為 Linux 裸機：Nginx + systemd(Uvicorn)

---

## 3. Project Structure

```text
SN-GENERATOR/
├── index.html
├── styles/
│   └── main.css
├── js/
│   ├── app.js
│   ├── config.js
│   ├── state.js
│   └── modules/
│       ├── api.js
│       ├── bngReceipt.js
│       ├── customerColumns.js
│       ├── excel.js
│       ├── homeController.js
│       ├── serialSettings.js
│       ├── ui.js
│       ├── uiClipboard.js
│       ├── uiHistory.js
│       ├── uiPreviewRenderers.js
│       ├── workOrder.js
│       └── utils.js
├── backend/
│   ├── app/
│   │   ├── main.py
│   │   ├── core/
│   │   ├── routers/
│   │   ├── schemas/
│   │   └── services/
│   ├── requirements.txt
│   └── data/
│       └── sn_generator.db        # runtime
├── deploy/
│   └── nginx/
│       └── nginx.conf
└── docker-compose.yml
```

---

## 4. Frontend Runtime Flow

### 4.1 一次上傳共用 Excel（營邦/倫飛/超恩/KOYA）
1. 使用者在任一客戶頁點「上傳共用 Excel」。
2. 前端呼叫 `/api/excel/parse` 四次（`yingbang/lunfei/bng/chg`，各自 sheetName/parseRules）。
3. 四客戶 rowData 同步寫入前端 state。
4. 切換客戶頁籤時，直接使用已載入 rowData，不需再次上傳。

### 4.2 Cubepilot 獨立上傳流程
1. 使用者在 Cubepilot 頁籤上傳專用 Excel。
2. 前端僅呼叫一次 `/api/excel/parse`（`customer=clg`）。
3. clg rowData 單獨更新，不影響其他四客戶已載入資料。

### 4.3 查詢與生成
1. 各客戶依自身查詢欄位（工單或 MO）在 rowData 搜尋。
2. 生成按鈕呼叫 `/api/sn/generate`。
3. 需要留痕時再呼叫 `/api/history/upsert`（record-only 或補充記錄）。
4. 匯出呼叫 `/api/export`，後端直接回傳附件流。

### 4.4 歷史記憶面板
1. 「查看歷史」呼叫 `GET /api/history/{customer}`。
2. 表格顯示 `serial_history.last_serial`，前端格式化為 `N（共 N 筆）`。
3. 單筆重置呼叫 `POST /api/history/reset`。

### 4.5 預覽自訂附加頁籤（多客戶共用）
1. 預覽窗格預設頁籤固定為「預覽 / 表格內容 / 生成歷史」。
2. 頁籤列右側提供 `+ 新增頁籤` 按鈕，可即時新增自訂頁籤（名稱可自定義）。
3. 自訂頁籤內容區支援直接編輯（`contenteditable`），使用者在該區塊內修改內容後失焦即儲存。
4. 自訂頁籤內容以 localStorage `sn_preview_custom_tabs` 儲存，重整後可保留。
5. `CUSTOMERS.{key}.previewCustomTabs`（固定頁籤）與執行時新增頁籤可並存；固定頁籤不提供移除按鈕。

### 4.6 超恩收據套印列印
1. 超恩查詢成功後，啟用「列印收據明細」按鈕（`btn-print-bng`）。
2. 前端以目前 `state.currentRow` 組裝收據資料，並套用欄位映射與字串規則。
3. 呼叫 `window.print()` 前掛載列印專用節點，並以 `printing-bng-receipt` class 僅顯示收據區塊。
4. 列印後清理列印節點，回復一般操作畫面。

### 4.7 單一首頁模式（全客戶聚合搜尋）
1. 首頁只保留一組操作列：「查看歷史 -> 搜尋欄 -> 匯出」。
2. 搜尋輸入支援全客戶聚合查詢：`yingbang/lunfei/bng/chg` 的工單/MO，加上 `hmg/clg` 的機種 Model。
3. 依命中結果分流到對應客戶流程，並把對應預覽窗格同步回首頁。
4. 首頁歷史與匯出跟隨目前命中客戶，沿用既有後端 API。
5. 首頁在「生成序號&匯出」旁提供「產生收據（BNG）」按鈕，僅當命中 `bng` 工單時啟用。
6. BNG 收據按鈕沿用既有超恩收據列印流程（`window.print()` + 列印模板）。
7. 「序號生成設定」入口保留在搜尋欄下方，供手動序號流程使用。
8. 舊多客戶 workspace 保留在程式中作為底層流程與相容層，不作為首頁主視圖。
9. 聚合搜尋比對欄位必須依 `window.CUSTOMERS[{key}]` 的 `columns/columnAliases` 解析，不可直接使用 `CONFIG.COLUMNS`（該值受 active customer 影響）。
10. 首頁搜尋模式為「工單/MO」時僅查 `yingbang/lunfei/bng/chg`；模式為「機種 Model」時僅查 `hmg/clg`。
11. 命中客戶後，首頁狀態列與預覽窗格應套用該客戶主題色；未命中時回到中性樣式。
12. 序號生成設定的「預估生成序號預覽」固定顯示在設定卡片內，不再依附客戶預覽窗格。
13. 機種模式（hmg/clg）的聚合比對也必須使用客戶獨立欄位解析，不可回退到 active-customer 欄位解析。
14. 機種模式多筆命中時，首頁預覽窗格需直接顯示可點選候選清單，避免依賴隱藏區域提示。
15. 首頁命中成功訊息需使用較高可讀性樣式（較大字級），與一般提示訊息區分。
16. 序號生成設定需提供「複製整串序號（純文字）」入口，輸出格式為每行一筆序號。

---

## 5. Backend API Design

Base prefix：`/api`

### Health
- `GET /api/health`

### Excel
- `POST /api/excel/parse`（multipart/form-data）
  - `customer`
  - `sheet_name`
  - `parse_rules`（例如 `arrow,trim`）
  - `file`
  - 支援 `.xls` 與 `.xlsx`（後端自動辨識）
  - **副作用**：自動將檔案與參數持久化至 `uploads/`
- `GET /api/excel/load-last`
  - `customer`
  - 回傳該客戶最後一次上傳的解析結果（rows, resolved_columns）

### SN
- `POST /api/sn/generate`
  - 依 customer 套用不同生成策略

### Export
- `POST /api/export`
  - 回傳 Excel 附件（StreamingResponse）

### History
- `GET /api/history/{customer}`
- `POST /api/history/upsert`
- `POST /api/history/reset`

---

## 6. Persistence Model (SQLite)

資料庫：`backend/data/sn_generator.db`

### serial_history
- `customer` (PK part)
- `history_key` (PK part)
- `last_serial`
- `updated_at`

### generation_history
- `id` (PK)
- `customer`
- `history_key`
- `record`
- `created_at`

---

## 7. Customer Rules (Current)

| 客戶 | 查詢欄位 | SN 生成 key | record key | 歷史面板第一欄 |
|---|---|---|---|---|
| 營邦 `yingbang` | 工單 | 工單 | 工單 | 工單 |
| 倫飛 `lunfei` | MO | 週別 key (`YYYY-WNN`) | MO | 週別 key |
| 超恩 `bng` | MO | MO | MO | MO |
| KOYA `chg` | 工單 | 工單 | 工單 | 工單 |
| Cubepilot `clg` | 機種名 | 機種名 | （無） | 機種名 |
| 赫星 `hmg` | Model（沿用 Cubepilot 搜尋語意） | Model | Model | Model |

### 7.1 營邦
- SN 格式：`{採單號碼} + "1" + 四位流水號`
- 生成遞增 key：工單
- 匯出：單 sheet（`SN/Datecode/PN`）

### 7.2 倫飛
- SN 格式：`106 + WW + 62 + 五位流水號`
- 同週跨 MO 連續，跨週重置
- 生成遞增 key：週別 key
- 留痕 key：MO
- 匯出：雙 sheet（`SN` + `box`）

### 7.3 超恩
- SN/UUID/MAC 由區間展開（前端計算），後端僅驗證 provided_serials 筆數
- 生成遞增 key：MO
- 匯出：雙 sheet（`SN` + `BOX`）
- 新增欄位映射：`來源（SOURCE）`，支援 `來源/拆分標記/拆分註記` alias
- 預覽窗格標題區顯示規則：當 `來源（拆分標記）` 有值時顯示 `來源：{值}`；無值則不顯示
- 預覽區 UI 採「檢查清單式 Copy Panel」：
  - 分區維持卡片化（SN / MAC / UUID / FW&BIOS / BOX），每區提供「全部複製」
  - 區內欄位改為「標籤 + 值 + 右側複製 icon」單列樣式
  - 值欄位（序號/MAC/UUID/BIOS/FW）使用等寬字體，提升人工校對可讀性
  - 重要數值欄位顯示檢查狀態（例如 `生產數量`、`MAC數量`、`MAC板子用量數量`）
  - 單列複製與整區複製共存，複製後按鈕需有「已複製」短暫回饋
- `SN` sheet 欄位：`序號 / MAC Address / uuid1 / uuid2 / 機種名稱 / BIOS / FW`
- UUID 拆欄規則：`uuid1 = 前 15 碼`、`uuid2 = 後 17 個 F`
- `機種名稱` 與 BOX 的 `Model` 同規則，遇到 `" 1."` 後截斷；且 `SN` sheet 僅前 `生產數量` 列填入，超出列留空
- 收據列印（前端）欄位映射：
  - `DDC Model <- Model`
  - `MO <- MO`
  - `Work Order Number <- 工單`
  - `Model <- 機種名稱（去除 " 1." 起內容）`
  - `Number of MACs <- MAC數量`
  - `Part Number <- 機種料號`
  - `MAC range <- MAC Address`
  - `Quantity <- 生產數量`
  - `Remark <- 機種名稱中 " 1." 起內容`
- 收據列印尺寸：目標約 A4 直向高度的 1/5（目前 `190mm x 55mm`）

### 補充：Excel 上傳持久化與自動恢復
1. 每次透過 `/api/excel/parse` 上傳成功後，後端會將原始檔案與解析參數（sheetName, rules）存入 `backend/data/uploads/` 目錄。
2. 存檔採分類制：`shared`（營邦/倫飛/超恩/KOYA）、`clg`（Cubepilot）、`hmg`（赫星）。
3. 前端載入時（`main()`）自動呼叫 `GET /api/excel/load-last?customer={key}`，若有歷史存檔則直接恢復 rowData。
4. 此機制確保使用者重整頁面後，不需再次上傳即可直接進行查詢操作。

### 7.4 KOYA
- label 依數量重複列（前端組裝）
- 生成遞增 key：工單
- 匯出：雙 sheet（`SN` + `BOX`）
- 新增欄位映射：`工單月份（WORK_ORDER_MONTH）`，支援 `工單月份/月份/工單月` alias
- 預覽窗格副標題顯示規則：若有 `工單月份` 則顯示於 `工單/PO/批量` 同列；無值則不顯示
- 預覽區 UI 採「檢查清單式 Copy Panel」（與超恩一致）：
  - 分區維持卡片化（Label / Box Label），每區提供「全部複製」
  - 區內欄位為「標籤 + 值 + 右側複製按鈕」清單列樣式
  - 單列複製與整區複製共存，複製後提供 `已複製 ✓` 回饋

### 7.5 Cubepilot
- Excel 上傳為選填：未上傳也可直接使用序號生成與匯出
- 查詢欄位：`機種名`（`contains`，僅忽略大小寫）
- 查詢方式：關鍵字提示清單，多筆命中時由使用者點選單筆（非 prompt）
- SN 規則：手動輸入 `prefix/start_sn/count/suffix/base(10|16|0-6循環進位制|1-6循環進位制)` 生成
- 序號設定欄位順序：`前綴 -> 起始流水號 -> 後綴 -> 進制 -> 要生產幾個序號`
- `0–6 循環進位制`：每段 `x0 ~ x6`，遇 `x6` 後跳至下一段 `x0`（例：`00016 -> 00020`）
- `1–6 循環進位制`：每段 `x1 ~ x6`，遇 `x6` 後跳至下一段 `x1`（例：`00016 -> 00021`）
- 生成遞增 key：機種名（`serial_history`）
- `generation_history`：不使用
- 預覽窗格：空值欄位不顯示
- 生成前預覽：依目前序號設定即時顯示預估前 10 筆與後 10 筆
- 匯出：單 sheet（`MES`），欄位僅 `SN`
- 匯出檔名：使用者自行命名

### 7.6 赫星（hmg）
- 專用來源檔（現場）：`H:\@思創出貨計畫(Cubepilot)\各機種貼紙代碼\組裝、包裝階序號編碼.xls`
- `sheetName`: `組測序號編碼`
- 欄位映射：`Model`、`PN`、`EAN Code`、`PCBA/Accessories      機種名`
- 搜尋規則：沿用 Cubepilot 的關鍵字提示與點選流程；查詢欄位為 `Model`
- SN 規則：無 SN；沿用 `single_sn` 生成/匯出流程，但不實際輸出 SN 欄
- 匯出：單 sheet（`HEX`），欄位順序 `Model / PN / EAN Code / PCBA`
- 匯出檔名：`[yyyymmdd]-[Model].xls`
- 歷史 key：`sn_history` 與 `generation_history` 皆以 `Model` 為主鍵語意
- 範圍限制：以上規則僅適用 `hmg`，不套用於 `yingbang/lunfei/bng/chg/clg`

---

## 8. Parse Rules

- `arrow`：欄位含 `->` / `→` / `>` 時取最後段值
- `trim`：字串修剪

各客戶目前設定：
- 營邦：`arrow`
- 倫飛：`arrow`
- 超恩：`trim`
- KOYA：`trim`
- Cubepilot：`trim`
- 赫星：`none`（不套用 `arrow`）

---

## 9. Deployment Modes

### 9.1 Docker Compose（現有檔案已提供）
- `api`（FastAPI）
- `nginx`（靜態 + 反代）
- 對外埠：`8080`

### 9.2 Linux Bare Metal（可行）
- systemd 啟動 Uvicorn（127.0.0.1:8000）
- Nginx 服務靜態檔並代理 `/api/*` 到 Uvicorn
- 需考慮 SELinux + firewall 設定

---

## 10. Key Architectural Decisions

### ADR-001: 前端改為 API-first（已落地）
- Excel parse / SN generate / export / history 全部後端化
- 降低前端業務邏輯負擔，利於後續擴充與一致性控管

### ADR-002: 歷史持久化採 SQLite（已落地）
- 取代瀏覽器 localStorage 作為主儲存
- 同機部署下可持續追蹤與重置歷史

### ADR-003: 共用上傳檔一次解析四客戶（已落地）
- 上傳一次即可切換客戶查詢
- 降低現場操作步驟與重複上傳成本

### ADR-004: 客戶歷史 key 語意化（已落地）
- 營邦以工單、超恩以 MO、倫飛維持週別 key、KOYA 維持工單、Cubepilot 以機種名
- 歷史面板欄位命名與現場語意一致

### ADR-005: 預覽附加內容改為「可配置 + 可編輯頁籤」模型（已落地）
- 取消頁籤列右側固定備註區，改為可新增的自訂附加頁籤
- 固定頁籤由 `CUSTOMERS.previewCustomTabs` 定義，動態頁籤由使用者在 UI 新增
- 動態頁籤內容在頁籤內容區直接編輯並儲存到 localStorage，降低現場調整成本

### ADR-006: Excel 解析雙格式（`.xls` + `.xlsx`）並存（已落地）
- 現場來源檔仍存在 `.xls`，單純限制 `.xlsx` 會增加人工轉檔成本
- 解析層改為依檔案內容與副檔名自動嘗試兩種 reader
- 無法解析時統一回傳 `INVALID_EXCEL_FILE`（4xx），避免落入 500

### ADR-007: Excel 上傳持久化（已落地）
- 為改善現場操作體驗，避免重整頁面後資料消失。
- 後端負擔解析與存檔職責，前端僅負責觸發與渲染。
- 存檔分類化處理，平衡共用檔案與獨立檔案的需求。

### ADR-008: 首頁查詢操作列精簡化（已落地）
- 既有多客戶流程中，歷史/搜尋/匯出入口分散，現場切換時辨識成本高。
- 將入口統一為單列布局，保留原本事件 ID 與流程，避免行為回歸風險。
- Cubepilot 設定改為入口式展開，維持功能完整並降低畫面密度。

### ADR-009: 首頁收斂為單一操作區（已落地）
- 現場操作希望「一進首頁就能查工單與赫星機種」，避免先理解多客戶分頁。
- 首頁視圖只保留核心入口；搜尋結果再映射至既有營邦/赫星流程。
- 保留既有多客戶流程作為底層能力，降低大改版風險與回歸成本。

### ADR-010: 首頁升級為全客戶聚合搜尋（已落地）
- 現場需求改為單一搜尋欄可直查所有客戶工單，加上赫星與 Cubepilot 機種。
- 聚合搜尋僅負責命中判斷與分流；各客戶預覽/匯出/歷史仍走原本邏輯，避免重複實作。
- 命中優先序以工單類客戶優先，再機種類客戶，並保留當前命中客戶的連續操作體驗。

### ADR-011: 首頁 BNG 收據入口顯式化（已落地）
- 超恩（BNG）有獨立收據列印流程，若只藏在客戶頁會增加首頁模式操作成本。
- 首頁新增 BNG 專屬收據按鈕，但僅在命中 BNG 工單時啟用，避免誤觸與跨客戶混用。
- 按鈕只做入口層分流，列印模板與商業邏輯維持既有 BNG 模組。

### ADR-012: 首頁聚合搜尋改為客戶上下文無關匹配（已落地）
- 工單與機種在跨客戶下皆採唯一編碼，首頁聚合搜尋必須可直接全域命中。
- 既有 `resolveColumnKey + CONFIG.COLUMNS` 會受 active customer 影響，導致跨客戶查詢漏判。
- 聚合層改為依目標客戶 profile 解析欄位（`columns + columnAliases`），再分流回既有客戶查詢流程。

### ADR-013: 首頁搜尋改為「顯式類型篩選」分流（已落地）
- 單欄混搜會在工單與機種皆有部分命中時造成誤導或選錯客戶流程。
- 首頁新增搜尋類型切換：`工單/MO`、`機種 Model`。
- 聚合比對與分流都必須受此模式限制，只在對應客戶集合內判斷命中。

### ADR-014: 首頁命中結果導入客戶色彩主題（已落地）
- 首頁單一入口模式下，使用者需要快速辨識當前命中客戶，避免在匯出/收據操作前誤判。
- 採用客戶色彩主題套用於首頁狀態列與預覽窗格邊框，不改動底層搜尋與匯出邏輯。
- 色彩規格：營邦深藍、倫飛綠、超恩紫、KOYA橘；其他客戶維持中性樣式。

### ADR-015: 序號生成設定入口通用化與預覽區收斂（已落地）
- 首頁模式下，序號設定並非 Cubepilot 專屬，命名需改為通用「序號生成設定」。
- 既有預估序號預覽掛在客戶預覽窗格，使用者在設定序號時視線切換成本高。
- 預估序號預覽改為固定內嵌在設定卡片內，與參數輸入區同區呈現。

### ADR-016: 機種聚合搜尋改為上下文無關欄位比對（已落地）
- 首頁機種模式需全域命中 `hmg/clg`，不得受目前客戶頁籤影響。
- 若 `MODEL` 欄位解析依賴 active customer，會導致「有資料但查不到」。
- 機種比對與取值改為指定客戶 profile 欄位解析，與工單模式保持一致。

### ADR-017: 首頁機種多筆命中改為就地可選（已落地）
- 首頁視圖下舊的 hmg/clg 提示清單位於 legacy 區，使用者不可見，導致多筆命中時無法完成選擇。
- 當機種模式命中多筆且無唯一精確值時，首頁預覽窗格直接渲染候選按鈕。
- 點選候選會回填搜尋欄並重跑首頁查詢，走既有精確命中與分流流程。

### ADR-018: 首頁命中成功訊息視覺強化（已落地）
- 命中結果是首頁核心回饋，與一般狀態提示需有明確視覺層級差異。
- 新增 success 狀態 class，僅套用在「已命中」相關訊息。
- success 樣式放大字級並提高字重，不改動 error/loading 語意。

### ADR-019: 序號設定新增整串純文字複製（已落地）
- 現場常需把整批序號貼到外部系統，逐筆複製效率低。
- 在序號設定預覽區新增「複製整串序號（純文字）」按鈕。
- 點擊後依目前設定即時計算序號，並以 `\\n` 分行寫入剪貼簿。

### ADR-020: 序號設定複製入口參數兼容（已落地）
- 序號生成共用函式存在 `count` 與 `countText` 兩種來源欄位。
- 複製整串按鈕若只傳 `countText`，會被誤判為無效數量。
- 生成函式改為同時兼容 `count` 與 `countText`，避免同類回歸。

### ADR-021: 移除未使用前端相容模組（已落地）
- 既有 `sourceBinding/storage/customerEngine` 為舊前端本機流程遺留，已不在現行 API-first 路徑中被引用。
- 這些模組保留會提高維護噪音，並造成「看似可用但實際未走到」的誤解。
- 移除未使用模組，並將 `excel.js` 收斂為現行流程實際使用的工具函式集合。

### ADR-022: 移除無引用 UI 匯出包裝函式（已落地）
- `renderSerialHistoryTable()` 僅為 `renderSerialHistoryTableIn()` 的包裝，且已無任何呼叫點。
- 保留無引用包裝函式會增加 API 表面積與維護負擔。
- 刪除無引用匯出，統一使用 `renderSerialHistoryTableIn()`。

### ADR-023: app.js 分層拆檔（第一階段）（已落地）
- `app.js` 同時承擔首頁編排、客戶流程、序號規則、列印模板，維護成本過高。
- 第一階段先抽離「序號設定運算」與「BNG 收據模板」成獨立模組，維持行為不變。
- `app.js` 保留流程編排與事件入口，細節計算交由模組處理。

### ADR-024: ui.js 依職責拆分（已落地）
- `ui.js` 同時包含渲染、剪貼簿、歷史表格邏輯，單檔過大且難以維護。
- 拆分為 `uiClipboard.js`（複製與綁定）與 `uiHistory.js`（歷史表格與重置綁定）。
- `ui.js` 改為聚合入口，對外 export 介面保持相容，降低回歸風險。

### ADR-025: ui.js 二階段拆分（預覽渲染獨立模組）（已落地）
- `ui.js` 在第一階段後仍承載大量客戶預覽渲染函式，檔案仍過大。
- 將各客戶 `render*Search*` 與預覽共用 helper 抽離至 `uiPreviewRenderers.js`。
- `ui.js` 只保留狀態更新、事件綁定與聚合 re-export，`app.js` 匯入介面不變。

### ADR-026: app.js 二階段拆分（首頁聚合流程模組化）（已落地）
- `app.js` 持續承載首頁聚合搜尋、首頁歷史整合、首頁匯出/收據分流，責任過多。
- 把首頁流程抽離為獨立 controller 模組，主流程檔僅保留依賴注入與事件掛接。
- 以工廠函式注入既有查詢/匯出函式，避免更動既有業務流程與 UI 行為。

### ADR-027: 超恩預覽改為「檢查清單式 Copy Panel」（已落地）
- 超恩預覽主要使用情境是檢查與複製，不是表單輸入；既有密集框線與小按鈕造成視覺噪音。
- 改為分區卡片 + 清單列模式，將複製操作集中於右側 icon，並提供整區「全部複製」。
- 增加重要數值欄位狀態提示與等寬字體，降低現場人工比對錯誤率。

### ADR-028: KOYA 預覽對齊 Copy Panel 操作模型（已落地）
- KOYA 預覽與超恩同屬「檢查 + 複製」場景，操作模型應一致以降低學習成本。
- 將 KOYA 預覽分區改為與超恩一致的清單列 + 區塊複製模式。
- 保留 KOYA 既有欄位語意（PN/小張貼紙/滿箱數量/需求/尾數數量），只調整呈現與複製交互。

---

## 11. Version History

- **0.2.x**：前端多客戶架構 + FastAPI 化（T20~T26）
- **0.3.0**（2026-03-12）：
  - 文件全面對齊現況（API + SQLite + Nginx）
  - 補充「一次上傳共用 Excel」流程
  - 更新歷史 key 規則（營邦=工單、超恩=MO）
  - 明確化歷史欄位顯示來源（`last_serial`）
- **0.3.1**（2026-03-13）：
  - 超恩 `SN` sheet 改為 `uuid1/uuid2` 拆欄與 `機種名稱` 欄位
  - UUID 拆分規則明確化為 `前15碼 + 後17個F`
  - 新增四客戶預覽備註槽，改由 `CUSTOMERS.previewNote` / `previewNoteHtml` 驅動
- **0.3.2**（2026-03-16）：
  - 新增超恩收據套印列印流程（查詢後可直接列印）
  - 收據欄位映射與 `機種名稱 " 1."` 前後拆分規則文件化
  - 收據列印版型尺寸調整為約 A4 直向高度的 1/5，標題欄位採淺灰底
- **0.3.3**（2026-03-16）：
  - 預覽區由「右側備註槽」改為「可新增自訂頁籤」模型
  - 新增 `+ 新增頁籤` 操作，頁籤名稱可自定義，並可單頁籤移除
  - 自訂頁籤內容改為在內容區直接編輯，失焦自動儲存到 localStorage（`sn_preview_custom_tabs`）
- **0.3.4**（2026-03-17）：
  - 新增 Cubepilot 客戶（`clg`）規格與流程
  - 補充 `機種名 contains` 查詢與單筆選擇規則
  - 補充手動序號生成規格（前綴/起始/數量/後綴/進制）
  - 歷史 key 規則新增 `clg=機種名`，`generation_history` 對 clg 不使用
- **0.3.5**（2026-03-17）：
  - `POST /api/excel/parse` 新增 `.xls` 原生支援（保留 `.xlsx`）
  - Backend Excel stack 明確為 `openpyxl + xlrd`
  - 不可解析檔案錯誤訊息改為「請確認為有效的 `.xls` 或 `.xlsx`」
- **0.3.6**（2026-03-17）：
  - Cubepilot 匯出 sheet 名稱固定為 `MES`
  - Cubepilot 查詢改為「關鍵字提示 + 可點選清單」，移除 prompt 強制選擇
  - Cubepilot 預覽空值欄位自動隱藏
  - Cubepilot 序號設定欄位調整為「數量在最後」
- **0.3.7**（2026-03-17）：
  - Cubepilot 生成後預覽新增「前 10 筆 / 後 10 筆」序號區段
  - 預覽顯示最近一次生成結果，便於現場快速抽查
- **0.3.8**（2026-03-17）：
  - Cubepilot 序號區段預覽時機改為「生成前即時預覽」
  - 序號設定欄位變更時即時更新前 10 / 後 10 筆
- **0.3.9**（2026-03-17）：
  - Cubepilot 新增 `0–6 循環進位制`（`x6 -> 下一段 x0`）
  - 生成與生成前預覽同步支援新進制
- **0.3.10**（2026-03-17）：
  - Cubepilot 新增 `1–6 循環進位制`（`x6 -> 下一段 x1`）
  - 生成與生成前預覽同步支援新進制
- **0.3.11**（2026-03-17）：
  - Cubepilot 支援「無 Excel 直出」模式（上傳檔案改為選填）
  - 生成按鈕改為依序號設定有效性啟用，無需先查詢機種
- **0.3.12**（2026-03-18）：
  - 新增赫星（`hmg`）架構規格（Sheet1/Model 查詢/無 SN/HEX 匯出）
  - 明確化赫星歷史 key（`sn_history`/`generation_history` 皆為 Model）
  - 新增客戶規則隔離原則：`hmg` 規格不得影響既有客戶
- **0.3.13**（2026-03-18）：
  - T42 落地：新增 `hmg` 前後端流程（解析/查詢提示/HEX 匯出/歷史）
  - `hmg` 匯出模板固定 `HEX` sheet，欄位 `Model/PN/EAN Code/PCBA`
  - 整合測試腳本新增赫星案例（T27-05）
- **0.3.14**（2026-05-01）：
  - 首頁查詢區改為一致化操作列（歷史 / 搜尋 / 匯出）
  - Cubepilot 新增「序號生成設定」入口式展開/收合
  - 文件同步 `PROCESS.md` 新流程與現行前端 UI 入口
- **0.3.15**（2026-05-01）：
  - 首頁改為單一操作區，支援「工單 + 赫星機種」共用搜尋
  - 首頁只保留核心入口（歷史/搜尋/匯出 + Cubepilot 設定入口）
  - 多客戶 workspace 退居相容層，不作為首頁主視圖
- **0.3.16**（2026-05-01）：
  - 首頁搜尋升級為全客戶聚合（工單/MO + hmg/clg 機種）
  - 首頁歷史與匯出改為跟隨命中客戶分流
  - 補充聚合搜尋架構決策（ADR-010）
- **0.3.17**（2026-05-01）：
  - 首頁新增「產生收據（BNG）」入口，位置在「生成序號&匯出」旁
  - 按鈕僅在命中 BNG 工單時啟用
  - 補充首頁 BNG 收據入口決策（ADR-011）
- **0.3.18**（2026-05-01）：
  - 修正首頁聚合搜尋「跨客戶工單查不到」問題
  - 聚合比對改為客戶獨立欄位解析（不再依賴 active customer）
  - 補充客戶上下文無關搜尋決策（ADR-012）
- **0.3.19**（2026-05-01）：
  - 首頁新增搜尋類型篩選（工單/MO、機種 Model）
  - 聚合搜尋依模式分流，避免工單與機種混搜誤命中
  - 補充顯式類型篩選架構決策（ADR-013）
- **0.3.20**（2026-05-01）：
  - 首頁命中結果新增客戶色彩區分（營邦/倫飛/超恩/KOYA）
  - 色彩主題套用至首頁狀態列與預覽窗格邊框
  - 補充首頁色彩主題架構決策（ADR-014）
- **0.3.21**（2026-05-01）：
  - 序號生成設定文案移除「Cubepilot」限定詞，改為通用入口
  - 預估生成序號預覽改為內嵌在序號生成設定卡片
  - 補充設定入口通用化與預覽收斂決策（ADR-015）
- **0.3.22**（2026-05-01）：
  - 修正首頁機種模式（hmg/clg）查不到資料問題
  - 機種比對改為客戶獨立欄位解析（不受 active customer 影響）
  - 補充機種聚合搜尋決策（ADR-016）
- **0.3.23**（2026-05-01）：
  - 修正首頁機種模式多筆命中時無法選擇問題
  - 首頁預覽窗格新增機種候選清單（可直接點選）
  - 補充機種多筆命中就地可選決策（ADR-017）
- **0.3.24**（2026-05-01）：
  - 首頁「已命中」狀態訊息樣式放大
  - 命中成功訊息新增 success 樣式
  - 補充命中成功訊息視覺強化決策（ADR-018）
- **0.3.25**（2026-05-01）：
  - 序號生成設定新增「複製整串序號（純文字）」按鈕
  - 依目前設定生成整批序號並一次複製到剪貼簿
  - 補充整串純文字複製決策（ADR-019）
- **0.3.26**（2026-05-01）：
  - 修正整串序號複製時「生成數量不正確」誤判
  - 序號生成函式改為兼容 `count` / `countText`
  - 補充參數兼容決策（ADR-020）
- **0.3.27**（2026-05-01）：
  - 移除未使用前端相容模組（`sourceBinding/storage/customerEngine`）
  - `excel.js` 收斂為現行流程使用函式，刪除舊前端匯出/讀檔遺留
  - 補充冗餘移除決策（ADR-021）
- **0.3.28**（2026-05-01）：
  - 移除未使用 UI 匯出包裝函式 `renderSerialHistoryTable()`
  - 統一走 `renderSerialHistoryTableIn()` 呼叫路徑
  - 補充 UI 無引用匯出清理決策（ADR-022）
- **0.3.29**（2026-05-01）：
  - `app.js` 拆檔第一階段：抽離 `serialSettings`、`bngReceipt` 模組
  - 序號設定運算與收據模板從主流程檔移出
  - 補充分層拆檔決策（ADR-024）
- **0.3.30**（2026-05-01）： 
  - `ui.js` 拆分為 `uiClipboard.js` 與 `uiHistory.js`
  - `ui.js` 改為聚合入口，保留既有 export 介面
  - 補充 UI 職責拆分決策（ADR-025）
- **0.3.31**（2026-05-01）：
  - `ui.js` 二階段拆分：抽離客戶預覽渲染到 `uiPreviewRenderers.js`
  - `ui.js` 縮減為通用綁定與聚合出口
  - 補充預覽渲染拆分決策（ADR-026）
- **0.3.32**（2026-05-01）：
  - `app.js` 二階段拆分：首頁聚合流程抽離為 `homeController.js`
  - 新增 `customerColumns.js` 共用客戶欄位解析與取值
  - 主流程檔保留依賴注入與事件掛接，降低單檔複雜度
- **0.3.33**（2026-05-11）：
  - 超恩（BNG）新增 `來源` 欄位映射（拆分標記）
  - 預覽窗格標題區新增條件標示：`來源` 有值才顯示
- **0.3.34**（2026-05-11）：
  - KOYA（CHG）新增 `工單月份` 欄位映射
  - 預覽窗格副標題新增 `工單月份` 條件顯示（空值隱藏）
- **0.3.35**（2026-05-11）：
  - 超恩（BNG）預覽窗格改為「檢查清單式 Copy Panel」
  - 分區支援「全部複製」、單列 icon 複製與複製成功回饋
  - 重要數值欄位新增檢查狀態，序號類值改為等寬字體
- **0.3.36**（2026-05-11）：
  - KOYA（CHG）預覽窗格改為「檢查清單式 Copy Panel」
  - Label / Box Label 分區新增「全部複製」與單列複製回饋
  - 預覽操作模型對齊超恩，降低跨客戶操作切換成本

---

*This document reflects the current implementation state.*
