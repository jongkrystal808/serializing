# Update History / 更新紀錄

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.79
**Last Updated:** 2026-09-18

---

## v0.3.79 (2026-09-18，工作樹現況同步)
- refactor(frontend): 將 KOYA／NYX 型號與月份主檔維護抽至 `masterDataMaintenance.js`，來源設定、更新進度與規則預覽抽至 `sourceMaintenance.js`；`app.js` 保留流程協調。
- feat(generic-preview): 後續新增的通用來源自動加入首頁搜尋並使用超恩式分類卡片與原始資料頁籤，不需新增客戶分支。
- feat(preview): 勤誠與富弘年首頁結果沿用超恩式摘要、分類資料卡、預覽／原始資料頁籤與逐欄／整區複製。
- fix(dcg): 內建富弘年工作表接入 `load-source` 與首頁通用工單搜尋／完整預覽；通用來源不啟用原六客戶匯出或序號歷史。
- feat(source): 完成 version 1 可配置來源規則、未保存預覽、逐來源更新結果、進階補值／拆列／郵件與自訂來源建立。
- feat(search): 自訂來源自動加入首頁通用搜尋；支援指定欄、客戶關鍵字、DEG 唯一綁定、多筆全欄預覽。
- feat(migration): 營邦／倫飛／富弘年／勤誠候選規則、逐次 matched/fallback；超恩／KOYA blocked；加入唯讀部署、MIME、雜湊、權限與真實資料 compare 工具。
- feat(fzg): 勤誠客序與 MAC 原子流水號、狀態、剩餘量、複製及確認重設，新增兩個 SN API。
- feat(api): 新增來源 preview/create、Excel load-source、FZG status/reset；API Method／Path 總數由 27 增至 32。
- test: `npm test` 的 7 組前端回歸全部通過（含 Playwright）；後端完整測試 `114 passed`，74 個 Python 檔語法解析通過。
- deploy: release manifest 更新為 0.3.79，本機 `shipment_check.py --check` 回傳 `errors: []`；正式伺服器、服務帳號與真實網路磁碟資料仍待驗收。
- docs: 更新 `doc` 全部 22 份 Markdown，現行文件統一為 0.3.79／2026-09-18；歷史正文保留並更新頂端現況提示。

## v0.3.49 (2026-09-14，工作樹現況同步)
- feat(shipment): 背景合併六個來源，首頁提供更新進度與台北時間最後更新資訊，成功後自動重新載入總表。
- feat(source): 九個資料來源設定保存 SQLite，支援路徑、工作表／檔名規則及回溯數；新增查詢、更新與重設 API。
- fix(data): XLSX 暫存檔完成格式處理後原子取代；部分來源失敗嘗試沿用旧資料，全失敗不更新。超恩支援回覆郵件局部更新與多工單拆列。
- refactor(backend): lifespan／Depends 管理服務，Customer Enum、ApiResponse[T]、Field 驗證與 JSON request logging；SQLite WAL、BEGIN IMMEDIATE、連線關閉及倫飛週別 key 一致性。
- fix(deploy): Docker DB volume 對齊 /app/data，使用 NETDISK_PATH 掛載網路磁碟；systemd StateDirectory 與資料庫備份／修復腳本。
- feat(ui): KOYA 主檔／月份修改後清除舊查詢選取，維護入口顯示切換、面板 Escape 與頁籤鍵盤／ARIA 支援，補充維護面板及進度樣式。
- test: 新增 API、後端設計、來源設定、合併更新及 pytest T27 整合測試，requirements 補充 pytest/httpx 與郵件／表格處理套件。
- docs: 同步 doc 全部文件，校正 27 組 API、8 個資料表及 T73～T79 進度；old file 保留歷史內容並新增現況指引。版本號為文件紀錄，不修改 API app_version（仍為 0.1.0）。

## v0.3.48 (2026-09-10)
- refactor(koya/nyx): PO 與 LOT 從 Model 主檔拆出，改為依月份維護
- feat(month): 從共用 Excel「KOYA出貨」自動新增月份；KOYA 帶入 PO，NYX LOT 預設空白且可編輯
- feat(api): 新增 `/api/monthly-reference/{customer}` 查詢、儲存與刪除 API，以共用 SQLite 表保存 KOYA／NYX 月份對照
- test(api): 新增月份空值、改名、更新與刪除測試；完整後端測試 29 passed

