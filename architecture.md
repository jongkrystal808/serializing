# Project Architecture

**Project:** SN-GENERATOR（序號產生器）  
**Version:** 0.3.0  
**Last Updated:** 2026-03-12

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
- 一次上傳共用 Excel，前端會同步解析四個客戶的 sheet，切換客戶不需重傳。

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
- openpyxl（Excel 讀取/輸出）
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

### 4.1 一次上傳共用 Excel
1. 使用者在任一客戶頁點「上傳共用 Excel」。
2. 前端呼叫 `/api/excel/parse` 四次（`yingbang/lunfei/bng/chg`，各自 sheetName/parseRules）。
3. 四客戶 rowData 同步寫入前端 state。
4. 切換客戶頁籤時，直接使用已載入 rowData，不需再次上傳。

### 4.2 查詢與生成
1. 各客戶依自身查詢欄位（工單或 MO）在 rowData 搜尋。
2. 生成按鈕呼叫 `/api/sn/generate`。
3. 需要留痕時再呼叫 `/api/history/upsert`（record-only 或補充記錄）。
4. 匯出呼叫 `/api/export`，後端直接回傳附件流。

### 4.3 歷史記憶面板
1. 「查看歷史」呼叫 `GET /api/history/{customer}`。
2. 表格顯示 `serial_history.last_serial`，前端格式化為 `N（共 N 筆）`。
3. 單筆重置呼叫 `POST /api/history/reset`。

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

### 7.4 KOYA
- label 依數量重複列（前端組裝）
- 生成遞增 key：工單
- 匯出：雙 sheet（`SN` + `BOX`）

---

## 8. Parse Rules

- `arrow`：欄位含 `->` / `→` / `>` 時取最後段值
- `trim`：字串修剪

各客戶目前設定：
- 營邦：`arrow`
- 倫飛：`arrow`
- 超恩：`trim`
- KOYA：`trim`

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
- 營邦以工單、超恩以 MO、倫飛維持週別 key、KOYA 維持工單
- 歷史面板欄位命名與現場語意一致

---

## 11. Version History

- **0.2.x**：前端多客戶架構 + FastAPI 化（T20~T26）
- **0.3.0**（2026-03-12）：
  - 文件全面對齊現況（API + SQLite + Nginx）
  - 補充「一次上傳共用 Excel」流程
  - 更新歷史 key 規則（營邦=工單、超恩=MO）
  - 明確化歷史欄位顯示來源（`last_serial`）

---

*This document reflects the current implementation state.*
