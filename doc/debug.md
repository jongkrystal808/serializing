# Debug Log / 錯誤紀錄

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.42
**Last Updated:** 2026-09-09

---

## 🔴 Open Bugs

（目前無已登錄的 P0 Open Bug）

---

## ✅ Resolved Bugs

### BUG-20260909-013 — 前端初始化、儲存與渲染邊界不明確

**Severity:** P1 / Stability & Security

**Affected:** `config.js`, `state.js`, `customerColumns.js`, `previewCustomTabs.js`, `ui*.js`, `homeController.js`

**Root Cause:** 客戶設定透過未驗證全域隱式取得；必要 DOM 允許 null 延後失敗；localStorage 錯誤遭靜默吞掉；多個模組直接維護 `innerHTML` sink。

**Fix:** 新增 validated customer registry、必要 DOM fail-fast、observable storage adapter，以及單一受控 `dom.js` DocumentFragment template boundary。模組不再直接寫入 `innerHTML`；狀態更新使用 `classList.toggle()` 保留語意 class；`app.js` 舊模板併入 T69 後續控制器拆分範圍。

**Verification:** regression 驗證缺少 CUSTOMERS、缺少 DOM、QuotaExceededError、損壞 JSON 均會明確失敗或通知，且 `js/modules` 只允許 `dom.js` 保留單一模板解析 sink。

**Resolved milestone:** 2026-09-09

### BUG-20260909-014 — 預覽 WET、客戶 magic strings 與 BNG 脆弱解析

**Severity:** P2 / Maintainability

**Affected:** `uiPreviewRenderers.js`, `homeController.js`, `bngReceipt.js`, `utils.js`

**Root Cause:** 三客戶成功預覽重複相同 shell；home controller 散落客戶 key literal；BNG 依固定 `" 1."` index 分割；單一 HTML encoder 未表達輸出語境。

**Fix:** 三客戶改用 `renderCustomerSearchSuccessLayout()`；客戶 key 集中至 `CUSTOMER_KEYS`；BNG parser 支援彈性空白、半／全形標點並避免把 `1.2` 當備註；新增 quoted attribute encoder。

**Verification:** regression 靜態驗證三個 renderer 使用共用元件且 homeController 無客戶字串 literal，並涵蓋 BNG 格式變體與 attribute 控制字元。

**Resolved:** 2026-09-09

### BUG-20260909-010 — CSS ID selector 造成高特異性

**Severity:** P2 / Maintainability

**Affected:** `index.html`, `styles/main.css`

**Root Cause:** 狀態、首頁搜尋、主題容器與列印模式直接用 DOM id 套用樣式，使後續元件覆寫需要更高特異性。

**Fix:** 保留 id 給 JavaScript 定位，同時加入語意 class；stylesheet 全面改用 class selector。

**Verification:** 靜態 regression 驗證 `main.css` 不存在以 `#` 開頭的 ID selector。

**Resolved:** 2026-09-09

### BUG-20260909-011 — 客戶首頁主題規則重複

**Severity:** P2 / Maintainability

**Affected:** `styles/main.css`

**Root Cause:** 各客戶分別重複宣告相同的 border 與 status 規則，只差色碼。

**Fix:** yingbang、lunfei、bng、chg、hmg、clg 主題 class 僅設定 `--home-theme-accent`，共用元件統一讀取變數。

**Verification:** 靜態 regression 驗證六個主題 class 均定義 accent 變數，且共用規則只保留一份。

**Resolved:** 2026-09-09

### BUG-20260909-012 — 固定 px 尺寸不利縮放與響應式顯示

**Severity:** P2 / Responsive UX

**Affected:** `styles/main.css`

**Root Cause:** 版面寬高、間距、字級、控制元件與 breakpoint 大量採固定 px，不會隨根字級設定縮放。

**Fix:** 可縮放尺寸換算為 rem；1px/2px 邊線、outline、inset shadow 與 999px 膠囊圓角保留為刻意的像素視覺細節。