## v0.3.47 (2026-09-10)
- feat(nyx): 首頁新增「NYX 型號維護」面板，支援 `Model / PN` CRUD
- feat(api): 新增 `/api/nyx-model` 查詢、儲存與刪除 API，資料持久保存於 SQLite `nyx_model`
- feat(data): 首次建表寫入 `CZG201-XXXX`～`CZG206-XXXX` 六筆族群規則
- test: 後端完整測試 28/28 與 JavaScript 語法檢查通過

## v0.3.46 (2026-09-10)
- feat(chg): 首頁新增「KOYA 型號維護」面板，可直接新增、編輯、刪除 `Model / PN / full PN`
- feat(api): 新增 `/api/koya-model` 查詢、儲存與刪除 API，資料持久保存於 SQLite `koya_model`
- feat(data): 首次建表寫入 `CHG021-XXXX`～`CHG025-XXXX` 五筆族群規則；以 Model 完整值或 XXXX 前綴對應「KOYA出貨」，主檔覆蓋 `PN / full PN`
- test: 後端完整測試 27/27、JavaScript 語法、API CRUD 與瀏覽器主檔對照流程驗收通過

## v0.3.45 (2026-09-09)
- feat(ui): 新增右上角 success/error/info Toast；搜尋、匯出、複製同時保留 inline status，Toast 提供主要全域回饋
- style(ui): 按鈕加入 hover/active/loading 與至少 2.5rem 觸擊高度；搜尋框加入 focus、清除按鈕及 autofocus；設定／歷史面板加入平滑進出場
- feat(a11y): loading 使用 `aria-busy`，Toast 使用 `aria-live` + status/alert roles，所有動畫與平滑捲動支援 `prefers-reduced-motion`
- feat(shortcuts): 首頁搜尋框支援 `Ctrl+Enter` 匯出；`Escape` 收合序號設定並將焦點還原至觸發按鈕
- feat(flow): 搜尋完成自動捲至首頁預覽，匯出完成捲回狀態列；匯出流程回傳成功狀態，修正失敗仍誤報完成
- fix(config): SQLite 預設路徑改由 `config.py` 位置解析為絕對路徑，支援 `DB_PATH` 覆寫；Docker DB volume 對齊 `/app/data`
- test: JavaScript syntax、前端 P1 regression、diff check 與瀏覽器搜尋／Toast／複製／Escape／390px 響應式 QA 通過；console 無錯誤

## v0.3.44 (2026-09-09)
- feat(search): 倫飛與 BNG 的 MO 恰好命中 2 筆時彈出警示，首頁與客戶狀態提示改為紅色粗體
- feat(preview): 顯示兩張可點擊資料預覽卡，支援第 1／2 筆切換並標示目前選擇
- fix(flow): 使用者選取後更新 `state.currentRow`，生成、匯出與 BNG 收據統一使用目前選取列；重新渲染保留選取索引
- fix(home): 首頁切換命中列時同步更新底層客戶預覽與首頁 DOM clone，且切換過程不重複彈出命中警示
- style(a11y): 雙預覽採桌面雙欄／行動版單欄，選項提供 `aria-pressed` 狀態
- test: JavaScript syntax、diff check 與前端 P1 regression 通過

## v0.3.43 (2026-09-09)
- refactor(ui): 移除 `app.js` 所有直接 `innerHTML` 讀寫，動態模板統一經 `dom.js` 的 DocumentFragment boundary 替換
- fix(ui): 首頁預覽同步改為 clone DOM 節點，避免把既有內容序列化後再次解析
- fix(security): Excel 檔名與例外訊息進入模板前使用 HTML 文字語境 encoder
- test: 前端 regression 新增 `app.js` 禁止直接讀寫 `innerHTML` 的靜態防線；JavaScript syntax、前端 P1 與後端 10 項測試通過

