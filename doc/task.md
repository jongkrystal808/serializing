# Task Backlog

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.43
**Last Updated:** 2026-09-09

---

> **📌 How to use this file:**
> - 每次開發前先看 `🔄 In Progress`，確認目前進行中的任務
> - 完成一個 Task 後將狀態改為 `✅ Done`，並填入完成日期
> - 新任務加入 `⬜ Todo`，並指定所屬模組與優先順序
> - 此文件只記錄 **WHAT to do**，WHY & HOW 請參考 `ARCHITECTURE.md`

---

## 🔄 In Progress

### T69 — P1 效能與架構改善
**Module:** Backend / Frontend / Performance
**Priority:** 🟡 Medium

**Sub-tasks:**
- [x] 將含同步 I/O 的 async 路由改為同步 `def`，保留輕量 health async（完成：2026-09-09）
- [x] 前端表格儲存格改用 O(1) 事件委派（完成：2026-09-09）
- [x] 抽離自訂頁籤持久化、遷移與 CRUD 至 `previewCustomTabs.js`（完成：2026-09-09）
- [ ] 持續拆分 `app.js` 中的客戶流程控制器與匯出協調邏輯
- [ ] 修正資料庫路徑為動態絕對路徑（config.py）
- [x] 移除 500 錯誤中的內部資訊洩漏，完整堆疊改記錄於 logger（完成：2026-09-09）
- [x] 加入 request body、實際檔案與 XLSX 解壓後總量三層上傳限制（完成：2026-09-09）
- [x] 修正 Content-Disposition 檔名控制字元注入風險（完成：2026-09-09）
- [x] 將 `main.css` 的 ID selector 改為語意 class（完成：2026-09-09）
- [x] 六客戶首頁主題改由 CSS Custom Property 驅動（完成：2026-09-09）
- [x] 版面、間距與字級的固定 px 改為 rem，保留像素邊線等合理例外（完成：2026-09-09）
- [x] Lunfei／BNG／CHG 成功預覽抽成資料驅動共用 shell（完成：2026-09-09）
- [x] 集中驗證 CUSTOMERS registry 並移除模組對 `window.CUSTOMERS` 的直接依賴（完成：2026-09-09）
- [x] `createUiRefs()` 加入必要 DOM fail-fast 檢查（完成：2026-09-09）
- [x] localStorage 讀寫、容量與 JSON 解析失敗改為使用者可見通知（完成：2026-09-09）
- [x] 模組與 `app.js` 模板集中至 DocumentFragment boundary，預覽同步改用 DOM node clone（完成：2026-09-09）
- [x] `homeController.js` 客戶 key 集中為不可變常數（完成：2026-09-09）
- [x] BNG 機種／備註解析改用容錯 regex 並排除版本號（完成：2026-09-09）
- [x] 新增 HTML attribute 專用 encoder 並明定禁止跨 script/style/URL context 使用（完成：2026-09-09）

**Current Result:** 後端競態、阻塞 I/O 與安全修補完成；CSS 已降低特異性並改用主題變數／rem。前端新增 validated customer registry、DOM fail-fast、observable storage、語境化 encoder 與資料驅動預覽 shell；所有動態模板集中經 DocumentFragment boundary 更新。後端 P0/P1 regression 10/10、T27 integration 7/7 與前端 P1 regression 通過。

---

## ⬜ Todo

### T28 — 部署與交接文件
**Module:** Docs / DevOps
**Priority:** 🟢 Low
**Depends on:** T27

**Sub-tasks:**
- [ ] Update architecture.md, process.md, deployment docs, API usage examples

**Acceptance Criteria:**
- New team members can deploy locally from docs

### T70 — P2 程式碼品質改善
**Module:** Full Stack / Quality
**Priority:** 🟢 Low

**Sub-tasks:**
- [ ] 後端引入 Python logging 模組
- [ ] 定義 Customer(str, Enum) 取代 magic strings
- [ ] ApiResponse 改為 Generic[T]
- [ ] Schema 加入 Field(max_length, gt, le) 驗證
- [ ] SQLite 啟用 WAL 模式
- [ ] 重構前端重複的 render 函式為資料驅動元件
- [ ] 加入 aria-live、ARIA roles 等無障礙屬性
- [ ] CSS 改用 Custom Properties 統一客戶主題
- [ ] 將測試改為 pytest 標準格式
- [ ] Dockerfile 加入非 root 使用者

