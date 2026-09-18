# Debug Log / 錯誤紀錄

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.79
**Last Updated:** 2026-09-18

---

## 🔴 Open Bugs

（目前無已登錄的 P0 Open Bug）

---

## 2026-09-14 修正與排查補充

| 問題 | 目前實作／排查 |
|---|---|
| 部署覆蓋 SQLite 或啟動 readonly database | systemd 使用獨立 StateDirectory；依 deploy/systemd/README.md 指定現用 DB 執行修復，確認帳號、目錄權限與備份。 |
| 匯入模組即建表、測試難以隔離 | DB 服務改由 lifespan 初始化與 Depends 注入；直接測試服務需明確 initialize，TestClient 需使用 context manager。 |
| 倫飛流水號與生成紀錄使用不同 key | SnService 使用解析後 YYYY-Www 寫入計數與紀錄；API 回應 key 仍保留請求查詢值。 |
| 更新總表途中寫壞檔案 | 先完成暫存 XLSX 再 os.replace；全來源失敗不更新，部分失敗嘗試沿用旧表。 |
| 更新按鈕無反應或失败 | 先查 /api/shipment-refresh、合併 log、腳本與套件，再查網路磁碟和輸出目錄寫入權限；409 表示同实例已有更新。 |
| 來源環境變數變更但更新仍讀舊位置 | 已存 SQLite 的設定優先；由維護面板修改或重設對應來源。 |
| KOYA 維護後預覽仍是舊資料 | 主檔／月份異動會清除舊選取；重新查詢後再生成或匯出。 |

已知限制：更新任務狀態未持久化且只有程序內鎖，請以單 worker 提供更新入口。部分來源失敗也可能回報 succeeded，須查看 log 確認更新／沿用／略過的來源。旧表讀取失敗時只輸出成功來源；此行為尚未改成拒絕寫入。NYX 出貨與匯出尚未接入。上述限制不視為已解決。

## ✅ Resolved Bugs

### BUG-20260909-017 — 首頁可能在底層匯出失敗後仍顯示完成

**Severity:** P1 / Correctness & UX

**Affected:** `app.js`, `homeController.js`

**Root Cause:** `onExportClick()` 在各客戶分支內攔截錯誤但沒有回傳結果，首頁 controller 因而無法辨識底層失敗，仍會繼續同步預覽並寫入「匯出完成」。

**Fix:** 所有匯出分支統一回傳布林成功狀態；首頁只在 `true` 時顯示完成並捲回狀態列。失敗與取消流程保留 inline status，另顯示 error/info Toast。

**Verification:** JavaScript syntax、前端 P1 regression 與實際瀏覽器錯誤／成功回饋流程檢查通過。

**Resolved:** 2026-09-09

### BUG-20260909-016 — MO 命中兩筆時只能看到並使用第一筆

**Severity:** P1 / Correctness & UX

**Affected:** `app.js`, `state.js`, `uiPreviewRenderers.js`, `main.css`, `homeController.js`

**Root Cause:** 倫飛與 BNG 查詢流程固定將 `matchedRows[0]` 指派給 `state.currentRow`，成功預覽也只渲染第一列；使用者無法核對或指定第二列，首頁亦沒有選取同步機制。

**Fix:** MO 恰好命中 2 筆時顯示警示與紅色粗體訊息，渲染兩張可點擊預覽卡；選取後更新 `state.currentRow`、目前索引及完整預覽，首頁同步 clone 更新。後續生成、匯出與 BNG 收據均使用目前選取列，切換時不重複彈出警示。

**Verification:** JavaScript syntax、`git diff --check` 與前端 P1 regression 通過；靜態回歸檢查涵蓋雙預覽按鈕及 `aria-pressed` 選取狀態。

**Resolved:** 2026-09-09

### BUG-20260909-015 — app.js 動態 HTML sink 分散且預覽內容重解析

**Severity:** P1 / Security & Maintainability

**Affected:** `app.js`, `dom.js`, `p1_regression.mjs`

**Root Cause:** 主流程仍直接寫入多個 `innerHTML` sink，首頁預覽同步更會讀取來源 `innerHTML` 後再解析；檔名與例外訊息插入部分模板前也未先做文字語境編碼。

**Fix:** 所有主流程模板改經 `replaceChildrenFromTrustedTemplate()` 的單一 DocumentFragment boundary；預覽同步改用 `cloneChildrenInto()` 複製 DOM 節點；外部字串進入模板前先 `escapeHtml()`。

**Verification:** JavaScript syntax 與前端 P1 regression 通過；靜態測試禁止 `app.js` 直接讀寫 `innerHTML`，全專案 JavaScript 僅 `dom.js` 保留模板解析 sink；後端 regression 10/10 通過。

**Resolved:** 2026-09-09

### BUG-20260909-013 — 前端初始化、儲存與渲染邊界不明確

**Severity:** P1 / Stability & Security

**Affected:** `config.js`, `state.js`, `customerColumns.js`, `previewCustomTabs.js`, `ui*.js`, `homeController.js`

**Root Cause:** 客戶設定透過未驗證全域隱式取得；必要 DOM 允許 null 延後失敗；localStorage 錯誤遭靜默吞掉；多個模組直接維護 `innerHTML` sink。