## v0.3.42 (2026-09-09)
- refactor(ui): Lunfei、BNG、CHG 成功預覽共用資料驅動 shell；模組模板統一經 DocumentFragment boundary 更新
- fix(ui): 狀態更新改用 `classList.toggle()`，避免清除 `.status-message` 等語意 class
- fix(init): 新增 validated customer registry 與必要 DOM fail-fast 檢查，移除功能模組對未驗證 `window.CUSTOMERS` 的直接依賴
- fix(storage): localStorage 權限、配額及 JSON 損壞不再靜默，統一回報首頁狀態列
- refactor(core): `homeController` 改用集中 customer constants；BNG 備註改用容錯 regex；HTML attribute 使用獨立 encoder
- test: 擴充前端 P1 regression，涵蓋 registry、DOM、storage、BNG parser、context encoder、WET renderer 與 magic string 防回歸

## v0.3.41 (2026-09-09)
- refactor(css): 移除 `main.css` 的 ID selector，改由 index.html 提供低特異性語意 class；既有 id 保留給 JavaScript DOM 定位
- refactor(css): 六客戶首頁主題統一設定 `--home-theme-accent`，surface 與 status 共用同一組樣式規則
- refactor(css): 版面、控制元件、間距、字級與 breakpoint 由固定 px 轉為 rem；僅保留像素邊線與膠囊圓角
- test: 擴充前端 P1 regression，防止 ID selector、主題變數缺漏及固定版面 px 值回歸

## v0.3.40 (2026-09-09)
- fix(core): 500 錯誤對外只回傳固定 `INTERNAL_ERROR`，完整例外與 traceback 改由伺服器 `logger.exception` 記錄
- fix(excel): Excel 上傳新增整體 request body、實際檔案 20 MiB 與 XLSX 解壓後 100 MiB 三層限制；上限可由環境變數設定
- fix(export): `Content-Disposition` 檔名先清除 ASCII 控制字元、引號與反斜線，再產生 ASCII fallback 與 RFC 5987 編碼值
- test: 新增 5 項安全回歸測試；後端 P0/P1 unit 10/10、T27 integration 7/7 通過

## v0.3.39 (2026-09-09)
- perf(api): 將 Excel、Export、History、SN 與 Print Notice 的同步 I/O handler 改為普通 `def`，交由 FastAPI Thread Pool；輕量 health check 保持 async
- perf(ui): `bindSheetCopyCellsIn()` 改為預覽 root 單一事件委派，避免大表格建立數千個 click listener，並防止重複綁定
- refactor(ui): 新增 `previewCustomTabs.js`，集中自訂頁籤 localStorage、舊 HTML 遷移與 CRUD；`app.js` 由 3,571 行降至 3,355 行
- test: 新增 2 項後端 route execution regression 與前端事件委派測試；P0/P1 unit 5/5、T27 integration 7/7 通過

## v0.3.38 (2026-09-09)
- fix(core): 修復 P0 序號競態、CORS 與自訂頁籤 XSS（commit `3e1fb8c`）
  - `HistoryService.upsert_entry()` 改用 SQLite 原子 `UPSERT ... RETURNING`；`SnService` 先保留資料庫區間再生成序號，支援多 Worker 唯一性
  - CORS 改由 `CORS_ALLOWED_ORIGINS` 明確列舉，預設允許 localhost:8080，並拒絕 `*`
  - 自訂頁籤改存純文字；舊版 HTML 啟動時安全遷移，contenteditable 封鎖 HTML 貼上與拖放
  - 新增 `test_p0_regressions.py`：200 筆並行流水號唯一性與 3 項 CORS 防護驗證通過；既有 T27 整合測試 7/7 通過

## v0.3.37 (2026-09-09)
- fix(export): Excel 匯出預設檔名副檔名由 `.xls` 修正為 `.xlsx`
  - 修正後端 `export_service.py` 與 `export.py` 預設檔名
  - 修正前端 `app.js`、`api.js` 共 6 處 fallback 檔名

## v0.3.36 (2026-05-11)
- KOYA（CHG）預覽窗格改為「檢查清單式 Copy Panel」
- Label / Box Label 分區新增「全部複製」與單列複製回饋
- 預覽操作模型對齊超恩，降低跨客戶操作切換成本

## v0.3.35 (2026-05-11)
- 超恩（BNG）預覽窗格改為「檢查清單式 Copy Panel」
- 分區支援「全部複製」、單列 icon 複製與複製成功回饋
- 重要數值欄位新增檢查狀態，序號類值改為等寬字體

