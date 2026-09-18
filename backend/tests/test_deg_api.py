from test_api_routes import api_client
import pytest

from app.core.dependencies import get_history_service, get_sn_service
from app.services.sn_service import SnService
from app.core.config import settings, Settings, CustomerFileConfig


def test_deg_work_orders_load_from_total(api_client, tmp_path, monkeypatch):
    from openpyxl import Workbook
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "DEG"
    sheet.append(["製令單號", "型號"])
    sheet.append(["01234567", "M2A"])
    file = tmp_path / "total.xlsx"
    workbook.save(file)
    assert Settings().default_excel["deg"].sheet_name == "DEG"
    monkeypatch.setitem(settings.default_excel, "deg", CustomerFileConfig(str(file), "DEG"))
    response = api_client.get("/api/excel/load-default?customer=deg")
    assert response.status_code == 200
    assert response.json()["data"]["rows"] == [{"製令單號": "01234567", "型號": "M2A"}]


def test_saved_source_binds_deg_search_without_config(api_client, tmp_path, monkeypatch):
    from app.tools.shipment_merge import process_custom_source
    import pandas as pd
    source_file = tmp_path / "source.xlsx"
    total = tmp_path / "total.xlsx"
    pd.DataFrame({"製令單號": ["20260323001"], "型號": ["M2A"]}).to_excel(source_file, index=False)
    monkeypatch.delitem(settings.default_excel, "deg", raising=False)
    from dataclasses import replace
    monkeypatch.setattr("app.services.excel_service.settings", replace(settings, default_excel_path=str(total)))
    payload = {"label": "泉影出貨", "path": "/mnt/netdisk/@思創出貨資料(泉影 FDE)", "path_kind": "folder",
               "file_rule": "source", "sheet_rule": "Sheet1",
               "search_customer": "deg", "work_order_column": "工令號",
               "rules": {"version": 1, "column_mode": "select", "columns": [
                   {"name": "工令號", "aliases": ["製令單號"], "required": True},
                   {"name": "型號", "aliases": ["型號"]}]}}
    created = api_client.post("/api/shipment-sources", json=payload)
    assert created.status_code == 200
    entry = created.json()["data"]
    assert entry["path"] == payload["path"]
    # 與正式更新使用同一讀取器；搜尋只能讀更新後總表，不直接讀來源。
    frame = process_custom_source({**entry, "path": str(source_file), "path_kind": "file"})
    frame.to_excel(total, sheet_name=entry["label"], index=False)
    response = api_client.get("/api/excel/load-default?customer=deg")
    assert response.status_code == 200
    data = response.json()["data"]
    assert data["sheet_name"] == "泉影出貨"
    assert data["rows"] == [{"工令號": "20260323001", "型號": "M2A"}]
    assert data["resolved_columns"]["WORK_ORDER"] == "工令號"
    listed = api_client.get("/api/shipment-sources").json()["data"]["entries"]
    assert next(item for item in listed if item["key"] == entry["key"])["search_customer"] == "deg"
    duplicate = api_client.post("/api/shipment-sources", json={**payload, "label": "另一個泉影"})
    assert duplicate.status_code == 409
    wrong = api_client.put(f'/api/shipment-sources/{entry["key"]}', json={"path": payload["path"], "file_rule": "source", "sheet_rule": "Sheet1", "work_order_column": "不存在"})
    assert wrong.status_code == 200
    assert wrong.json()["data"]["search_customer"] == "deg"
    assert api_client.get("/api/excel/load-default?customer=deg").json()["error"]["code"] == "SOURCE_SEARCH_COLUMN_NOT_FOUND"
    disabled = api_client.put(f'/api/shipment-sources/{entry["key"]}', json={"path": payload["path"], "file_rule": "source", "sheet_rule": "Sheet1", "search_customer": ""})
    assert disabled.status_code == 200
    assert api_client.get("/api/excel/load-default?customer=deg").json()["error"]["code"] == "NO_DEFAULT_PATH"
    assert api_client.post("/api/shipment-sources", json={**payload, "label": "另一個泉影"}).status_code == 200


