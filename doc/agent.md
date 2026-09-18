# Development Process Guide / 開發流程指南

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.79
**Last Updated:** 2026-09-18

---

> **📌 Purpose:**
> 此文件定義每次與 AI Agent 協作開發時的**標準工作流程**。
> 每次開新對話前後都應依照此文件執行，確保開發品質與文件同步。
>
> **This file = HOW TO WORK（工作方式）**
> 技術設計請看 `doc/architecture.md`，任務清單請看 `doc/task.md`

---

## 1. 🔄 Standard Session Flow（每次對話標準流程）

```
開新對話前
  └─ [ PRE-SESSION CHECKLIST ]
        ↓
與 AI 協作實作
  └─ [ DURING SESSION ]
        ↓
對話結束後
  └─ [ POST-SESSION CHECKLIST ]
        ↓
        └─ [ GIT COMMIT ]   ← 每完成一個改動就 commit 一次
        ↓
遇到問題時
  └─ [ DEBUG FLOW ]
```

---

## 2. ✅ Pre-Session Checklist（開新對話前）

每次開新對話，依序確認以下事項：

### 1. 確認本次目標
- [ ] 打開 `doc/task.md`，確認目前要做哪個 Task
- [ ] 確認該 Task 的 **Depends on** 是否已完成
- [ ] 本次只選 **1 個 Task**，不要一次做多個

### 2. 準備上傳文件
- [ ] `doc/architecture.md` — 必帶，讓 AI 了解設計規範
- [ ] `doc/task.md` — 必帶，讓 AI 知道目前要做什麼
- [ ] 相關 Source files（如 `index.html`, `js/app.js`, `backend/app/main.py` 等）
- [ ] `doc/debug.md` — 若本次是修 Bug 則帶上

---

## 3. 🛠️ During Session（對話進行中）

### AI 回覆後，執行前先確認：
- [ ] AI 是否有理解正確的 Task 範圍（沒有做到其他 Task 的內容）
- [ ] 程式碼有無明顯語法錯誤

### 貼上程式碼後，立即測試：
- [ ] 執行 Task 對應的 **Acceptance Criteria** 逐項驗收
- [ ] 若有問題，直接在**同一對話**內回報錯誤讓 AI 修正

### 同一對話內修正原則：
- 同一個 Bug 最多嘗試 **3 次** 修正（3-strike bug fix rule）
- 3 次仍未解決 → 結束對話，記錄到 `doc/debug.md`，下次開新對話專門處理

---

## 4. 📋 Post-Session Checklist（對話結束後）

每次對話結束、功能確認正常後，依序完成：

### 1. 更新文件
- [ ] 更新 `doc/task.md`（完成日期、狀態、Progress Summary）
- [ ] 儲存所有修改的程式碼檔案

### 2. 更新 doc/debug.md（若有發現問題）
- [ ] 已解決的 Bug → 填入 Root Cause + Fix，狀態改 Resolved
- [ ] 未解決的 Bug → 記錄症狀 + 已嘗試方法

### 3. Git Commit ✦ 必做
- [ ] 確認以上步驟全部完成後才 commit
- [ ] 執行 git commit（格式見下方）

---

## 5. 🗂️ Git Commit Guidelines

### Commit 時機
- Task 完成且驗收通過
- Bug 修復完成
- 文件更新（.md 檔）
- 樣式或小幅調整

### Commit Message 格式

```
<type>(<scope>): <description>
```

**type 對照表：**
| type | 使用時機 |
|------|----------|
| `feat` | 新增功能 |
| `fix` | 修復 Bug |
| `refactor` | 重構 |
| `docs` | 文件更新 |
| `style` | 樣式調整 |
| `chore` | 雜項 |

**scope 對照表：**
| scope | 說明 |
|-------|------|
| `yingbang` | 營邦客戶功能 |
| `lunfei` | 倫飛客戶功能 |
| `bng` | 超恩客戶功能 |
| `chg` | KOYA客戶功能 |
| `hmg` | 赫星客戶功能 |
| `clg` | Cubepilot客戶功能 |
| `core` | 共用底層模組 |
| `ui` | UI / 樣式 |
| `docs` | 文件 |

---

## 6. 🐛 Debug Flow（遇到問題時）

```
Step 1: 查 doc/debug.md → Debugging Checklists
  ↓ 沒找到或無法解決
Step 2: 開新對話，帶上完整 context (doc/architecture.md, doc/debug.md, source files)
  ↓
Step 3: 找到原因後，更新 doc/debug.md
```

---

## 7. 📐 Code Quality Rules