**Fix:** 新增 validated customer registry、必要 DOM fail-fast、observable storage adapter，以及單一受控 `dom.js` DocumentFragment template boundary。模組不再直接寫入 `innerHTML`；狀態更新使用 `classList.toggle()` 保留語意 class；`app.js` 的剩餘模板已於 BUG-015 完成收斂。

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
# 專案根目錄，安裝 backend/requirements.txt 後執行
python -m pytest -q
node --experimental-default-type=module js/tests/p1_regression.mjs
node --check js/app.js
git diff --check -- doc
```

`pytest.ini` 收集 backend/tests/test_*.py，T27 runner 由 test_t27_integration.py 納入。測試覆蓋 P0/P1、API 契約、服務生命周期、資料驗證、WAL、型號／月份 CRUD、來源設定與背景合併。Docker 基準為 Python 3.12；請使用支援目前語法並已安裝完整套件的環境。實際本次結果見 update.md；歷史瀏覽器 QA 記錄不代表本次重新驗收。

### 超恩 BIOS/FW 分享連結（2026-09-14 現況）

`GET /api/vecow-link` 讀取、`PUT /api/vecow-link` 儲存 `{ "url": "https://…" }`；空白移除，最長 2000 字元，只接受無帳密的有效 HTTP(S) 網址。`VecowLinkService` 使用 SQLite `vecow_link` 單列（id=1），lifespan 初始化後由 router 從 app.state 取得。`js/modules/vecowLink.js` 管理維護表單、載入與連結顯示；首頁僅命中超恩時顯示，超恩工作區亦有入口，未設定時隱藏，新頁開啟使用 noopener noreferrer。此分享網址獨立於合併器 BIOS Excel 檔案路徑。維護入口以 Ctrl+Shift+D 切換顯示。

## v0.3.61 現況補充（2026-09-14）

本次以目前未提交工作樹核對，保留之前的修改紀錄。新增泉影 DEG 獨立生成面板、三種編碼規格、日期帶入、整批複製、Excel 下載與生成歷史；新增深色／淺色／彩色外觀選擇。後端允許七個 customer（原六客戶加 deg），前端 CUSTOMERS registry 與聚合搜尋仍為原六客戶，DEG 由獨立面板操作；NYX 仍僅提供主檔與月份維護。API 仍為 27 組 Method／Path，資料庫仍為八個表，DEG 重用 SN／export／history API 與既有歷史表。

### DEG 與新功能排查

- INVALID_DEG_OPTIONS：確認 HL 三位產品碼／YYWW、Pizza Box 料號／年份末位／週幾、Carton 真實日期及起號加數量上限。無效設定不應留下歷史。
- 重複 DEG 序號：起號手動指定，歷史只記錄生成量與区間；再次使用相同起號會生成相同序號，現況未實作自動接續或重複偵測。
- 日期跨年看似不一致：HL 保留日曆年＋ISO 週数，2021-01-01 為 2153，屬目前規格。
- 下载失敗可重試：已成功生成的清單保留，使用下載按鈕，不須再次生成。
- 主題未保存：確認 sn-color-theme 儲存權限；head 的預讀取失敗時回退深色，正常事件寫入透過既有 storage helper。
- 對照圖未顯示：確認部署包含 assets/deg 四張 PNG，並核對靜態路徑。

新增驗證命令：`python -m pytest -q backend/tests/test_deg.py`、`node --experimental-default-type=module js/tests/deg_regression.mjs`、`node --experimental-default-type=module js/tests/vecow_link_regression.mjs`。

## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

### 來源規則、遷移與勤誠排查

- 預覽失敗：依序查看檔名策略、實際分頁、表頭列、必要欄、位置映射、處理步骤；預覽不保存設定，也不代表已更新總表。
- 更新顯示 retained：本次來源處理失敗但舊分頁仍在，錯誤原因不可忽略；skipped 表示無新資料亦無舊分頁。所有來源無成功資料時總表不取代。
- 搜尋不到自訂來源：先保存来源、按更新資料，確認總表有同名分頁，再檢查指定欄名與 `/api/excel/load-source?source_key=...`。通用搜尋不會啟動客戶生成流程。
- 搜尋不到富弘年：確認總表存在「富弘年出貨」分頁，並以 `/api/excel/load-source?source_key=dcg` 驗證。首頁會將 `dcg` 當通用來源載入、搜尋及完整渲染，不啟動原六客戶匯出或序號歷史。
- DEG 綁定衝突：同時只能一個自訂來源使用 `search_customer=deg`，先將原來源改回通用。
- 遷移 fallback／blocked：fallback 仍使用本次原處理器結果；blocked 的超恩／KOYA不應強制切換。正式啟用前用服務帳號對真實資料执行 compare。
- release check 失敗：先確認 manifest 與工作樹皆為同一批 0.3.79 檔案；修改清單內檔案後須重建雜湊，不可忽略 hash／MIME／權限錯誤。本機目前 check 為 `errors: []`。
- 勤誠序號耗盡：客序上限 99999，MAC 上限 2FFFFF；查看 status。重設會重新使用序號，只能在確認現場狀態後操作。
- 勤誠料號錯誤：確認尾端 8 位分類碼，或至少三段破折號格式；FZG 序號面板只有命中勤誠來源時顯示。

本次驗證（2026-09-18）：74 個 Python 檔可解析；`npm test` 的 7 組前端回歸全部通過，包含 Playwright 來源規則瀏覽器流程；後端完整測試為 `114 passed`；0.3.79 release check 回傳 `errors: []`。正式伺服器、服務帳號與真實網路磁碟資料未在本機驗收。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
