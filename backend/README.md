# SN-GENERATOR Backend (FastAPI)

## Run (Dev)

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000
```

## Run (Docker + Nginx)

```bash
docker compose up --build -d
```

- Frontend + API gateway: `http://localhost:8080`
- Health check (through Nginx): `http://localhost:8080/api/health`
- CORS 預設只允許 `http://localhost:8080` 與 `http://127.0.0.1:8080`；部署到其他網域時，以逗號分隔設定 `CORS_ALLOWED_ORIGINS`，不可使用 `*`。
- Excel 上傳檔預設限制 20 MiB（`MAX_EXCEL_UPLOAD_BYTES`），XLSX 解壓後總量限制 100 MiB（`MAX_EXCEL_UNCOMPRESSED_BYTES`）；multipart request 另保留 1 MiB metadata 空間。
- SQLite 預設位於 `backend/data/sn_generator.db`，路徑以 `config.py` 所在位置解析，不受啟動目錄影響；可用 `DB_PATH` 覆寫（相對路徑以 `backend/` 為基準）。
- 單次序號生成的 `qty` 上限為 100,000；超限請求會在 schema 驗證階段拒絕。
- SQLite 啟動時使用 WAL journal mode，寫入交易以 `BEGIN IMMEDIATE` 跨 Worker 序列化。
- HTTP 請求與重要資料異動會輸出單行 JSON 結構化事件；回應包含 `X-Request-ID` 供事故追蹤，日誌層級可用 `LOG_LEVEL` 覆寫（預設 `INFO`）。
- 首頁「更新資料」會在背景重建 `出貨記錄總表.xlsx`，更新期間可關閉或重新整理頁面，回到首頁後仍會接續顯示目前進度。系統同一時間只允許一個更新工作。
- Docker 以 `NETDISK_PATH` 指定網路磁碟的主機端根目錄；Windows 開發環境預設 `H:/`，Linux 部署時必須改成實際掛載點，例如 `NETDISK_PATH=/mnt/company-share`。

Stop:

```bash
docker compose down
```

### Linux systemd

systemd 部署不可把可變動的 SQLite 放在會由 `root` 覆蓋更新的程式目錄，否則服務啟動時會出現 `sqlite3.OperationalError: attempt to write a readonly database`，並使 Nginx 回傳 502。請使用 [`deploy/systemd/repair-sn-generator-db.sh`](../deploy/systemd/repair-sn-generator-db.sh) 將資料庫移至 `/var/lib/sn_generator`、安裝 `StateDirectory` drop-in 並重啟服務；操作與資料保留方式見 [`deploy/systemd/README.md`](../deploy/systemd/README.md)。

## Test

安裝 `requirements.txt` 後，可直接從專案根目錄執行：

```bash
pytest
```

pytest 會收集單元、API 路由與 T27 整合測試。Excel fixture 由測試即時建立，SQLite 使用 pytest 暫存目錄，不依賴工作區中的實體測試檔案。

瀏覽器 regression 從專案根目錄執行：

```bash
npm ci
npx playwright install chromium
npm test
```

## API Base

- Health: `GET /api/health`
- Excel: `POST /api/excel/parse`
- SN: `POST /api/sn/generate`
- 勤誠：首頁搜尋命中「勤誠出貨」工單後顯示客序／MAC 生成功能。使用 `POST /api/sn/generate`（`customer=fzg`、`fzg_kind=customer|mac`）；客序 `key` 為料號，MAC `key` 為工單。`GET /api/sn/fzg/status` 可查看下一號；`POST /api/sn/fzg/reset` 可重置當週客序或指定 MAC 起始值。流水號保存在 SQLite，客序依日曆年份與 ISO 週數共用 1～99999，MAC 為 200000～2FFFFF。
- Export: `POST /api/export`
- History: `GET /api/history/{customer}`, `POST /api/history/upsert`, `POST /api/history/reset`
- Print notice: `GET /api/print-notice`, `POST /api/print-notice/upsert`, `DELETE /api/print-notice`
- Shipment refresh: `GET /api/shipment-refresh`, `POST /api/shipment-refresh/run`
- Shipment sources: `GET /api/shipment-sources`, `PUT /api/shipment-sources/{source_key}`, `POST /api/shipment-sources/{source_key}/reset`
  - `POST /api/shipment-sources` 新增自訂 Excel 來源（`label / path_kind / path / sheet_rule / file_rule / recent_files / rules`）。以來源名稱建立總表工作表；未啟用規則時保留全部原始欄位，以第一列作為欄名。自訂來源可修改，沒有內建預設值。
  - `rules` 為可停用的版本 1 匯入設定，支援選檔策略、工作表、表頭、欄位別名／排序、文字清理、列過濾與去重，並支援儲存格／月份擷取、同列補值、主檔對照、拆列計算及郵件抽表／局部更新（見 [第4階段](../doc/source-rules-stage4.md)）。內建來源維持原客戶處理器。PUT 未傳 `rules` 保留已存規則；傳 `null` 停用。參數見 [規則規格](../doc/source-rules-spec.md)，操作及完整部署清單見 [第 2 階段說明](../doc/source-rules-stage2.md)。

`/api/excel/parse` 使用 `multipart/form-data`：
- `customer`（string）
- `sheet_name`（string）
- `parse_rules`（string，例：`arrow,trim`）
- `file`（xlsx/xls）

`/api/export` 回傳檔案附件下載（目前依 customer 產生對應 sheet 結構）。

首頁「資料來源維護」可調整合併程式的來源路徑、工作表／工作表關鍵字、檔名關鍵字與最近讀取檔案數。設定保存在既有 SQLite 的 `shipment_source_config` 表；規則存於新增的 nullable `rules_json` 欄。升級初始化補欄及缺少的來源，不覆蓋已儲存值；內建來源可還原成環境變數或程式預設值。

## Notes

- 目前已完成 T20~T26（骨架、歷史 SQLite、SN 生成、Excel 解析、Excel 匯出、Nginx 反代）。
- Nginx 設定檔位於 `deploy/nginx/nginx.conf`，由 compose 掛載進容器。

## 舊客戶遷移與部署驗收

SHIPMENT_RULE_MIGRATION_CUSTOMERS預設空白，維持原處理器。倫飛／營邦／富弘年／勤誠可逐次比較，完全一致才採共用規則；差異回原結果，超恩／KOYA保持專用流程。ackend/app/tools/shipment_check.py可核對部署清單、模組、MIME、唯讀來源與權限，或唯讀比較客戶；操作、退出碼及回退見[第5階段](../doc/source-rules-stage5.md)。
# 自訂來源搜尋與預覽

所有自訂來源保存、更新總表後都會自動加入通用搜尋與預覽，預設搜尋全部欄位，也可指定匯入後的搜尋欄名。泉影另外選擇 DEG 編碼用途。搜尋使用 DEFAULT_EXCEL_PATH 的總表，来源路徑使用 Linux `/mnt/netdisk/...`，不需再改 config.py 或客戶列表。操作與首次部署見 `doc/source-search.md`。

營邦、倫飛、富弘年、勤誠會在同一規則表單預載可編輯候選；超恩 Email、KOYA 與其對照來源顯示特殊規則摘要並保留專用處理器。切換及回退方式見 `doc/existing-source-rules-editor.md`。
