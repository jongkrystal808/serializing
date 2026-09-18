# SN-GENERATOR (序號產生器) 系統架構設計文件

**Version:** 0.3.79
**Last Updated:** 2026-09-18

## 1. 系統架構總覽 (Architecture Overview)

系統採用「Frontend Static Page + Backend API + SQLite」的分層式架構設計 (Layered Architecture)：

- **資料流向**: Browser (index.html + js/* + styles/*) -> /api/* (Nginx reverse proxy) -> FastAPI (backend/app/*) -> SQLite (backend/data/sn_generator.db)
- **核心設計**:
  - 單一首頁 (Single Homepage) 整合原六客戶的聚合查詢，另提供 DEG 獨立生成面板。
  - 客戶無關的欄位解析 (Customer-independent field parsing)。
  - API-First 開發方法，確保前後端職責分離。
- **客戶分類**:
  - 4 個共用 Excel 客戶 (Shared Excel): yingbang, lunfei, bng, chg
  - 2 個 Excel 獨立客戶 (Independent): hmg, clg
  - 1 個手動編碼客戶：deg（泉影），不使用 Excel 來源

## 2. 技術堆疊 (Technology Stack)

### 前端 (Frontend)
- **架構**: Vanilla HTML + JS (ES Modules)
- **樣式**: CSS (`styles/main.css` + `styles/toast.css`)
- **API 通訊**: `fetch` API
- **檔案處理**: Blob downloads

### 後端 (Backend)
- **框架**: FastAPI + Uvicorn
- **資料驗證**: Pydantic v2
- **Excel 處理**: `openpyxl` (.xlsx), `xlrd` (.xls)
- **資料庫**: SQLite

### 基礎設施 (Infra)
- **網頁伺服器與反向代理**: Nginx (負責 Static pages 服務與 `/api/` 反向代理)
- **容器化**: Docker Compose
- **部署選項**: 支援容器化與 Linux 實體機 (Bare metal) 部署

## 3. 專案目錄結構 (Project Structure)

```text
SN-GENERATOR/
├── index.html
├── styles/
│   ├── main.css
│   └── toast.css (global success/error/info notifications)
├── js/
│   ├── app.js (main coordinator for customer search and export flows)
│   ├── config.js (customer config reader, CONFIG dynamic getter)
│   ├── state.js (global state + DOM refs cache)
│   └── modules/
│       ├── api.js (Backend REST API wrappers)
│       ├── bngReceipt.js (BNG receipt print payload & template)
│       ├── customerColumns.js (customer field resolver with aliases)
│       ├── customers.js (validated customer registry + centralized customer keys)
│       ├── dom.js (controlled DocumentFragment template replacement boundary)
│       ├── excel.js (week calc, SN prefix, BNG range expand, CHG bundle)
│       ├── homeController.js (home aggregated + custom-source search controller)
│       ├── masterDataMaintenance.js (KOYA/NYX models + monthly references)
│       ├── sourceMaintenance.js (source CRUD, preview + refresh polling)
│       ├── sourceSearch.js / sourceRulesEditor.js / sourcePreview.js
│       ├── deg.js / fzgSerial.js / vecowLink.js
│       ├── previewCustomTabs.js (custom-tab persistence, migration and CRUD controller)
│       ├── serialSettings.js (CLG custom base serial calc)
│       ├── storage.js (observable localStorage read/write + JSON helpers)
│       ├── toast.js (global Toast lifecycle and accessible status/alert roles)
│       ├── ui.js (UI aggregation entry, re-exports clipboard/history/renderers)
│       ├── uiClipboard.js (clipboard copy + cell/button bindings)
│       ├── uiHistory.js (history table render + reset bindings)
│       ├── uiPreviewRenderers.js (customer + BNG-style generic-source renderers)
│       ├── utils.js (text normalize, HTML escape, arrow parse, range normalize)
│       └── workOrder.js (work order tokenization, qty resolution, field search)
├── backend/
│   ├── app/
│   │   ├── main.py (FastAPI app, CORS, exception handlers, router mounts)
│   │   ├── core/ (config, customers, dependencies, logging, errors, request_limits, responses)
│   │   ├── routers/ (health, excel, sn, export, history, print_notice, koya_model, nyx_model, monthly_reference, shipment_refresh, shipment_source, vecow_link)
│   │   ├── schemas/ (typed requests/responses for all JSON routes)
│   │   ├── services/ (Excel, SN, DEG/FZG, history, models, refresh and sources)
│   │   └── tools/ (shipment merge/check, rules, advanced, mail, presets, migration)
│   ├── data/sn_generator.db
│   ├── requirements.txt
│   └── Dockerfile
├── deploy/ (nginx, systemd, shipment-release.json)
├── docker-compose.yml
└── doc/ (this documentation folder)
```

## 4. 後端 API 設計 (Backend API Design)

目前實作 32 組 Method／Path（月份 customer 僅接受 koya／nyx）：

| Method | Path | Purpose | Request | Response |
|--------|------|---------|---------|----------|
| GET | `/api/health` | Health check | - | JSON |
| POST | `/api/excel/parse` | 解析上傳的 Excel 檔案 | Multipart Form Data | JSON (Parsed Data) |
| GET | `/api/excel/load-default` | 載入客戶預設 Excel 檔案 | Query: `customer=` | JSON (Parsed Data) |
| POST | `/api/sn/generate` | 產生 SN 序號 | JSON (Generate payload) | JSON (Generated SNs) |
| POST | `/api/export` | 匯出 Excel 或文字檔 | JSON (Export options) | StreamingResponse (Blob) |
| GET | `/api/history/{customer}` | 取得指定客戶歷史紀錄 | Path: `customer` | JSON (History Data) |
| POST | `/api/history/upsert` | 新增/更新歷史紀錄 | JSON (History payload) | JSON (Success status) |
| POST | `/api/history/reset` | 重置指定條件的歷史紀錄 | JSON (Reset criteria) | JSON (Success status) |
| GET | `/api/print-notice` | 取得列印通知設定 | - | JSON (Print notices) |
| POST | `/api/print-notice/upsert` | 新增/更新列印通知 | JSON (Print notice payload) | JSON (Success status) |
| DELETE | `/api/print-notice` | 刪除列印通知 | JSON (Delete payload) | JSON (Success status) |
| GET | `/api/koya-model` | 取得 KOYA 型號主檔 | - | JSON (Model entries) |
| POST | `/api/koya-model/upsert` | 新增或修改 KOYA 型號 | JSON (`original_model / model / pn / full_pn`) | JSON (Saved entry) |
| DELETE | `/api/koya-model` | 刪除 KOYA 型號 | JSON (`model`) | JSON (Success status) |
| GET | `/api/nyx-model` | 取得 NYX 型號主檔 | - | JSON (Model entries) |
| POST | `/api/nyx-model/upsert` | 新增或修改 NYX 型號 | JSON (`original_model / model / pn`) | JSON (Saved entry) |
| DELETE | `/api/nyx-model` | 刪除 NYX 型號 | JSON (`model`) | JSON (Success status) |
| GET | `/api/monthly-reference/{customer}` | 取得 KOYA PO 或 NYX LOT 月份對照 | - | JSON (Month entries) |
| POST | `/api/monthly-reference/{customer}/upsert` | 新增或修改月份對照 | JSON (`original_month / month / value`) | JSON (Saved entry) |
| DELETE | `/api/monthly-reference/{customer}` | 刪除月份對照 | JSON (`month`) | JSON (Success status) |

| GET | `/api/shipment-refresh` | 查詢更新狀態及最後更新時間 | - | JSON (ShipmentRefreshJob) |
| POST | `/api/shipment-refresh/run` | 啟動背景總表更新 | - | JSON (ShipmentRefreshJob) |
| GET | `/api/shipment-sources` | 查詢九個資料來源設定 | - | JSON (entries) |
| PUT | `/api/shipment-sources/{source_key}` | 儲存來源設定 | JSON (`path / sheet_rule / file_rule / recent_files`) | JSON (Saved entry) |
| POST | `/api/shipment-sources/{source_key}/reset` | 恢復來源預設設定 | - | JSON (Saved entry) |

| GET | `/api/vecow-link` | 讀取超恩 BIOS/FW 分享網址 | - | JSON (url) |
| PUT | `/api/vecow-link` | 維護分享網址，空白移除 | JSON (`url`) | JSON (url) |

| POST | `/api/shipment-sources/preview` | 以未保存規則預覽來源 | Source create payload | JSON (diagnostic report) |
| POST | `/api/shipment-sources` | 新增自訂來源 | Source create payload | JSON (Saved entry) |
| GET | `/api/excel/load-source` | 載入總表中的通用來源（自訂來源／富弘年） | Query: `source_key=` | JSON (Parsed Data) |
| GET | `/api/sn/fzg/status` | 查詢勤誠序號狀態 | - | JSON (next / remaining) |
| POST | `/api/sn/fzg/reset` | 重設勤誠客序或 MAC | JSON (`kind / start_hex`) | JSON (status) |

## 5. 資料庫綱要 (Database Schema)

底層採用 SQLite，包含 8 個主要資料表：

1. **`serial_history`**: 記錄序號使用歷史，Composite PK 為 `(customer, history_key)`。資料庫啟用 WAL；寫入以 `BEGIN IMMEDIATE` 開始交易，流水號區間再透過 SQLite `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` 原子保留。倫飛的流水號與生成紀錄皆使用解析後的 `week_key`，可跨 Thread／多 Worker 避免重複派號及歷史 key 脫節。
2. **`generation_history`**: 記錄每一次序號產生的操作紀錄，包含 `id` (autoincrement PK)。
3. **`print_notice`**: 記錄與列印通知相關的設定與數值，Composite PK 為 `(customer, workorder_value)`。
4. **`koya_model`**: 取代 `KOYA_model.xlsx` 的系統主檔，以不分大小寫的 `model` 為 PK，保存 `pn / full_pn / updated_at`。僅首次建表時寫入 `CHG021-XXXX`～`CHG025-XXXX` 五筆族群規則；舊完整 Model 初始鍵會自動遷移，使用者後續刪改不會在重啟時被重新建立。既有資料庫中的舊 `po` 欄僅保留做相容，不再對外使用。
5. **`nyx_model`**: NYX 系統主檔，以不分大小寫的 `model` 為 PK，保存 `pn / updated_at`。僅首次建表時寫入 `CZG201-XXXX`～`CZG206-XXXX` 六筆族群規則；既有資料庫中的舊 `lot` 欄僅保留做相容，不再對外使用。
6. **`monthly_reference`**: KOYA／NYX 共用月份對照表，以 `customer + month` 為複合 PK，KOYA 的 `value` 表示 PO、NYX 表示 LOT。月份源自共用 Excel「KOYA出貨」；只補新增月份，避免覆蓋人工編輯值。

7. **`shipment_source_config`**: 以 `source_key` 為 PK，保存 `path / sheet_rule / file_rule / recent_files / updated_at`；初始化以 `INSERT OR IGNORE` 建立九個來源，不覆寫已儲存的設定。

8. **`vecow_link`**: 單列共用分享網址，`id=1`，未設定時無資料，與 BIOS 來源檔設定獨立。

## 6. 前端執行期流程 (Frontend Runtime Flow)

前端應用依循以下主要執行流程：

- **Excel 上傳機制**:
  - 支援 4 家客戶 (yingbang, lunfei, bng, chg) 共同上傳解析機制。
  - 獨立客戶 (hmg, clg) 採各自專屬的上傳及解析通道。
- **首頁整合查詢 (Home Aggregated Search)**: 支援工單 (Work Order/MO) 及機種 (Model) 兩種查詢模式。
- **KOYA 型號主檔**: 首頁可展開維護面板執行 CRUD；載入 KOYA 出貨列後以 `Model` 不分大小寫比對完整值，或以尾碼 `XXXX` 表示前綴族群（例如 `CHG022-XXXX` 對應 `CHG022-004G`），主檔覆蓋出貨列的 `PN / full PN`，PO 則依工單月份套用 `monthly_reference`。
- **NYX 型號主檔**: 首頁可展開維護面板執行 `Model / PN` CRUD；同面板的月份表會從「KOYA出貨」補齊月份，LOT 初值留空供手動編輯。現有出貨總表沒有 NYX/CZG 資料或 NYX 工作表，因此暫不接入查詢與匯出流程。
- **查詢與產生 (Search & Generate)**: 解析後，於預覽面板確認資料，執行 SN 產生邏輯。倫飛或 BNG 的 MO 恰好命中 2 筆時，必須彈出警示並顯示兩張可切換的資料預覽；目前選取列寫入 `state.currentRow`，後續生成、匯出與 BNG 收據皆使用該列。
- **歷史面板 (History Panel)**: 即時顯示對應客戶的 `history_key` 目前序號發放狀態，支援重置。
- **客製化頁籤 (Custom Tabs)**: 透過 Config 提供不同客戶獨立頁籤與操作流程。使用者建立的內容僅以結構化純文字存入 `sn_preview_custom_tabs`；舊版 HTML 載入時轉為純文字並覆寫，貼上與拖放也不得插入可執行 HTML。
- **列印支援 (BNG Receipt Printing)**: 提供特定客戶 (BNG) 標籤列印預覽及產出機制。
- **UI 主題顏色**: 依照選擇的客戶載入對應之 Theme Colors。
- **互動回饋**: 搜尋、匯出與複製保留 inline status，並以 Toast 提供主要全域通知；非同步按鈕套用 `btn-loading` 與 `aria-busy` 防止重複操作。
- **導覽與快捷鍵**: 首頁搜尋成功後捲至預覽，匯出後捲回狀態列；搜尋框支援 Enter 查詢、`Ctrl+Enter` 匯出，`Escape` 收合序號設定。
- **動態效果與可及性**: 展開面板、focus、hover、active 與 copied pulse 使用短時 CSS transition；`prefers-reduced-motion` 會停用非必要動畫與平滑捲動。

## 7. 客戶業務規則 (Customer Rules)

後端支援七個 customer；以下先列原六客戶，DEG 規格與獨立操作見後文：

| 客戶 (Customer) | 查詢欄位 (Query Field) | 序號產生依據 (Generation Key) | 歷史紀錄鍵值 (Record Key) | 歷史首欄 (History First Col) | SN 格式 (SN Format) | 匯出格式 (Export Format) |
|-----------------|------------------------|-------------------------------|---------------------------|------------------------------|---------------------|--------------------------|
| **yingbang** | 工單 | `{po}1{4-digit serial}` | 工單 | 工單 | 單一 Sheet (SN, Datecode, PN) | Excel (單表) |
| **lunfei** | MO | `106{WW}62{5-digit serial}` | YYYY-Www | Week | 雙表 (SN + BOX) | Excel (雙表) |
| **bng** | 工單 (MO) | MAC/SN/UUID Range Expand | MO Number | MO Number | 雙表 (SN + BOX), 列印收據 | Excel (雙表) |
| **chg** | 工單 | Label repeat by qty | 工單 | 工單 | 雙表 (SN + BOX) | Excel (雙表) |
| **hmg** | Model | 無 SN (No SN) | Model | Model | HEX sheet (Model/PN/EAN/PCBA) | Excel (HEX 表) |
| **clg** | 機種名（可無 Excel 直出） | Manual base serial (10/16/cycle)| 機種名／直出設定 key | 機種名 | MES sheet (SN only) | 文字檔 / Excel |

### 7.1 MO 重複命中選取規則

- 適用範圍：以 `MO` 查詢的倫飛（`lunfei`）與超恩（`bng`），包含首頁聚合入口及客戶工作區。
- 觸發條件：查詢結果恰好為 2 筆；0、1 或 3 筆以上維持既有流程。
- UI 回饋：先顯示瀏覽器警示；狀態列與預覽提示使用紅色粗體，且不得被首頁客戶主題色覆蓋。
- 預覽與選取：同時呈現兩張摘要預覽卡，標示第 1／2 筆及目前選擇；點擊後重新渲染該筆完整預覽。
- 操作一致性：選取索引保存於前端狀態，重新渲染或匯出後仍保留；生成、匯出及 BNG 收據一律讀取目前選取的 `state.currentRow`。
- 首頁同步：首頁的預覽為客戶預覽 DOM clone；在首頁切換資料時，必須同步底層客戶面板、首頁面板及首頁狀態訊息。

## 8. 內容解析規則 (Parse Rules)

系統依照欄位特徵配置不同解析策略 (Parser)：
- **`arrow`**: 解析以箭頭符號 (例如 `->`, `=>`) 分隔的起訖範圍 (多用於 bng 的 MAC/SN/UUID 區間解析)。
- **`trim`**: 預設清理頭尾空白與不可見字元，普遍應用於 yingbang, lunfei, chg。
- **`none`**: 保留原始內容，不進行任何字串操作 (少數特定欄位)。

## 9. 系統部署 (Deployment)

系統支援彈性的部署策略：
- **Docker Compose**: 使用 `docker-compose.yml` 同時部署 Nginx (負責反向代理與靜態檔) 與 FastAPI (負責 API 邏輯)，預設映射 Port `8080`。
- **Linux 實體機 (Bare Metal)**: 亦支援於 Linux 原生環境直接利用 Uvicorn/Gunicorn 及本機 Nginx 服務直接啟動。
- **CORS**: 啟用 credentials 時只接受 `CORS_ALLOWED_ORIGINS` 明確列出的來源；預設為 `http://localhost:8080,http://127.0.0.1:8080`，設定值若包含 `*` 會在啟動時拒絕載入。
- **路由執行模型**: 會呼叫 Excel parser、SQLite、檔案系統或同步匯出的 handler 使用普通 `def`，由 FastAPI/Starlette 放入 Thread Pool；純記憶體 `/api/health` 保留 `async def`，避免被繁忙 worker thread 拖慢。
- **Excel 上傳防護**: `/api/excel/parse` 以 ASGI middleware 限制整體 request body，路由再以實際讀取量限制檔案為 20 MiB；XLSX 在交給 openpyxl 前另限制 ZIP 解壓後總量為 100 MiB。兩項上限可由環境變數調整。
- **錯誤與下載標頭安全**: 未預期例外只在伺服器 logger 保留堆疊，對外固定回傳 `INTERNAL_ERROR`；下載檔名在組成 `Content-Disposition` 前移除 ASCII 控制字元、引號與反斜線。

## 10. 關鍵架構決策 (Key Architectural Decisions - ADR)

架構決策記錄目前狀態皆為「**已落地**」：

- ADR-001: 採用 FastAPI 作為後端框架 (已落地)
- ADR-002: 前端採用原生 JS ES Modules (已落地)
- ADR-003: 使用 SQLite 作為資料儲存方案 (已落地)
- ADR-004: Nginx 反向代理整合前後端路由 (已落地)
- ADR-005: 實作客戶無關的欄位動態解析器 (已落地)
- ADR-006: 導入 Pydantic v2 進行強型別資料驗證 (已落地)
- ADR-007: 共用客戶 (4家) 實作統一 Excel 上傳介面 (已落地)
- ADR-008: 前端實作整合型搜尋介面 (已落地)
- ADR-009: 支援工單與機種雙重查詢模式 (已落地)
- ADR-010: BNG 專屬 Range Expand 展開機制 (已落地)
- ADR-011: YINGBANG 自訂 4 位數序號前綴 (已落地)
- ADR-012: CLG 手動 Base Serial 進位計算邏輯 (已落地)
- ADR-013: 實作 SN 與 BOX 雙表匯出功能 (已落地)
- ADR-014: 支援 Excel `.xls` 及 `.xlsx` 格式相容 (已落地)
- ADR-015: HMG 無序號 HEX 格式專屬處理 (已落地)
- ADR-016: 前端狀態管理器 (Global State) 單例化 (已落地)
- ADR-017: 實作剪貼簿與 UI 連動機制 (已落地)
- ADR-018: API 統一回傳 `ApiResponse` 介面 (已落地)
- ADR-019: 採用 HTTP 狀態碼配合錯誤代碼列表 (已落地)
- ADR-020: 佈署環境變數整合與 `config.js` 對接 (已落地)
- ADR-021: 實作全域例外攔截器 (Exception Handler) (已落地)
- ADR-022: 前端引入模組化資料夾結構 (已落地)
- ADR-023: 歷史紀錄的 `history_key` 動態繫結機制 (已落地)
- ADR-024: 實作歷史紀錄強制重置 (Reset) 功能 (已落地)
- ADR-025: 提供 BNG 列印通知服務端點 (已落地)
- ADR-026: LUNFEI 動態週數 (WW) 計算機制 (已落地)
- ADR-027: CHG 依據數量進行 Label 重複產生 (已落地)
- ADR-028: 提供 Docker Compose 一鍵部署支援 (已落地)
- ADR-029: 序號派發採 SQLite 原子 UPSERT + RETURNING，取代先讀後寫的 TOCTOU 流程 (已落地)
- ADR-030: CORS credentials 僅允許明確來源，並禁止萬用來源設定 (已落地)
- ADR-031: 自訂頁籤採純文字持久化與渲染，舊 HTML 自動降級遷移 (已落地)
- ADR-032: 同步 I/O API handler 使用 FastAPI Thread Pool，health check 保持輕量 async (已落地)
- ADR-033: 自訂頁籤持久化、遷移與 CRUD 從 app.js 抽離為 previewCustomTabs controller (已落地)
- ADR-034: 大表格儲存格複製採預覽根節點事件委派，listener 數量固定為 O(1) (已落地)
- ADR-035: 未預期例外採對外固定訊息、對內 logger.exception 完整記錄 (已落地)
- ADR-036: Excel 上傳採 request body、實際檔案及 XLSX 解壓總量三層限制 (已落地)
- ADR-037: Content-Disposition 動態檔名先移除 ASCII 控制字元再編碼 (已落地)
- ADR-038: CSS 樣式鉤子採語意 class，DOM id 僅供 JavaScript 與可及性定位 (已落地)
- ADR-039: 六客戶首頁主題統一由 `--home-theme-accent` Custom Property 驅動 (已落地)
- ADR-040: 版面、間距與字級採 rem 相對單位，僅保留像素邊線與膠囊圓角 (已落地)
- ADR-041: `window.CUSTOMERS` 由 customers registry 單點驗證，功能模組不直接存取全域 (已落地)
- ADR-042: `createUiRefs()` 啟動時一次驗證必要 DOM 並列出缺件 (已落地)
- ADR-043: localStorage 透過 storage adapter 回報讀寫、配額與 JSON 解析錯誤 (已落地)
- ADR-044: 首頁客戶 key 集中於不可變 `CUSTOMER_KEYS` 與客戶順序常數 (已落地)
- ADR-045: BNG 機種備註以語意 regex 解析空白、全形標點並排除版本號 (已落地)
- ADR-046: HTML text 與 quoted attribute 採不同 encoder，禁止跨 script/style/URL 語境沿用 (已落地)
- ADR-047: 重複客戶預覽改用資料驅動 shell，模組模板集中經 DocumentFragment boundary 替換 (已落地)
- ADR-048: `app.js` 的動態模板一律經 `dom.js` 受控邊界替換；既有預覽同步以 DOM 節點 clone 取代 HTML 字串重解析 (已落地)
- ADR-049: MO 恰好命中兩筆時採雙預覽顯式選取，並由單一目前選取列驅動生成、匯出與收據流程 (已落地)
- ADR-050: 操作回饋採 inline status + accessible Toast 雙軌，loading、捲動、快捷鍵與 reduced-motion 由共用互動層協調 (已落地)
- ADR-051: SQLite 預設路徑由 `config.py` 位置解析為絕對路徑，`DB_PATH` 相對覆寫統一以 `backend/` 為基準 (已落地)

## 11. 錯誤處理 (Error Handling)

- **統一回傳格式**: 所有 API 錯誤皆封裝於統一的 `ApiResponse` 結構中。
- **全域攔截**: FastAPI 實作了全域例外攔截器 (Global Exception Handlers)，捕捉 Pydantic 驗證錯誤與自訂的業務邏輯錯誤。
- **資訊最小化**: 500 response 不包含 `str(exc)`、檔案路徑或資料庫資訊；完整例外與 traceback 僅記錄於伺服器端。
- **錯誤代碼**: 定義標準的 Error Codes 列表，方便前端根據特定錯誤碼進行對應的 UI 提示或重試機制。

## 2026-09-14 現況同步

- 出貨更新：首頁「更新資料」啟動背景合併程式，每秒輪詢進度，成功後重新載入總表；最後更新時間取自檔案 mtime，以台北時間顯示。
- 合併來源包含營邦、倫飛、超恩、KOYA、富弘年、勤誠；富弘年載入首頁通用工單搜尋並渲染完整資料，但不提供序號歷史或匯出；勤誠另有客序／MAC 面板。
- KOYA 型號保存 Model／PN／full PN；NYX 保存 Model／PN。PO／LOT 分別由月份對照維護；NYX 目前只有主檔維護，未接入出貨查詢與匯出。
- 資料來源設定保存於 SQLite，支援九個來源的路徑及適用的工作表、檔名關鍵字、回溯檔案數；重設恢復當前環境變數或程式預設值。
- 後端服務由 FastAPI lifespan 初始化並透過 Depends 注入；Customer Enum、ApiResponse[T]、輸入上限、JSON logging、WAL 與 SQLite 交易已實作。
- Docker 資料庫掛載為 /app/data；網路磁碟掛載為 /mnt/netdisk。Linux systemd 提供獨立資料目錄與資料庫備份／修復腳本。
- 本次同步依據目前工作樹（包含未提交及新增檔案），不代表已部署。主檔與來源維護已從 app.js 抽離；多客戶查詢／匯出協調及 Docker 非 root 使用者仍待完成。

### 更新與部署細節

`ShipmentRefreshService` 以背景 Thread 執行 `backend/app/tools/shipment_merge.py` 子程序，將已儲存來源設定轉為環境變數。進度來自 stdout 階段標記，不是時間估算；狀態為 idle／running／succeeded／failed，同一服務实例重複啟動回傳 409 `SHIPMENT_REFRESH_RUNNING`。任務狀態存在程序記憶體，更新入口應使用單一 Uvicorn worker；目前沒有跨程序任務鎖或重啟恢復。

合併器支援 Excel、MSG、EML，超恩包含回覆郵件局部更新及多工單拆列，另讀取 FCST、BIOS/FW 和 KOYA Model 對照。輸出先在同資料夾建立暫存 XLSX、套用格式後以 `os.replace` 取代總表；部分來源失敗時嘗試沿用該來源舊工作表，全部失敗則不更新。若舊總表讀取失敗，只輸出本次成功資料，需查看合併 log 確認各來源結果。

`DEFAULT_EXCEL_PATH` 指定四個共用客戶的總表路徑，預設 `/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx`；`SHIPMENT_REFRESH_SCRIPT_PATH` 可覆寫合併腳本。合併器固定輸出檔名為 `出貨記錄總表.xlsx`，覆寫總表路徑時需維持此檔名。KOYA 網頁主檔用於前端 PN／full PN 覆蓋；合併器目前仍讀取獨立 `SHIPMENT_KOYA_MODEL_FILE`，兩者不自動互相寫回。

Docker 使用 `NETDISK_PATH`（預設 `H:/`）掛載 `/mnt/netdisk`，Linux 請設成實際掛載根目錄，且執行帳號須有總表目錄寫入權限。systemd 設定與修復步驟見 [部署說明](../deploy/systemd/README.md)，資料庫置於 `/var/lib/sn_generator/sn_generator.db`；搬移前使用腳本保留歷史與主檔資料。執行中的設定來源是 `backend/app/core/config.py`。

### 超恩 BIOS/FW 分享連結（2026-09-14 現況）

`GET /api/vecow-link` 讀取、`PUT /api/vecow-link` 儲存 `{ "url": "https://…" }`；空白移除，最長 2000 字元，只接受無帳密的有效 HTTP(S) 網址。`VecowLinkService` 使用 SQLite `vecow_link` 單列（id=1），lifespan 初始化後由 router 從 app.state 取得。`js/modules/vecowLink.js` 管理維護表單、載入與連結顯示；首頁僅命中超恩時顯示，超恩工作區亦有入口，未設定時隱藏，新頁開啟使用 noopener noreferrer。此分享網址獨立於合併器 BIOS Excel 檔案路徑。維護入口以 Ctrl+Shift+D 切換顯示。

## v0.3.61 現況補充（2026-09-14）

本次以目前未提交工作樹核對，保留之前的修改紀錄。新增泉影 DEG 獨立生成面板、三種編碼規格、日期帶入、整批複製、Excel 下載與生成歷史；新增深色／淺色／彩色外觀選擇。後端允許七個 customer（原六客戶加 deg），前端 CUSTOMERS registry 與聚合搜尋仍為原六客戶，DEG 由獨立面板操作；NYX 仍僅提供主檔與月份維護。API 仍為 27 組 Method／Path，資料庫仍為八個表，DEG 重用 SN／export／history API 與既有歷史表。

### 泉影 DEG 業務與資料流

| spec | 規格 | 流水號 |
|---|---|---|
| hl | HL + DD + 三位英數產品碼 + YYWW | 五位，1～99999 |
| pizza_box | 料號 + DD + 年份末位 + 兩位週數 + 週幾 + 000 | 五位，1～99999 |
| pizza_carton | CO + YYMMDD + 兩位週數 + P | 三位，1～999 |

HL 範例：HLDDM2A263800001；Pizza Carton 範例：CO26091438P998。Pizza Box 料號只接受英數與 . _ / -，最多 100 字；週数為 01～53，週幾為 1～7（週一為 1），Carton 日期必須存在。起號加數量超過碼寬上限時拒絕，不寫歷史，錯誤碼 INVALID_DEG_OPTIONS。

`index.html` 的 details 面板直接初始化 `js/modules/deg.js`，POST `/api/sn/generate` 傳 customer=deg、key、qty 與 deg 設定，由 `SnService` 呼叫 `build_deg_serials()`。歷史 key 為 spec:prefix，累加已生成數量並保存首尾序號紀錄；回應 key 保留請求值。起始流水號由操作員指定，歷史計數不會自動接續或拒絕重複序號。GET `/api/history/deg` 查看歷史，POST `/api/export` 以 customer=deg、sn_rows=[{SN:序號}] 下載單一 SN 工作表；下載重試不再生成或新增歷史。

日期由瀏覽器當地日期帶入，HL 使用日曆年份後兩位加 ISO 週數，跨年仍保留此規則（2021-01-01 為 2153），不是 ISO 週年。規格／輸入變動清除舊輸出、停用複製與下載；操作中表單 inert 並停用按鈕。M.2 對照圖位於 assets/deg/m2_1.png～m2_4.png，部署靜態檔時須包含 assets。

### 外觀設定

html data-theme 支援 light／dark／colorful，預設 dark。頁首選擇器與 `applyTheme()` 同步，使用 sn-color-theme localStorage 保存；head 提前讀取設定以減少載入閃爍。彩色模式補充卡片、標題、按鈕、進度條樣式；此全頁外觀設定獨立於首頁命中客戶的主題色。

## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

### 可配置來源規則架構

`shipment_source_config` 除原本路徑欄位外，保存 `label / path_kind / rules_json / search_customer / work_order_column / customer_keywords`。自訂來源可建立 Excel 檔案或資料夾來源；來源名稱同時作總表工作表名，須符合 Excel 31 字限制且不可衝突。內建營邦、倫飛、富弘年、勤誠提供可編輯候選範本；超恩、KOYA 及其 FCST／BIOS／Model 輔助來源保留專用處理器。

規則 `version=1`，執行順序為選檔 → 選頁 → 表頭 → 欄位映射 → 儲存格補值 → 文字轉換 → 列過濾 → 拆列／計算 → 對照補值 → 局部更新 → 投影／去重。基本規則涵蓋 latest／first_valid／merge_recent、first／exact／contains／list、固定／掃描表頭、欄位位置或別名、清理、過濾及全欄去重；進階規則涵蓋儲存格值、coalesce／日期格式、Excel／SQLite 對照、工單拆列與比例差額，以及 EML／MSG 抽表和同主題回覆更新。未知版本、操作、欄位歧義與不完整資料均拒絕，不執行任意 Python／SQL／regex。

`POST /api/shipment-sources/preview` 以未保存設定使用正式讀取器，回傳處理前後樣本、實際列號、映射、警告及完整筆數，不修改設定或總表；樣本限制 20 列／100 欄／每格 500 字，但仍完整讀取選中檔案。背景更新透過 `source_results` 回報 updated／retained／skipped／failed，所有來源失敗或寫檔失敗時保留原總表。

自訂來源與內建富弘年預設納入首頁工單／MO 通用搜尋，可指定匯入後欄名限制搜尋；完整 token 優先，無精確命中才包含匹配。所有通用來源自動使用超恩式分類卡片、預覽／原始資料頁籤與複製操作。`search_customer=deg` 僅能綁一個自訂來源，命中後開啟 DEG 編碼面板。通用來源只顯示資料，不自動取得客戶序號演算法。

舊客戶遷移由 `SHIPMENT_RULE_MIGRATION_CUSTOMERS` 逐客戶開啟，原處理器與候選規則的欄名、順序、筆數、型別和值完全一致才採候選；差異或錯誤立即使用本次原處理器結果。超恩與 KOYA 固定 blocked。`shipment_check.py` 可唯讀檢查同批雜湊、MIME、模組、來源設定、SQLite 與權限，或輸出最多 10 個比較差異；退出碼 2 表示比較未通過，不是成功。

### 勤誠 FZG 序號

首頁命中勤誠工單後顯示獨立面板。客序使用日曆年份後兩位＋ISO 週數＋8 位料號分類碼＋5 位週流水號，歷史 key 為 `YY-Www`、範圍 1～99999；MAC 使用固定 `5001C450 `＋6 位大寫十六進位＋`BF`，歷史 key 為 `MAC`、範圍 200000～2FFFFF。`HistoryService.reserve_range()` 以交易保留區間並檢查上限。狀態與重設使用 `/api/sn/fzg/status`、`/api/sn/fzg/reset`；重設會重用序號，前端必须确认。料號優先擷取尾端 8 位數字，否則以破折號分段規則建立分類碼，無法解析即拒絕。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