**Verification:** 靜態 regression 逐行檢查 px，拒絕新增非允許用途的固定像素值。

**Resolved:** 2026-09-09

### BUG-20260909-007 — 500 response 洩漏內部例外資訊

**Severity:** P1 / Security

**Affected:** `backend/app/core/errors.py`

**Root Cause:** 全域未預期例外 handler 將 `str(exc)` 放入 response details，可能暴露檔案路徑、SQL 或底層服務資訊。

**Fix:** 對外固定回傳 `INTERNAL_ERROR` 與通用中文訊息；request method、path、完整例外及 traceback 僅由伺服器 `logger.exception` 記錄。

**Verification:** 回歸測試注入含敏感字串的例外，確認 response 不含敏感內容且 server log 保留診斷資訊。

**Resolved:** 2026-09-09

### BUG-20260909-008 — Excel 上傳無容量限制可造成記憶體耗盡

**Severity:** P1 / Security & Stability

**Affected:** `backend/app/core/request_limits.py`, `backend/app/routers/excel.py`, `backend/app/services/excel_service.py`

**Root Cause:** `/api/excel/parse` 無條件讀取整個 UploadFile，且 openpyxl 載入前未限制 XLSX ZIP 解壓後總量；只檢查客戶端 Content-Length 也可被省略或偽造。

**Fix:** ASGI middleware 先限制整體 request body；路由最多讀取設定上限加 1 byte 並驗證實際資料量；XLSX 載入前彙總 `ZipInfo.file_size` 限制解壓後總量。預設分別為 20 MiB 與 100 MiB。

**Verification:** 回歸測試涵蓋超大 Content-Length、未提供可信 size 的超量實際資料，以及壓縮後小但解壓後超限的 XLSX。

**Resolved:** 2026-09-09

### BUG-20260909-009 — Content-Disposition 檔名可注入控制字元

**Severity:** P1 / Security

**Affected:** `backend/app/routers/export.py`

**Root Cause:** 下載檔名僅替換雙引號與反斜線，未排除 CR、LF、NUL 與其他 ASCII 控制字元。

**Fix:** 在建立 ASCII fallback 與 UTF-8 編碼檔名前，統一將 ASCII 0–31、127、雙引號與反斜線替換為底線。

**Verification:** 回歸測試以含 CR/LF/NUL/DEL 的檔名匯出，確認 response header 不含任何控制字元。

**Resolved:** 2026-09-09

### BUG-20260909-004 — 同步 I/O 阻塞 FastAPI Event Loop

**Severity:** P1 / Stability

**Affected:** `backend/app/routers/excel.py`, `export.py`, `history.py`, `sn.py`, `print_notice.py`

**Root Cause:** handler 宣告為 `async def`，內部卻直接執行 openpyxl、sqlite3、同步檔案讀取與匯出，工作會占住 Event Loop。

**Fix:** 所有含同步 I/O 的 handler 改為普通 `def`；UploadFile 改由 worker thread 讀取 `file.file.read()`。純記憶體 health check 保持 async。

**Verification:** route inspection 2/2、既有 T27 integration 7/7 通過。

**Resolved:** 2026-09-09

### BUG-20260909-005 — 大表格逐格綁定 click listener

**Severity:** P1 / Performance

**Affected:** `js/modules/uiClipboard.js`

**Root Cause:** `bindSheetCopyCellsIn()` 對每個 `.copyable-cell` 呼叫 `addEventListener`，listener 數量隨表格儲存格呈 O(N) 成長。

**Fix:** 在預覽 root 建立單一 click listener，使用 `closest()` 做事件委派，並以 root flag 防止重複綁定。

**Verification:** Node regression 驗證同一 root 重複 bind 仍只有一個 listener，且動態儲存格可正常複製。

**Resolved:** 2026-09-09

### BUG-20260909-006 — app.js 功能域持續膨脹

**Severity:** P1 / Maintainability