---

## ✅ Done

### ✅ T68 — P0 安全性與正確性修復（完成：2026-09-09）
**Module:** Backend / Security / SN Service / Frontend
**Notes:** 序號派發改為 SQLite `UPSERT ... RETURNING` 原子保留區間，營邦、倫飛與外部序號流程皆使用資料庫回傳的 `previous/current`，消除多 Worker TOCTOU 重複派號。CORS 改由 `CORS_ALLOWED_ORIGINS` 明確列舉來源，啟用 credentials 時禁止 `*`。自訂頁籤改採結構化純文字儲存與 escape 渲染，舊 HTML 自動轉為文字，並阻擋 contenteditable 的 HTML 貼上／拖放。新增 P0 回歸測試：40 次並行共 200 個流水號全數唯一且連續、CORS 允許／拒絕／萬用字元防呆全通過；既有 T27 七項整合案例全通過。程式修復 commit：`3e1fb8c`。

### ✅ T67 — KOYA 預覽窗格改版為檢查清單式 Copy Panel（完成：2026-05-11）
**Module:** KOYA / UI Preview / Clipboard UX
**Notes:** KOYA 預覽分區（Label / Box Label）改為與超恩一致的檢查清單式 Copy Panel：單列結構為「標籤 + 值 + 右側複製按鈕」，每區提供「全部複製」，並支援單列/整區 `已複製 ✓` 回饋。僅調整呈現與複製交互，不影響既有欄位與匯出邏輯。

### ✅ T66 — 超恩預覽窗格改版為檢查清單式 Copy Panel（完成：2026-05-11）
**Module:** BNG / UI Preview / Clipboard UX
**Notes:** 超恩預覽分區改為檢查清單式 UI：單列結構為「標籤 + 值 + 右側 icon 複製」，各分區新增「全部複製」。序號/MAC/UUID/FW/BIOS 值改為等寬字體，並對 `生產數量 / MAC數量 / MAC板子用量數量` 顯示狀態提示。複製回饋改為 `已複製 ✓`，支援單列與整區複製。

### ✅ T65 — KOYA 預覽新增工單月份欄位（完成：2026-05-11）
**Module:** KOYA / UI Preview / Excel Parse Alias
**Notes:** KOYA（`chg`）新增 `WORK_ORDER_MONTH` 欄位映射，支援 `工單月份/月份/工單月`。預覽窗格副標題改為動態組裝，當工單月份有值時顯示在 `工單/PO/批量` 同列；空值則隱藏。

### ✅ T64 — 超恩預覽新增來源（拆分標記）顯示（完成：2026-05-11）
**Module:** BNG / UI Preview / Excel Parse Alias
**Notes:** 超恩（`bng`）新增 `SOURCE` 欄位映射，支援 `來源/拆分標記/拆分註記`。預覽窗格標題右側新增 `來源：...` 標示，僅在欄位有值時顯示，空值不顯示。

### ✅ T63 — app.js 拆檔第二階段（首頁聚合流程模組化）（完成：2026-05-01）
**Module:** Frontend / Refactor / Modularization
**Notes:** 新增 `homeController.js` 抽離首頁聚合搜尋、首頁歷史整合與首頁匯出/收據分流；新增 `customerColumns.js` 提供客戶欄位解析共用函式。`app.js` 改為依賴注入與事件掛接，保留既有流程行為。

### ✅ T62 — ui.js 拆分（預覽渲染模組化）（完成：2026-05-01）
**Module:** Frontend / UI / Modularization
**Notes:** 將 `ui.js` 中各客戶 `render*Search*` 與預覽共用 helper 抽離到 `uiPreviewRenderers.js`，`ui.js` 保留狀態/事件綁定與聚合 export，`app.js` 介面維持相容。

### ✅ T61 — ui.js 拆分（Clipboard / History）（完成：2026-05-01）
**Module:** Frontend / UI / Modularization
**Notes:** 將 `ui.js` 中剪貼簿綁定與歷史表格邏輯拆分到 `uiClipboard.js`、`uiHistory.js`；`ui.js` 保留聚合 export，`app.js` 不需調整呼叫介面。