## v0.3.34 (2026-05-11)
- KOYA（CHG）新增 `工單月份` 欄位映射
- 預覽窗格副標題新增 `工單月份` 條件顯示（空值隱藏）

## v0.3.33 (2026-05-11)
- 超恩（BNG）新增 `來源` 欄位映射（拆分標記）
- 預覽窗格標題區新增條件標示：`來源` 有值才顯示

## v0.3.32 (2026-05-01)
- `app.js` 二階段拆分：首頁聚合流程抽離為 `homeController.js`
- 新增 `customerColumns.js` 共用客戶欄位解析與取值
- 主流程檔保留依賴注入與事件掛接，降低單檔複雜度

## v0.3.31 (2026-05-01)
- `ui.js` 二階段拆分：抽離客戶預覽渲染到 `uiPreviewRenderers.js`
- `ui.js` 縮減為通用綁定與聚合出口
- 補充預覽渲染拆分決策（ADR-026）

## v0.3.30 (2026-05-01)
- `ui.js` 拆分為 `uiClipboard.js` 與 `uiHistory.js`
- `ui.js` 改為聚合入口，保留既有 export 介面
- 補充 UI 職責拆分決策（ADR-025）

## v0.3.29 (2026-05-01)
- `app.js` 拆檔第一階段：抽離 `serialSettings`、`bngReceipt` 模組
- 序號設定運算與收據模板從主流程檔移出
- 補充分層拆檔決策（ADR-024）

## v0.3.28 (2026-05-01)
- 移除未使用 UI 匯出包裝函式 `renderSerialHistoryTable()`
- 統一走 `renderSerialHistoryTableIn()` 呼叫路徑
- 補充 UI 無引用匯出清理決策（ADR-022）

## v0.3.27 (2026-05-01)
- 移除未使用前端相容模組（`sourceBinding/storage/customerEngine`）
- `excel.js` 收斂為現行流程使用函式，刪除舊前端匯出/讀檔遺留
- 補充冗餘移除決策（ADR-021）

## v0.3.26 (2026-05-01)
- 修正整串序號複製時「生成數量不正確」誤判
- 序號生成函式改為兼容 `count` / `countText`
- 補充參數兼容決策（ADR-020）

## v0.3.25 (2026-05-01)
- 序號生成設定新增「複製整串序號（純文字）」按鈕
- 依目前設定生成整批序號並一次複製到剪貼簿
- 補充整串純文字複製決策（ADR-019）

## v0.3.24 (2026-05-01)
- 首頁「已命中」狀態訊息樣式放大
- 命中成功訊息新增 success 樣式
- 補充命中成功訊息視覺強化決策（ADR-018）

## v0.3.23 (2026-05-01)
- 修正首頁機種模式多筆命中時無法選擇問題
- 首頁預覽窗格新增機種候選清單（可直接點選）
- 補充機種多筆命中就地可選決策（ADR-017）

## v0.3.22 (2026-05-01)
- 修正首頁機種模式（hmg/clg）查不到資料問題
- 機種比對改為客戶獨立欄位解析（不受 active customer 影響）
- 補充機種聚合搜尋決策（ADR-016）

## v0.3.21 (2026-05-01)
- 序號生成設定文案移除「Cubepilot」限定詞，改為通用入口
- 預估生成序號預覽改為內嵌在序號生成設定卡片
- 補充設定入口通用化與預覽收斂決策（ADR-015）

## v0.3.20 (2026-05-01)
- 首頁命中結果新增客戶色彩區分（營邦/倫飛/超恩/KOYA）
- 色彩主題套用至首頁狀態列與預覽窗格邊框
- 補充首頁色彩主題架構決策（ADR-014）

## v0.3.19 (2026-05-01)
- 首頁新增搜尋類型篩選（工單/MO、機種 Model）
- 聚合搜尋依模式分流，避免工單與機種混搜誤命中
- 補充顯式類型篩選架構決策（ADR-013）

## v0.3.18 (2026-05-01)
- 修正首頁聚合搜尋「跨客戶工單查不到」問題
- 聚合比對改為客戶獨立欄位解析（不再依賴 active customer）
- 補充客戶上下文無關搜尋決策（ADR-012）