- [ ] **不刪除已完成功能** — AI 修改只能新增或局部調整
- [ ] **函式命名一致**
- [ ] **CONFIG 集中** — 規則常數必須在頂部或獨立 config 檔
- [ ] **中文錯誤提示** — 使用者看到的提示訊息必須是中文
- [ ] **console.log 清理** — 上線版本不留 debug 用的 console.log
- [ ] **無硬編碼欄位名稱** — 應使用變數或配置引用
- [ ] **函式註解存在**
- [ ] **邏輯區塊註解存在**
- [ ] **序號派發具原子性** — 流水號讀取與遞增不得拆成兩次資料庫操作
- [ ] **CORS 明確列舉來源** — 啟用 credentials 時禁止萬用來源 `*`
- [ ] **不信任內容不可直接寫入 innerHTML** — localStorage、API 與使用者輸入需轉為純文字或先消毒
- [ ] **同步 I/O 不得放在 async handler** — Excel、SQLite、網路磁碟與同步匯出路由使用普通 `def` 交由 Thread Pool
- [ ] **大量重複節點使用事件委派** — 表格儲存格等動態集合不得逐一註冊相同 listener
- [ ] **500 錯誤不得外洩例外內容** — 客戶端只接收固定訊息，完整堆疊僅寫入伺服器 logger
- [ ] **上傳限制採實際資料量驗證** — 不只信任 Content-Length，並限制檔案位元組與 XLSX 解壓後總量
- [ ] **動態 HTTP Header 值移除控制字元** — 檔名等輸入必須排除 ASCII 0–31 與 127
- [ ] **CSS 使用低特異性語意 class** — `id` 保留給 DOM 定位，不作為樣式選擇器
- [ ] **客戶主題由 Custom Properties 驅動** — 共用元件只讀取主題變數，不複製客戶規則
- [ ] **響應式尺寸使用 rem/em** — 版面、間距與字級避免固定 px；1px 邊線等視覺細節可保留
- [ ] **全域設定必須集中驗證** — 禁止功能模組直接依賴未檢查的 `window.*` 設定
- [ ] **必要 DOM 在啟動時驗證** — 缺少節點時列出明確名稱，不延後成 null dereference
- [ ] **瀏覽器儲存錯誤必須可見** — localStorage 讀寫、配額及 JSON 錯誤不可靜默忽略
- [ ] **輸出編碼依語境選擇** — HTML text 與 attribute 使用各自 encoder，禁止沿用至 script/style/URL context
- [ ] **非同步操作必須有可見回饋** — 搜尋、匯出與複製使用 inline status + Toast；長操作按鈕顯示 loading 並防止重複觸發
- [ ] **動畫必須尊重使用者偏好** — transition/animation 同時提供 `prefers-reduced-motion` 降級，鍵盤操作需維持可見 focus

---

## 8. 💬 Code Comment Rules

### 函式層級
每個函式開頭必須有，使用 `【用途】` prefix。
```javascript
// 【用途】依採單號碼與數量生成不重複的四位流水號清單
function getNextSerial(poNumber, count) { ... }
```

### 邏輯區塊層級
重要的判斷 / 迴圈 / 運算必須有。
```javascript
// 若欄位包含箭頭符號，取最後一段作為有效值
if (arrowPattern.test(text)) { ... }
```

### CONFIG 欄位層級
每個屬性加上說明。

### 不需註解的情況
一眼就懂的單行賦值、標準 DOM 操作。

---

## 9. 📁 Project File Structure Reference

所有專案說明文件皆放置於 `doc/` 目錄中：
- `doc/agent.md` - 開發流程指南
- `doc/architecture.md` - 系統架構與業務規則
- `doc/task.md` - 任務清單與進度
- `doc/debug.md` - 錯誤排查與已知問題
- `doc/update.md` - 更新紀錄
- `doc/front-end map.md` - 前端模組與資料流
- `doc/back-end map.md` - 後端 API、服務與組態地圖
- `doc/customer-rules-summary.md` - 現行客戶匯入、查詢、生成與匯出規則
- `doc/source-rules-spec.md` - 可配置來源完整參數規格
- `doc/source-rules-stage2.md` ～ `source-rules-stage5.md` - 基本規則、預覽、進階匯入、比較遷移與部署
- `doc/source-search.md` - 自訂來源通用搜尋與 DEG 綁定
- `doc/existing-source-rules-editor.md` - 內建來源候選及特殊來源限制
- `doc/old file/` - 歷史文件，依頂部現況指引查閱

---

## 10. 📑 Session Context Quick Reference

| 情境 | 必帶文件 |
|------|----------|
| 實作新 Task | `doc/architecture.md` + `doc/task.md` + 相關源碼 |
| 修 Bug | `doc/architecture.md` + `doc/debug.md` + 相關源碼 |
| 重構 / 大改 | `doc/architecture.md` + `doc/task.md` + 所有相關源碼 |