### ✅ T60 — app.js 拆檔第一階段（完成：2026-05-01）
**Module:** Frontend / Refactor / Modularization
**Notes:** 抽離 `serialSettings` 與 `bngReceipt` 模組，將序號設定運算與收據模板由 `app.js` 移出，保留既有流程與行為。

### ✅ T59 — 無引用工具函式清理（完成：2026-05-01）
**Module:** Frontend / Utils / Cleanup
**Notes:** 移除 `utils.js` 中已無任何呼叫點的 `parseArrow()`，保留現行流程使用的工具函式集合。

### ✅ T58 — UI 無引用匯出函式清理（完成：2026-05-01）
**Module:** Frontend / UI / Cleanup
**Notes:** 移除 `ui.js` 中無任何呼叫點的 `renderSerialHistoryTable()` 包裝函式，統一使用 `renderSerialHistoryTableIn()`，降低 API 表面積。

### ✅ T57 — 前端冗餘模組清理（完成：2026-05-01）
**Module:** Frontend / Refactor / Cleanup
**Notes:** 對照 `architecture.md` 清除未使用的舊相容模組（`sourceBinding/storage/customerEngine`），並收斂 `excel.js` 只保留現行流程所需函式，降低維護噪音。

### ✅ T56 — 序號整串複製數量判定修正（完成：2026-05-01）
**Module:** UI / Serial Settings / Clipboard
**Notes:** 修正「複製整串序號（純文字）」誤判生成數量無效的問題。序號生成函式改為兼容 `count` 與 `countText` 來源欄位。

### ✅ T55 — 序號設定新增整串純文字複製（完成：2026-05-01）
**Module:** UI / Serial Settings / Clipboard
**Notes:** 在序號生成設定預覽區新增「複製整串序號（純文字）」按鈕，點擊後依目前設定生成全部序號並以每行一筆格式複製到剪貼簿。

### ✅ T54 — 首頁命中狀態字樣放大（完成：2026-05-01）
**Module:** UI / Home Status
**Notes:** 首頁「已命中 ...」訊息新增 success 樣式，字級與字重提升，強化查詢成功回饋可讀性。

### ✅ T53 — 首頁機種多筆命中候選清單（完成：2026-05-01）
**Module:** UI / Search / Home Preview
**Notes:** 修正首頁機種模式在多筆命中時無法選擇的問題。首頁預覽窗格直接顯示可點選候選機種，點選後回填搜尋欄並重跑查詢。

### ✅ T52 — 首頁機種模式聚合搜尋修正（完成：2026-05-01）
**Module:** UI / Search / Home Routing
**Notes:** 修正首頁「機種（Model）」模式查不到資料問題。`hmg/clg` 的 `MODEL` 比對改為客戶獨立欄位解析，不再依賴 active customer 的 `CONFIG.COLUMNS`。

### ✅ T51 — 序號生成設定通用化與預覽內嵌（完成：2026-05-01）
**Module:** UI / Serial Settings / Preview
**Notes:** 首頁「序號生成設定」移除 `Cubepilot` 專用字樣；「預估生成序號預覽」從客戶預覽窗格移到序號設定卡片內，讓設定與預覽同區操作。

### ✅ T50 — 首頁命中客戶色彩區分（完成：2026-05-01）
**Module:** UI / Home Result Theme
**Notes:** 首頁查詢命中後新增客戶主題色：營邦深藍、倫飛綠、超恩紫、KOYA橘。主題色套用到首頁狀態列文字與預覽窗格邊框，未命中或切換搜尋模式時回到中性樣式。

### ✅ T49 — 首頁搜尋新增類型篩選（工單/MO vs 機種）（完成：2026-05-01）
**Module:** UI / Search / Home Routing
**Notes:** 首頁搜尋區新增「工單/MO、機種（Model）」篩選下拉。聚合搜尋改為依模式分流：工單/MO 僅查 `yingbang/lunfei/bng/chg`，機種僅查 `hmg/clg`。同步調整 placeholder 與提示文案，避免混搜造成誤命中。

### ✅ T48 — 首頁聚合搜尋跨客戶命中修正（完成：2026-05-01）
**Module:** UI / Search / Home Routing
**Notes:** 修正首頁聚合搜尋在跨客戶場景下無法命中工單/MO 的問題。原因為聚合比對誤用 active-customer 的 `CONFIG.COLUMNS`；現已改為依目標客戶 profile（`columns/columnAliases`）做欄位解析後比對，確保全客戶集中搜尋可正常命中並分流。

