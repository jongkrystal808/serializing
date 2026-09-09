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

Stop:

```bash
docker compose down
```

## API Base

- Health: `GET /api/health`
- Excel: `POST /api/excel/parse`
- SN: `POST /api/sn/generate`
- Export: `POST /api/export`
- History: `GET /api/history/{customer}`, `POST /api/history/upsert`, `POST /api/history/reset`

`/api/excel/parse` 使用 `multipart/form-data`：
- `customer`（string）
- `sheet_name`（string）
- `parse_rules`（string，例：`arrow,trim`）
- `file`（xlsx/xls）

`/api/export` 回傳檔案附件下載（目前依 customer 產生對應 sheet 結構）。

## Notes

- 目前已完成 T20~T26（骨架、歷史 SQLite、SN 生成、Excel 解析、Excel 匯出、Nginx 反代）。
- Nginx 設定檔位於 `deploy/nginx/nginx.conf`，由 compose 掛載進容器。