**Affected:** `js/app.js`, `js/modules/previewCustomTabs.js`

**Root Cause:** 自訂頁籤的儲存、資料遷移、識別碼解析及 CRUD 與主客戶流程混在單一控制器。

**Fix:** 抽成 `createPreviewCustomTabsController()`，由 `app.js` 僅注入客戶設定、重新渲染及頁籤啟用 callback。

**Verification:** JavaScript syntax checks 與事件委派 regression 通過；`app.js` 由 3,571 行降至 3,355 行。主檔後續拆分仍由 T69 追蹤。

**Resolved milestone:** 2026-09-09

### BUG-20260909-001 — 並行請求可能產生重複序號

**Severity:** P0 / Operational correctness

**Affected:** `backend/app/services/sn_service.py`, `backend/app/services/history_service.py`

**Root Cause:** 原流程先 `SELECT` 目前流水號、在記憶體生成序號、最後才 `UPDATE`；兩個 Worker 可同時讀到相同值。Python `threading.Lock` 只能保護單一 Process，無法提供跨 Worker 唯一性。

**Fix:** `increment > 0` 改用 SQLite `INSERT ... ON CONFLICT DO UPDATE SET last_serial = last_serial + excluded.last_serial RETURNING last_serial`。以回傳終點減去數量計算 `previous`，SN 服務只使用該資料庫保留區間。

**Verification:** 4 個不共享 Lock 的服務實例並行保留 40 段、每段 5 筆；1–200 全部唯一且連續。

**Resolved:** 2026-09-09, commit `3e1fb8c`

### BUG-20260909-002 — CORS 萬用來源與 credentials 同時啟用

**Severity:** P0 / Security

**Affected:** `backend/app/main.py`, `backend/app/core/config.py`, `docker-compose.yml`

**Root Cause:** `allow_origins=["*"]` 與 `allow_credentials=True` 組合會讓非信任網站有機會以使用者憑證進行跨來源請求。

**Fix:** 改由 `CORS_ALLOWED_ORIGINS` 提供明確來源清單；預設只允許 `http://localhost:8080` 與 `http://127.0.0.1:8080`，設定包含 `*` 時直接拒絕啟動。

**Verification:** 已列入來源取得 `Access-Control-Allow-Origin`，惡意測試來源不取得該標頭，萬用字元設定拋出 `ValueError`。

**Resolved:** 2026-09-09, commit `3e1fb8c`

### BUG-20260909-003 — 自訂頁籤持久型 XSS

**Severity:** P0 / Security

**Affected:** `js/app.js`, `js/modules/ui.js`, `js/modules/uiPreviewRenderers.js`

**Root Cause:** contenteditable 的 `innerHTML` 未經消毒存入 localStorage，載入時又直接插入模板，形成持久型 XSS；貼上 HTML 時也可能在失焦儲存前執行事件屬性。

**Fix:** 自訂頁籤改用 `{id, label, text}` 結構化純文字；舊 `html/contentHtml` 以 inert `DOMParser` 取出 `textContent` 後立即覆寫；渲染時使用 `escapeHtml()`；編輯器使用 `plaintext-only` 並攔截 paste/drop。

**Verification:** JavaScript 語法檢查通過，渲染路徑不再使用 runtime tab HTML。

**Resolved:** 2026-09-09, commit `3e1fb8c`

---

## 🧪 Regression Commands

```powershell
cd backend
..\.venv\Scripts\python.exe -m unittest discover -s tests -p "test_*.py" -v
..\.venv\Scripts\python.exe tests\t27_integration_runner.py
cd ..
node --check js\app.js
node --check js\modules\ui.js
node --check js\modules\uiPreviewRenderers.js
node --check js\modules\previewCustomTabs.js
node --experimental-default-type=module js\tests\p1_regression.mjs
```

目前結果：P0/P1 regression 10/10、T27 integration 7/7、前端事件委派 regression 與 JavaScript syntax checks 全數通過。
