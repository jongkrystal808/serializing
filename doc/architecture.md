# SN-GENERATOR (序號產生器) 系統架構設計文件

**Version:** 0.3.41
**Last Updated:** 2026-09-09

## 1. 系統架構總覽 (Architecture Overview)

系統採用「Frontend Static Page + Backend API + SQLite」的分層式架構設計 (Layered Architecture)：

- **資料流向**: Browser (index.html + js/* + styles/*) -> /api/* (Nginx reverse proxy) -> FastAPI (backend/app/*) -> SQLite (backend/data/sn_generator.db)
- **核心設計**:
  - 單一首頁 (Single Homepage) 整合跨 6 大客戶的查詢。
  - 客戶無關的欄位解析 (Customer-independent field parsing)。
  - API-First 開發方法，確保前後端職責分離。
- **客戶分類**:
  - 4 個共用 Excel 客戶 (Shared Excel): yingbang, lunfei, bng, chg
  - 2 個獨立客戶 (Independent): hmg, clg

## 2. 技術堆疊 (Technology Stack)

### 前端 (Frontend)
- **架構**: Vanilla HTML + JS (ES Modules)
- **樣式**: CSS (`styles/main.css`)
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
├── styles/main.css
├── js/
│   ├── app.js (3355 lines, main controller)
│   ├── config.js (customer config reader, CONFIG dynamic getter)
│   ├── state.js (global state + DOM refs cache)
│   └── modules/
│       ├── api.js (Backend REST API wrapper, 10 endpoints)
│       ├── bngReceipt.js (BNG receipt print payload & template)
│       ├── customerColumns.js (customer field resolver with aliases)
│       ├── excel.js (week calc, SN prefix, BNG range expand, CHG bundle)
│       ├── homeController.js (home aggregated search controller)
│       ├── previewCustomTabs.js (custom-tab persistence, migration and CRUD controller)
│       ├── serialSettings.js (CLG custom base serial calc)
│       ├── ui.js (UI aggregation entry, re-exports clipboard/history/renderers)
│       ├── uiClipboard.js (clipboard copy + cell/button bindings)
│       ├── uiHistory.js (history table render + reset bindings)
│       ├── uiPreviewRenderers.js (6-customer preview pane renderers)
│       ├── utils.js (text normalize, HTML escape, arrow parse, range normalize)
│       └── workOrder.js (work order tokenization, qty resolution, field search)
├── backend/
│   ├── app/
│   │   ├── main.py (FastAPI app, CORS, exception handlers, router mounts)
│   │   ├── core/ (config.py, errors.py, request_limits.py, responses.py)
│   │   ├── routers/ (health, excel, sn, export, history, print_notice)
│   │   ├── schemas/ (common, excel, sn, export, history, print_notice)
│   │   └── services/ (excel_service, sn_service, export_service, history_service, print_notice_service)
│   ├── data/sn_generator.db
│   ├── requirements.txt
│   └── Dockerfile
├── deploy/nginx/nginx.conf
├── docker-compose.yml
└── doc/ (this documentation folder)
```

## 4. 後端 API 設計 (Backend API Design)

共設計 11 支 API 斷點：

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
| POST | `/api/print-notice/delete` | 刪除列印通知 | JSON (Delete payload) | JSON (Success status) |

## 5. 資料庫綱要 (Database Schema)

底層採用 SQLite，包含 3 個主要資料表：

1. **`serial_history`**: 記錄序號使用歷史，Composite PK 為 `(customer, history_key)`。流水號區間透過 SQLite `INSERT ... ON CONFLICT DO UPDATE ... RETURNING` 單一 SQL 原子保留；回傳值減去本次數量即為區間起點，可跨 Thread／多 Worker 避免重複派號。
2. **`generation_history`**: 記錄每一次序號產生的操作紀錄，包含 `id` (autoincrement PK)。
3. **`print_notice`**: 記錄與列印通知相關的設定與數值，Composite PK 為 `(customer, workorder_value)`。

## 6. 前端執行期流程 (Frontend Runtime Flow)

前端應用依循以下主要執行流程：

- **Excel 上傳機制**:
  - 支援 4 家客戶 (yingbang, lunfei, bng, chg) 共同上傳解析機制。
  - 獨立客戶 (hmg, clg) 採各自專屬的上傳及解析通道。
- **首頁整合查詢 (Home Aggregated Search)**: 支援工單 (Work Order/MO) 及機種 (Model) 兩種查詢模式。
- **查詢與產生 (Search & Generate)**: 解析後，於預覽面板確認資料，執行 SN 產生邏輯。
- **歷史面板 (History Panel)**: 即時顯示對應客戶的 `history_key` 目前序號發放狀態，支援重置。
- **客製化頁籤 (Custom Tabs)**: 透過 Config 提供不同客戶獨立頁籤與操作流程。使用者建立的內容僅以結構化純文字存入 `sn_preview_custom_tabs`；舊版 HTML 載入時轉為純文字並覆寫，貼上與拖放也不得插入可執行 HTML。
- **列印支援 (BNG Receipt Printing)**: 提供特定客戶 (BNG) 標籤列印預覽及產出機制。
- **UI 主題顏色**: 依照選擇的客戶載入對應之 Theme Colors。

## 7. 客戶業務規則 (Customer Rules)

系統支援 6 家客戶的不同產生邏輯與匯出格式：

| 客戶 (Customer) | 查詢欄位 (Query Field) | 序號產生依據 (Generation Key) | 歷史紀錄鍵值 (Record Key) | 歷史首欄 (History First Col) | SN 格式 (SN Format) | 匯出格式 (Export Format) |
|-----------------|------------------------|-------------------------------|---------------------------|------------------------------|---------------------|--------------------------|
| **yingbang** | 工單 (MO) | `{po}1{4-digit serial}` | PO | PO Number | 單一 Sheet (SN, Datecode, PN) | Excel (單表) |
| **lunfei** | 工單/機種 | `106{WW}62{5-digit serial}` | WW (週數) | Week | 雙表 (SN + BOX) | Excel (雙表) |
| **bng** | 工單 (MO) | MAC/SN/UUID Range Expand | MO Number | MO Number | 雙表 (SN + BOX), 列印收據 | Excel (雙表) |
| **chg** | 工單/PN | Label repeat by qty | PN | PN | 雙表 (SN + BOX) | Excel (雙表) |
| **hmg** | 機種/PN | 無 SN (No SN) | PN | PN | HEX sheet (Model/PN/EAN/PCBA) | Excel (HEX 表) |
| **clg** | 工單 (MO) | Manual base serial (10/16/cycle)| MO Number | MO Number | MES sheet (SN only) | 文字檔 / Excel |

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

## 11. 錯誤處理 (Error Handling)

- **統一回傳格式**: 所有 API 錯誤皆封裝於統一的 `ApiResponse` 結構中。
- **全域攔截**: FastAPI 實作了全域例外攔截器 (Global Exception Handlers)，捕捉 Pydantic 驗證錯誤與自訂的業務邏輯錯誤。
- **資訊最小化**: 500 response 不包含 `str(exc)`、檔案路徑或資料庫資訊；完整例外與 traceback 僅記錄於伺服器端。
- **錯誤代碼**: 定義標準的 Error Codes 列表，方便前端根據特定錯誤碼進行對應的 UI 提示或重試機制。