## v0.3.17 (2026-05-01)
- 首頁新增「產生收據（BNG）」入口，位置在「生成序號&匯出」旁
- 按鈕僅在命中 BNG 工單時啟用
- 補充首頁 BNG 收據入口決策（ADR-011）

## v0.3.16 (2026-05-01)
- 首頁搜尋升級為全客戶聚合（工單/MO + hmg/clg 機種）
- 首頁歷史與匯出改為跟隨命中客戶分流
- 補充聚合搜尋架構決策（ADR-010）

## v0.3.15 (2026-05-01)
- 首頁改為單一操作區，支援「工單 + 赫星機種」共用搜尋
- 首頁只保留核心入口（歷史/搜尋/匯出 + Cubepilot 設定入口）
- 多客戶 workspace 退居相容層，不作為首頁主視圖

## v0.3.14 (2026-05-01)
- 首頁查詢區改為一致化操作列（歷史 / 搜尋 / 匯出）
- Cubepilot 新增「序號生成設定」入口式展開/收合
- 文件同步 `PROCESS.md` 新流程與現行前端 UI 入口

## v0.3.13 (2026-03-18)
- T42 落地：新增 `hmg` 前後端流程（解析/查詢提示/HEX 匯出/歷史）
- `hmg` 匯出模板固定 `HEX` sheet，欄位 `Model/PN/EAN Code/PCBA`
- 整合測試腳本新增赫星案例（T27-05）

## v0.3.12 (2026-03-18)
- 新增赫星（`hmg`）架構規格（Sheet1/Model 查詢/無 SN/HEX 匯出）
- 明確化赫星歷史 key（`sn_history`/`generation_history` 皆為 Model）
- 新增客戶規則隔離原則：`hmg` 規格不得影響既有客戶

## v0.3.11 (2026-03-17)
- Cubepilot 支援「無 Excel 直出」模式（上傳檔案改為選填）
- 生成按鈕改為依序號設定有效性啟用，無需先查詢機種

## v0.3.10 (2026-03-17)
- Cubepilot 新增 `1–6 循環進位制`（`x6 -> 下一段 x1`）
- 生成與生成前預覽同步支援新進制

## v0.3.9 (2026-03-17)
- Cubepilot 新增 `0–6 循環進位制`（`x6 -> 下一段 x0`）
- 生成與生成前預覽同步支援新進制

## v0.3.8 (2026-03-17)
- Cubepilot 序號區段預覽時機改為「生成前即時預覽」
- 序號設定欄位變更時即時更新前 10 / 後 10 筆

## v0.3.7 (2026-03-17)
- Cubepilot 生成後預覽新增「前 10 筆 / 後 10 筆」序號區段
- 預覽顯示最近一次生成結果，便於現場快速抽查

## v0.3.6 (2026-03-17)
- Cubepilot 匯出 sheet 名稱固定為 `MES`
- Cubepilot 查詢改為「關鍵字提示 + 可點選清單」，移除 prompt 強制選擇
- Cubepilot 預覽空值欄位自動隱藏
- Cubepilot 序號設定欄位調整為「數量在最後」

## v0.3.5 (2026-03-17)
- `POST /api/excel/parse` 新增 `.xls` 原生支援（保留 `.xlsx`）
- Backend Excel stack 明確為 `openpyxl + xlrd`
- 不可解析檔案錯誤訊息改為「請確認為有效的 `.xls` 或 `.xlsx`」

## v0.3.4 (2026-03-17)
- 新增 Cubepilot 客戶（`clg`）規格與流程
- 補充 `機種名 contains` 查詢與單筆選擇規則
- 補充手動序號生成規格（前綴/起始/數量/後綴/進制）
- 歷史 key 規則新增 `clg=機種名`，`generation_history` 對 clg 不使用

## v0.3.3 (2026-03-16)
- 預覽區由「右側備註槽」改為「可新增自訂頁籤」模型
- 新增 `+ 新增頁籤` 操作，頁籤名稱可自定義，並可單頁籤移除
- 自訂頁籤內容改為在內容區直接編輯，失焦自動儲存到 localStorage（`sn_preview_custom_tabs`）