### ✅ T47 — 首頁新增 BNG 收據按鈕（條件啟用）（完成：2026-05-01）
**Module:** UI / BNG Print / Home Routing
**Notes:** 首頁「生成序號 & 匯出」旁新增「產生收據」按鈕，沿用既有超恩收據列印流程。按鈕預設禁用，僅在首頁搜尋命中 BNG 工單且可列印狀態成立時啟用。

### ✅ T46 — 首頁全客戶聚合搜尋（含 clg 機種）（完成：2026-05-01）
**Module:** UI / Search / Routing
**Notes:** 首頁搜尋升級為全客戶聚合：可共同搜尋 `yingbang/lunfei/bng/chg` 工單或 MO，並包含 `hmg` 與 `clg` 機種搜尋。命中後自動分流到對應客戶流程，將預覽同步回首頁；首頁歷史與匯出也改為跟隨目前命中客戶。

### ✅ T45 — 首頁收斂為單一操作區（完成：2026-05-01）
**Module:** UI / Search / HMG / Yingbang
**Notes:** 首頁改為單一操作模式，只保留「查看歷史 / 搜尋 / 匯出」與「序號生成設定（Cubepilot）入口」。搜尋欄支援工單與赫星機種共用查詢，命中後顯示對應預覽窗格；保留原有營邦與赫星匯出流程。

### ✅ T44 — 首頁查詢操作列精簡改版（完成：2026-05-01）
**Module:** UI / Cubepilot / HMG
**Notes:** 查詢區改為首頁式單列操作：左側為「查看歷史」、中間為搜尋欄（含搜尋按鈕）、右側為匯出；保留原本 Enter 與按鈕查詢行為。Cubepilot 新增「序號生成設定（Cubepilot）」入口，點擊後可展開/收合設定卡片，位置固定在搜尋欄下方，維持既有序號生成邏輯。

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
| Phase 17（首頁操作列精簡改版） | 1 | 1 | 0 | 0 |
| Phase 18（首頁單一操作區） | 1 | 1 | 0 | 0 |
| Phase 19（首頁全客戶聚合搜尋） | 1 | 1 | 0 | 0 |
| Phase 20（首頁 BNG 收據入口） | 1 | 1 | 0 | 0 |
| Phase 21（首頁聚合搜尋跨客戶修正） | 1 | 1 | 0 | 0 |
| Phase 22（首頁搜尋類型篩選） | 1 | 1 | 0 | 0 |
| Phase 23（首頁命中客戶色彩區分） | 1 | 1 | 0 | 0 |
| Phase 24（序號設定入口與預覽收斂） | 1 | 1 | 0 | 0 |
| Phase 25（首頁機種模式聚合修正） | 1 | 1 | 0 | 0 |
| Phase 26（首頁機種多筆命中候選） | 1 | 1 | 0 | 0 |
| Phase 27（首頁命中訊息視覺強化） | 1 | 1 | 0 | 0 |
| Phase 28（序號設定整串複製） | 1 | 1 | 0 | 0 |
| Phase 29（序號整串複製判定修正） | 1 | 1 | 0 | 0 |
| Phase 30（前端冗餘模組清理） | 1 | 1 | 0 | 0 |
| Phase 31（UI 無引用匯出清理） | 1 | 1 | 0 | 0 |
| Phase 32（無引用工具函式清理） | 1 | 1 | 0 | 0 |
| Phase 33（app.js 拆檔第一階段） | 1 | 1 | 0 | 0 |
| Phase 34（ui.js 拆分） | 1 | 1 | 0 | 0 |
| Phase 35（BNG 來源欄位預覽） | 1 | 1 | 0 | 0 |
| Phase 36（KOYA 工單月份預覽） | 1 | 1 | 0 | 0 |
| Phase 37（BNG Copy Panel UI 改版） | 1 | 1 | 0 | 0 |
| Phase 38（KOYA Copy Panel UI 改版） | 1 | 1 | 0 | 0 |
| Phase 39（Code Review 2026-09-09） | 3 | 1 | 1 | 1 |
| **Total** | **66** | **63** | **1** | **2** |
