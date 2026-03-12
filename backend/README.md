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
