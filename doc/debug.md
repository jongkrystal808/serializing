# Debug Log / 錯誤紀錄

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.38
**Last Updated:** 2026-09-09

---

## 🔴 Open Bugs

（目前無已登錄的 P0 Open Bug）

---

## ✅ Resolved Bugs

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
```

目前結果：P0 regression 3/3、T27 integration 7/7、JavaScript syntax checks 全數通過。