## 2026-09-14 現況同步

- 出貨更新：首頁「更新資料」啟動背景合併程式，每秒輪詢進度，成功後重新載入總表；最後更新時間取自檔案 mtime，以台北時間顯示。
- 合併來源包含營邦、倫飛、超恩、KOYA、富弘年、勤誠；富弘年已接入首頁通用工單搜尋與完整資料預覽，但沒有序號／匯出流程；勤誠命中後提供客序／MAC 面板。
- KOYA 型號保存 Model／PN／full PN；NYX 保存 Model／PN。PO／LOT 分別由月份對照維護；NYX 目前只有主檔維護，未接入出貨查詢與匯出。
- 資料來源設定保存於 SQLite，支援九個來源的路徑及適用的工作表、檔名關鍵字、回溯檔案數；重設恢復當前環境變數或程式預設值。
- 後端服務由 FastAPI lifespan 初始化並透過 Depends 注入；Customer Enum、ApiResponse[T]、輸入上限、JSON logging、WAL 與 SQLite 交易已實作。
- Docker 資料庫掛載為 /app/data；網路磁碟掛載為 /mnt/netdisk。Linux systemd 提供獨立資料目錄與資料庫備份／修復腳本。
- 本次同步依據目前工作樹（包含未提交及新增檔案），不代表已部署。主檔與來源維護已從 app.js 抽離；多客戶查詢／匯出協調與 Docker 非 root 使用者仍待處理。

### 文件同步與驗證規則

更新文件時同時檢查 git diff 與未追蹤新增檔案，既有修改應保留。API、資料表、設定與功能狀態須與目前原始碼一致；測試只記錄實際執行結果，未部署或未驗收項目保留待辦。現行文件統一版本與日期，歷史文件保留原始版本並加現況連結。後端完整驗證由根目錄執行 `.venv/Scripts/python -m pytest backend/tests -q`；前端執行 `npm test`；部署清單執行 `.venv/Scripts/python backend/app/tools/shipment_check.py --check --manifest deploy/shipment-release.json`。同步文件不等於正式部署或授權提交全部工作樹。

### 超恩 BIOS/FW 分享連結（2026-09-14 現況）

`GET /api/vecow-link` 讀取、`PUT /api/vecow-link` 儲存 `{ "url": "https://…" }`；空白移除，最長 2000 字元，只接受無帳密的有效 HTTP(S) 網址。`VecowLinkService` 使用 SQLite `vecow_link` 單列（id=1），lifespan 初始化後由 router 從 app.state 取得。`js/modules/vecowLink.js` 管理維護表單、載入與連結顯示；首頁僅命中超恩時顯示，超恩工作區亦有入口，未設定時隱藏，新頁開啟使用 noopener noreferrer。此分享網址獨立於合併器 BIOS Excel 檔案路徑。維護入口以 Ctrl+Shift+D 切換顯示。

## v0.3.61 現況補充（2026-09-14）

本次以目前未提交工作樹核對，保留之前的修改紀錄。新增泉影 DEG 獨立生成面板、三種編碼規格、日期帶入、整批複製、Excel 下載與生成歷史；新增深色／淺色／彩色外觀選擇。後端允許七個 customer（原六客戶加 deg），前端 CUSTOMERS registry 與聚合搜尋仍為原六客戶，DEG 由獨立面板操作；NYX 仍僅提供主檔與月份維護。API 仍為 27 組 Method／Path，資料庫仍為八個表，DEG 重用 SN／export／history API 與既有歷史表。

### 本次文件與驗證要求

DEG 的手動起號、歷史計數與重複序號限制須同時反映於架構、任務、代碼地圖與排查文件。部署需包含 assets/deg，六客戶 registry 不應因後端七個 customer 而記為已整合 DEG 聚合搜尋。僅記錄實際測試結果，完整測試收集失敗不得寫成驗收通過；本次僅同步文件，保留現有程式修改。

## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

### v0.3.79 文件與發布流程

來源規則變更須同步規格文件、架構、前後端地圖、任務、更新與 debug，並區分「工作樹已實作」「測試資料通過」「正式資料比較」「已部署」四種狀態。修改 release 清單內任一檔後要重建同批 SHA256 清單；以 systemd 服務帳號執行 check，必要時再 compare。退出碼 2 或 hash／MIME 錯誤不得視為成功。

功能驗收順序：未保存設定預覽 → 保存／重載 → 更新資料 → 查看逐來源結果 → load-source／首頁搜尋 → 對應生成。舊客戶候選只逐一開啟，差異即 fallback；超恩、KOYA 保留專用流程。更新文件不得把本機生成 fixture 等同正式資料，也不得因後端 Enum 有 8 個值就宣稱所有客戶共用同一搜尋或生成流程。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
