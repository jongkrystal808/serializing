# Project Architecture

**Project:** SN-GENERATOR（序號產生器）  
**Version:** 0.3.13  
**Last Updated:** 2026-03-18

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
- 前端負責 UI/互動/客戶分頁切換。
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
│       ├── excel.js
│       ├── ui.js
│       ├── workOrder.js
│       ├── utils.js
│       ├── sourceBinding.js       # 保留，現行主流程未使用
│       ├── storage.js             # 保留，已非主資料來源
│       └── customerEngine.js      # 保留，現行主流程未使用
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

### 4.7 Excel 上傳持久化與自動恢復
1. 每次透過 `/api/excel/parse` 上傳成功後，後端會將原始檔案與解析參數（sheetName, rules）存入 `backend/data/uploads/` 目錄。
2. 存檔採分類制：`shared`（營邦/倫飛/超恩/KOYA）、`clg`（Cubepilot）、`hmg`（赫星）。
3. 前端載入時（`main()`）自動呼叫 `GET /api/excel/load-last?customer={key}`，若有歷史存檔則直接恢復 rowData。
4. 此機制確保使用者重整頁面後，不需再次上傳即可直接進行查詢操作。

### 7.4 KOYA
- label 依數量重複列（前端組裝）
- 生成遞增 key：工單
- 匯出：雙 sheet（`SN` + `BOX`）

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
- `sheetName`: `Sheet1`
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

---

*This document reflects the current implementation state.*