## v0.3.2 (2026-03-16)
- 新增超恩收據套印列印流程（查詢後可直接列印）
- 收據欄位映射與 `機種名稱 " 1."` 前後拆分規則文件化
- 收據列印版型尺寸調整為約 A4 直向高度的 1/5，標題欄位採淺灰底

## v0.3.1 (2026-03-13)
- 超恩 `SN` sheet 改為 `uuid1/uuid2` 拆欄與 `機種名稱` 欄位
- UUID 拆分規則明確化為 `前15碼 + 後17個F`
- 新增四客戶預覽備註槽，改由 `CUSTOMERS.previewNote` / `previewNoteHtml` 驅動

## v0.3.0 (2026-03-12)
- 文件全面對齊現況（API + SQLite + Nginx）
- 補充「一次上傳共用 Excel」流程
- 更新歷史 key 規則（營邦=工單、超恩=MO）
- 明確化歷史欄位顯示來源（`last_serial`）

## 0.2.x
- 前端多客戶架構 + FastAPI 化（T20~T26）
# 2026-09-14 — 超恩 BIOS/FW 一覽表連結

- 首頁超恩查詢結果及超恩頁籤新增「VECOW各機種BIOSFW測試程式一覽表」連結。
- 使用既有 Ctrl+Shift+D 維護入口，新增「超恩連結維護」；網址存於 SQLite，留空儲存可移除。
- 僅接受 HTTP(S) 分享網址，未設定時隱藏連結，點擊後在新分頁開啟。

### 超恩 BIOS/FW 分享連結（2026-09-14 現況）

`GET /api/vecow-link` 讀取、`PUT /api/vecow-link` 儲存 `{ "url": "https://…" }`；空白移除，最長 2000 字元，只接受無帳密的有效 HTTP(S) 網址。`VecowLinkService` 使用 SQLite `vecow_link` 單列（id=1），lifespan 初始化後由 router 從 app.state 取得。`js/modules/vecowLink.js` 管理維護表單、載入與連結顯示；首頁僅命中超恩時顯示，超恩工作區亦有入口，未設定時隱藏，新頁開啟使用 noopener noreferrer。此分享網址獨立於合併器 BIOS Excel 檔案路徑。維護入口以 Ctrl+Shift+D 切換顯示。

本次驗證：前端 P1 regression 通過；系統 Python 3.14 執行 pytest 因缺少 python-multipart 出現 collection errors，未取得後端完整通過結果。本機既有 .venv 為 Python 3.9。前端資源目前使用 app.js v0.3.60／main.css v0.3.58 快取參數，文件 v0.3.49 為本次文件同步紀錄，API app_version 仍為 0.1.0。

## v0.3.61 現況補充（2026-09-14）

本次以目前未提交工作樹核對，保留之前的修改紀錄。新增泉影 DEG 獨立生成面板、三種編碼規格、日期帶入、整批複製、Excel 下載與生成歷史；新增深色／淺色／彩色外觀選擇。後端允許七個 customer（原六客戶加 deg），前端 CUSTOMERS registry 與聚合搜尋仍為原六客戶，DEG 由獨立面板操作；NYX 仍僅提供主檔與月份維護。API 仍為 27 組 Method／Path，資料庫仍為八個表，DEG 重用 SN／export／history API 與既有歷史表。

### 本次新增與驗證

- feat(deg): 泉影 HL／Pizza Box／Pizza Carton 生成、日期帶入、整批複製、Excel 下載與歷史；重用現有 API／歷史表，加入格式與溢位驗證。
- feat(ui): 深色／淺色／彩色主題選擇与本機偏好保存；新增四張 M.2 對照圖。
- fix(excel): 共用 _cell_to_text 保留數值 0，整數型浮點文字移除 .0。
- test: DEG 服務測試 12 passed；DEG 日期、VECOW 連結與前端 P1 三組回歸通過。完整 pytest 因 Python 3.14 環境缺少 python-multipart 出現七個 collection errors，包含 API 測試，尚未取得完整通過結果。本次未重跑瀏覽器視覺 QA。
- docs: 全部 14 份文件同步至目前 v0.3.61 現況；中間版本未推定發布紀錄，API app_version 仍為 0.1.0。

## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
