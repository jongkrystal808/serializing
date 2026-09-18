> **歷史文件現況補充（2026-09-18／工作樹 v0.3.79）**
> 下文保留當時版本，不代表目前功能或驗收結果。現況已包含來源規則五階段、通用來源自動搜尋與超恩式渲染、富弘年首頁搜尋、勤誠 FZG、DEG，以及主檔／來源維護模組拆分；API 32 組、SQLite 8 表。
> 本機驗證：7 組前端回歸、後端 114 tests、74 個 Python 檔解析及 0.3.79 release check 全部通過；正式伺服器與真實網路磁碟資料尚未驗收。
> 請以 [架構](../architecture.md)、[任務](../task.md)、[更新](../update.md)、[排查](../debug.md)、[規則規格](../source-rules-spec.md)、[遷移](../source-rules-stage5.md) 與 [搜尋](../source-search.md) 為準。

# SN-GENERATOR 使用說明書 / 操作手冊

**Project:** SN-GENERATOR（序號產生器）  
**版本基準:** 0.3.0（API + SQLite + Nginx 架構）  
**最後更新:** 2026-03-13

---

## 1. 系統簡介

SN-GENERATOR 是一套給製造/出貨人員使用的序號工具。  
使用者只要上傳一份共用 Excel，就能在同一頁面切換四個客戶（營邦、倫飛、超恩、KOYA）完成：

- 查詢工單或 MO
- 預覽序號相關欄位
- 生成序號並匯出 Excel
- 查看/重置歷史流水號

---

## 2. 使用前準備

### 2.1 來源檔案

請準備一份包含以下 Sheet 的 Excel（`.xlsx` 或 `.xls`）：

- `營邦出貨`
- `倫飛出貨`
- `超恩出貨`
- `KOYA出貨`

### 2.2 執行環境

- 建議使用 Chrome 或 Edge 最新版
- 建議用 Docker Compose 啟動（最省事）

---

## 3. 系統啟動

### 3.1 建議方式（Docker Compose）

在專案根目錄執行：

```bash
docker compose up --build -d
```

啟動後：

- 系統入口：`http://localhost:8080`
- 健康檢查：`http://localhost:8080/api/health`

停止：

```bash
docker compose down
```

### 3.2 開發模式（後端單獨）

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

---

## 4. 標準操作流程（現場人員）

1. 開啟 `http://localhost:8080`。
2. 點選上方客戶頁籤（營邦 / 倫飛 / 超恩 / KOYA）。
3. 點 `上傳共用 Excel`，選擇來源檔案（系統會一次解析四個客戶資料）。
4. 在查詢框輸入工單或 MO，按 `解析工單`（或 Enter）。
5. 確認預覽窗格內容（可切換 `預覽 / 表格內容 / 生成歷史`）。
6. 按 `生成序號 & 匯出`，下載檔案（預設檔名如 `營邦-SN.xls`）。

補充：

- `查看歷史` 可看所有 key 的目前流水號。
- 在歷史表格可單筆 `重置`。
- 在預覽頁若有歷史頁籤，也可 `清空歷史序號`（針對當前查詢 key）。

---

## 5. 客戶別規則與輸出

| 客戶 | 查詢欄位 | 主要序號規則 | 歷史 key | 匯出檔案 |
|---|---|---|---|---|
| 營邦 `yingbang` | 工單 | `{採單號碼}1{四位流水}` | 工單 | 單 Sheet：`SN`（欄位 `SN/Datecode/PN`） |
| 倫飛 `lunfei` | MO | `106 + 週數(WW) + 62 + 五位流水` | 週別 `YYYY-WNN`（另記錄 MO） | 雙 Sheet：`SN` + `box` |
| 超恩 `bng` | MO | 前端展開區間（SN/MAC/UUID） | MO | 雙 Sheet：`SN` + `BOX` |
| KOYA `chg` | 工單 | 依小張貼紙數量重複列 | 工單 | 雙 Sheet：`SN` + `BOX` |

### 5.1 倫飛特殊型號提醒

- `BAG017-*` / `BAG159-*` / `BAG016-*`：會跳提醒視窗。
- `BAG428-001D`：系統會禁止生成（按鈕不可用）。

### 5.2 超恩區間欄位注意事項

- `MAC Address`、`序號區間`、`UUID區間` 必須是合法區間格式（如 `A ~ B`）。
- `MAC數量`、`生產數量` 與區間展開筆數必須一致。
- `UUID區間` 若填 `0`，會視為無 UUID（輸出顯示「無」）。

---

## 6. 常見問題與排查

### 問題 1：上傳後顯示找不到工作表

可能原因：來源 Excel 缺少必要 Sheet。  
處理方式：確認檔案包含 `營邦出貨/倫飛出貨/超恩出貨/KOYA出貨`。

### 問題 2：查詢不到工單 / MO

可能原因：輸入值與資料不一致、Excel 尚未正確載入。  
處理方式：重新上傳檔案後再查詢，並確認查詢欄位是否輸入正確客戶格式。

### 問題 3：生成失敗（超恩）

可能原因：區間格式錯誤或筆數不一致。  
處理方式：檢查 `MAC數量`、`生產數量` 與區間展開長度是否一致。

### 問題 4：無法下載匯出檔

可能原因：瀏覽器阻擋下載或 API 不可用。  
處理方式：先確認 `http://localhost:8080/api/health` 可開啟，再檢查瀏覽器下載權限。

---

## 7. 資料與備份

- SQLite 主資料庫：`backend/data/sn_generator.db`
- 建議定期備份此檔（含流水號歷史與生成留痕）。
- 若換機部署，可帶著此 DB 檔一起移轉。

---

## 8. API 速查（給開發/維運）

Base URL：`/api`

- `GET /health`
- `POST /excel/parse`（multipart/form-data）
- `POST /sn/generate`（JSON）
- `POST /export`（JSON，回傳附件）
- `GET /history/{customer}`
- `POST /history/upsert`
- `POST /history/reset`

### `POST /sn/generate` 範例（營邦）

```json
{
  "customer": "yingbang",
  "key": "WO001",
  "qty": 2,
  "purchase_order": "PO001"
}
```

### `POST /history/reset` 範例

```json
{
  "customer": "lunfei",
  "key": "2026-W11"
}
```

---

## 9. 相關文件

- `architecture.md`：系統架構與模組設計
- `PROCESS.md`：開發協作流程
- `TASK.md`：任務與進度追蹤
- `DEBUG.md`：除錯紀錄