def test_any_new_source_is_searchable_without_customer_config(api_client, tmp_path, monkeypatch):
    from dataclasses import replace
    from app.tools.shipment_merge import process_custom_source
    import pandas as pd
    total = tmp_path / "total.xlsx"
    source_file = tmp_path / "source.xlsx"
    pd.DataFrame({"工令號": ["00123"], "型號": ["NewModel"], "數量": [7]}).to_excel(source_file, index=False)
    monkeypatch.setattr("app.services.excel_service.settings", replace(settings, default_excel_path=str(total)))
    entry = api_client.post("/api/shipment-sources", json={"label": "新客戶", "path": "/mnt/netdisk/new", "file_rule": "source", "sheet_rule": "Sheet1"}).json()["data"]
    assert entry["work_order_column"] == ""
    assert entry["search_customer"] == ""
    data = process_custom_source({**entry, "path": str(source_file), "path_kind": "file"})
    data.to_excel(total, sheet_name="新客戶", index=False)
    response = api_client.get("/api/excel/load-source", params={"source_key": entry["key"]})
    assert response.status_code == 200
    assert response.json()["data"]["customer"] == entry["key"]
    assert response.json()["data"]["rows"] == [{"工令號": "00123", "型號": "NewModel", "數量": "7"}]
    with pd.ExcelWriter(total, engine="openpyxl", mode="a") as writer:
        pd.DataFrame({"製令單號": ["DCG-001"], "產品型號": ["D1"]}).to_excel(writer, sheet_name="富弘年出貨", index=False)
    dcg = api_client.get("/api/excel/load-source?source_key=dcg")
    assert dcg.status_code == 200
    assert dcg.json()["data"]["rows"] == [{"製令單號": "DCG-001", "產品型號": "D1"}]
    assert api_client.get("/api/excel/load-source?source_key=../../etc/passwd").status_code == 404
    assert api_client.get("/api/excel/load-source?source_key=yingbang").status_code == 404
    # 來源失敗不影響其他來源，工作表缺失不得悄悄讀第一張。
    missing = api_client.post("/api/shipment-sources", json={"label": "未更新來源", "path": "/mnt/netdisk/new2", "file_rule": "source", "sheet_rule": "Sheet1"}).json()["data"]
    assert api_client.get("/api/excel/load-source", params={"source_key": missing["key"]}).json()["error"]["code"] == "SHEET_NOT_FOUND"


@pytest.fixture(autouse=True)
def deg_sn_dependency(api_client):
    history = api_client.app.dependency_overrides[get_history_service]()
    api_client.app.dependency_overrides[get_sn_service] = lambda: SnService(history)
    yield


def test_deg_api_generate_history_and_export(api_client):
    response = api_client.post("/api/sn/generate", json={
        "customer": "deg", "key": "hl", "qty": 2,
        "deg": {"spec": "hl", "product": "M2A", "date_code": "2638"},
    })
    assert response.status_code == 200
    serials = response.json()["data"]["sn_list"]
    assert serials == ["HLDDM2A263800001", "HLDDM2A263800002"]
    history = api_client.get("/api/history/deg")
    assert history.status_code == 200
    assert history.json()["data"]["entries"][0]["last_serial"] == 2
    assert serials[0] in history.json()["data"]["records"][0]["record"]
    exported = api_client.post("/api/export", json={
        "customer": "deg", "sn_rows": [{"SN": sn} for sn in serials],
    })
    assert exported.status_code == 200
    assert exported.content.startswith(b"PK")


def test_deg_api_rejects_carton_overflow(api_client):
    response = api_client.post("/api/sn/generate", json={
        "customer": "deg", "key": "carton", "qty": 2,
        "deg": {"spec": "pizza_carton", "date_code": "260914", "week": "38", "start_serial": 999},
    })
    assert response.status_code == 400
    assert api_client.get("/api/history/deg").json()["data"]["entries"] == []
