from pathlib import Path
import sys

from fastapi.testclient import TestClient
from openpyxl import Workbook
import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import CustomerFileConfig, settings  # noqa: E402
from app.core.dependencies import (  # noqa: E402
    get_history_service,
    get_koya_model_service,
    get_nyx_model_service,
    get_monthly_reference_service,
    get_print_notice_service,
    get_shipment_refresh_service,
    get_shipment_source_service,
)
from app.main import app  # noqa: E402
from app.services.history_service import HistoryService  # noqa: E402
from app.services.koya_model_service import KoyaModelService  # noqa: E402
from app.services.nyx_model_service import NyxModelService  # noqa: E402
from app.services.monthly_reference_service import MonthlyReferenceService  # noqa: E402
from app.services.print_notice_service import PrintNoticeService  # noqa: E402
from app.schemas.shipment_refresh import ShipmentRefreshJob  # noqa: E402
from app.services.shipment_source_service import ShipmentSourceService  # noqa: E402


class StubShipmentRefreshService:
    def __init__(self) -> None:
        self.job = ShipmentRefreshJob(
            status="idle",
            progress=0,
            stage="尚未執行",
            message="可開始更新",
        )

    def get_status(self) -> ShipmentRefreshJob:
        return self.job

    def start(self) -> ShipmentRefreshJob:
        self.job = ShipmentRefreshJob(
            status="running",
            progress=2,
            stage="準備更新",
            message="正在啟動",
            started_at="2026-09-11 08:00:00",
        )
        return self.job


@pytest.fixture
def api_client(tmp_path: Path):
    db_path = str(tmp_path / "routes.db")
    history_service = HistoryService(db_path)
    print_notice_service = PrintNoticeService(db_path)
    koya_model_service = KoyaModelService(db_path)
    nyx_model_service = NyxModelService(db_path)
    monthly_reference_service = MonthlyReferenceService(db_path)
    shipment_refresh_service = StubShipmentRefreshService()
    shipment_source_service = ShipmentSourceService(db_path)
    history_service.initialize()
    print_notice_service.initialize()
    koya_model_service.initialize()
    nyx_model_service.initialize()
    monthly_reference_service.initialize()
    shipment_source_service.initialize()
    original_overrides = app.dependency_overrides.copy()
    app.dependency_overrides[get_history_service] = lambda: history_service
    app.dependency_overrides[get_print_notice_service] = lambda: print_notice_service
    app.dependency_overrides[get_koya_model_service] = lambda: koya_model_service
    app.dependency_overrides[get_nyx_model_service] = lambda: nyx_model_service
    app.dependency_overrides[get_monthly_reference_service] = lambda: monthly_reference_service
    app.dependency_overrides[get_shipment_refresh_service] = lambda: shipment_refresh_service
    app.dependency_overrides[get_shipment_source_service] = lambda: shipment_source_service
    client = TestClient(app)
    try:
        yield client
    finally:
        client.close()
        app.dependency_overrides = original_overrides


def test_source_preview_uses_unsaved_rules_without_writes(api_client, tmp_path):
    path = tmp_path / "preview.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.append(["說明"])
    sheet.append(["製令", "備註"])
    sheet.append(["123", "正常"])
    sheet.append(["123", "正常"])
    sheet.append(["456", "Total"])
    workbook.save(path)
    payload = {"label": "DEG", "path_kind": "file", "path": str(path), "recent_files": 1,
               "rules": {"version": 1, "header_row": 2, "column_mode": "select",
                         "columns": [{"name": "工單", "aliases": ["製令"], "required": True}],
                         "transforms": [{"op": "zero_pad", "field": "工單", "width": 8}],
                         "filters": [{"op": "drop_contains", "fields": ["備註"], "value": "Total"}]}}
    initial = api_client.get("/api/shipment-sources").json()
    original = path.read_bytes()
    report = api_client.post("/api/shipment-sources/preview", json=payload).json()["data"]
    assert report["error"] is None
    assert report["output_rows"] == 1 and report["before_deduplicate"] == 2
    assert report["output"]["rows"] == [["00000123"]]
    detail = report["files"][0]["sheets"][0]
    assert detail["input_rows"] == 3 and detail["filtered_rows"] == 2
    assert detail["before"]["row_numbers"] == [3, 4, 5]
    assert detail["after"]["row_numbers"] == [3, 4]
    assert detail["mappings"][0] == {"original": "製令", "position": 1, "output": "工單"}
    payload["rules"]["columns"][0]["aliases"] = ["不存在"]
    failure = api_client.post("/api/shipment-sources/preview", json=payload)
    assert failure.status_code == 400
    assert failure.json()["success"] is False
    assert failure.json()["error"]["code"] == "SOURCE_PREVIEW_FAILED"
    assert str(path) not in failure.text
    payload["path"] = str(tmp_path / "missing.xlsx")
    missing = api_client.post("/api/shipment-sources/preview", json=payload)
    assert missing.status_code == 400
    assert missing.json()["success"] is False
    assert str(tmp_path) not in missing.text
    payload["rules"] = None
    assert api_client.post("/api/shipment-sources/preview", json=payload).status_code == 400
    assert api_client.get("/api/shipment-sources").json() == initial
    assert path.read_bytes() == original


def test_load_default_excel_route_uses_configured_file(
    api_client: TestClient,
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    workbook_path = tmp_path / "default.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "營邦出貨"
    sheet.append(["工單號", "數量"])
    sheet.append(["WO-DEFAULT", 50])
    workbook.save(workbook_path)
    workbook.close()
    monkeypatch.setitem(
        settings.default_excel,
        "yingbang",
        CustomerFileConfig(
            path=str(workbook_path),
            sheet_name="營邦出貨",
            parse_rules=["trim"],
        ),
    )

    response = api_client.get("/api/excel/load-default", params={"customer": "yingbang"})

    assert response.status_code == 200
    data = response.json()["data"]
    assert data["rows_count"] == 1
    assert data["rows"][0] == {"工單號": "WO-DEFAULT", "數量": "50"}


def test_shipment_refresh_status_and_start_routes(api_client: TestClient) -> None:
    initial = api_client.get("/api/shipment-refresh")
    started = api_client.post("/api/shipment-refresh/run")

    assert initial.status_code == 200
    assert initial.json()["data"]["status"] == "idle"
    assert started.status_code == 200
    assert started.json()["data"]["status"] == "running"
    assert started.json()["data"]["progress"] == 2


def test_shipment_source_settings_routes(api_client: TestClient) -> None:
    listed = api_client.get("/api/shipment-sources")
    updated = api_client.put(
        "/api/shipment-sources/bng",
        json={
            "path": "/mnt/custom/bng",
            "sheet_rule": "",
            "file_rule": "出貨通知",
            "recent_files": 7,
        },
    )
    restored = api_client.post("/api/shipment-sources/bng/reset")

    assert listed.status_code == 200
    assert len(listed.json()["data"]["entries"]) == 9
    assert updated.status_code == 200
    assert updated.json()["data"]["path"] == "/mnt/custom/bng"
    assert updated.json()["data"]["file_rule"] == "出貨通知"
    assert restored.status_code == 200
    assert restored.json()["data"]["path"] == "/mnt/netdisk/TE/個人資料/To Claire"
    created = api_client.post("/api/shipment-sources", json={
        "label": "自訂來源", "path_kind": "file", "path": "/mnt/custom/new.xlsx",
        "file_rule": "new", "sheet_rule": "出貨",
    })
    assert created.status_code == 200
    entry = created.json()["data"]
    assert entry["is_custom"] is True
    assert len(api_client.get("/api/shipment-sources").json()["data"]["entries"]) == 10
    assert api_client.put(f"/api/shipment-sources/{entry['key']}", json={
        "path": "/mnt/custom/edited.xlsx", "file_rule": "edited", "sheet_rule": "出貨", "recent_files": 2,
    }).status_code == 200
    assert api_client.post("/api/shipment-sources", json={
        "label": "自訂來源", "path": "/mnt/custom/duplicate.xlsx", "file_rule": "duplicate", "sheet_rule": "出貨",
    }).status_code == 409


def test_custom_source_rules_routes(api_client: TestClient) -> None:
    payload = {"label": "DEG", "path_kind": "folder", "path": "/mnt/deg", "file_rule": "泉影訂單總表", "sheet_rule": "生產排程 2026",
               "rules": {"version": 1, "sheet_mode": "exact", "header_row": 3,
                         "column_mode": "select", "columns": [{"name": "工單", "aliases": ["製令單號"], "required": True}]}}
    created = api_client.post("/api/shipment-sources", json=payload)
    assert created.status_code == 200
    entry = created.json()["data"]
    key = entry["key"]
    assert entry["rules"]["header_row"] == 3
    updated = {"path": "/mnt/new-deg", "file_rule": "泉影訂單總表", "sheet_rule": "生產排程 2026", "recent_files": 1}
    assert api_client.put(f"/api/shipment-sources/{key}", json=updated).json()["data"]["rules"]["header_row"] == 3
    rejected = api_client.put(f"/api/shipment-sources/{key}", json={**updated, "rules": {"version": 2}})
    assert rejected.status_code == 400
    assert "不支援" in rejected.json()["error"]["message"]
    listed = api_client.get("/api/shipment-sources").json()["data"]["entries"]
    assert next(item for item in listed if item["key"] == key)["rules"]["header_row"] == 3
    enabled = api_client.put("/api/shipment-sources/yingbang", json={**updated, "rules": {"version": 1}})
    assert enabled.status_code == 200
    assert enabled.json()["data"]["rules"]["version"] == 1
    disabled = api_client.put(f"/api/shipment-sources/{key}", json={**updated, "rules": None})
    assert disabled.status_code == 200 and disabled.json()["data"]["rules"] is None


def test_history_reset_route_removes_counter_and_records(api_client: TestClient) -> None:
    created = api_client.post(
        "/api/history/upsert",
        json={
            "customer": "yingbang",
            "key": "WO-RESET",
            "increment": 3,
            "record": "2026-09-10-WO-RESET",
        },
    )
    reset = api_client.post(
        "/api/history/reset",
        json={"customer": "yingbang", "key": "WO-RESET"},
    )
    history = api_client.get("/api/history/yingbang")

    assert created.status_code == 200
    assert reset.status_code == 200
    assert reset.json()["data"]["removed"] is True
    assert history.status_code == 200
    assert history.json()["data"]["entries"] == []
    assert history.json()["data"]["records"] == []


def test_all_print_notice_routes(api_client: TestClient) -> None:
    empty = api_client.get("/api/print-notice")
    created = api_client.post(
        "/api/print-notice/upsert",
        json={
            "customer": "bng",
            "customer_label": "超恩",
            "workorder_label": "MO",
            "workorder_value": "MO-PRINT",
        },
    )
    listed = api_client.get("/api/print-notice")
    deleted = api_client.request(
        "DELETE",
        "/api/print-notice",
        json={"customer": "bng", "workorder_value": "MO-PRINT"},
    )
    after_delete = api_client.get("/api/print-notice")

    assert empty.status_code == 200
    assert empty.json()["data"]["entries"] == []
    assert created.status_code == 200
    assert created.json()["data"]["entry"]["workorder_value"] == "MO-PRINT"
    assert listed.status_code == 200
    assert len(listed.json()["data"]["entries"]) == 1
    assert deleted.status_code == 200
    assert deleted.json()["data"]["removed"] is True
    assert after_delete.json()["data"]["entries"] == []


def test_nyx_model_routes_seed_update_and_delete(api_client: TestClient) -> None:
    seeded = api_client.get("/api/nyx-model")
    updated = api_client.post(
        "/api/nyx-model/upsert",
        json={
            "original_model": "CZG201-XXXX",
            "model": "CZG201-XXXX",
            "pn": "LPCT-0510-D-REV2",
        },
    )
    created = api_client.post(
        "/api/nyx-model/upsert",
        json={"model": "CZG299-XXXX", "pn": "TEST-PN"},
    )
    deleted = api_client.request(
        "DELETE",
        "/api/nyx-model",
        json={"model": "CZG299-XXXX"},
    )

    assert seeded.status_code == 200
    assert len(seeded.json()["data"]["entries"]) == 6
    assert updated.status_code == 200
    assert updated.json()["data"]["entry"]["pn"] == "LPCT-0510-D-REV2"
    assert "lot" not in updated.json()["data"]["entry"]
    assert created.status_code == 200
    assert deleted.status_code == 200
    assert deleted.json()["data"]["removed"] is True


def test_koya_model_routes_seed_update_and_delete(api_client: TestClient) -> None:
    seeded = api_client.get("/api/koya-model")
    updated = api_client.post(
        "/api/koya-model/upsert",
        json={
            "original_model": "CHG021-XXXX",
            "model": "CHG021-XXXX",
            "pn": "S-0060-01(B)",
            "full_pn": "04-NODE-NEW",
        },
    )
    created = api_client.post(
        "/api/koya-model/upsert",
        json={
            "model": "CHG999-TEST",
            "pn": "PN-TEST",
            "full_pn": "FULL-TEST",
        },
    )
    deleted = api_client.request(
        "DELETE",
        "/api/koya-model",
        json={"model": "CHG999-TEST"},
    )
    listed = api_client.get("/api/koya-model")

    assert seeded.status_code == 200
    assert len(seeded.json()["data"]["entries"]) == 5
    assert updated.status_code == 200
    assert updated.json()["data"]["entry"]["full_pn"] == "04-NODE-NEW"
    assert "po" not in updated.json()["data"]["entry"]
    assert created.status_code == 200
    assert deleted.status_code == 200
    assert deleted.json()["data"]["removed"] is True
    assert all(
        entry["model"] != "CHG999-TEST"
        for entry in listed.json()["data"]["entries"]
    )


def test_monthly_reference_routes_support_blank_values_and_crud(api_client: TestClient) -> None:
    koya_created = api_client.post(
        "/api/monthly-reference/koya/upsert",
        json={"month": "9月", "value": "P747"},
    )
    nyx_created = api_client.post(
        "/api/monthly-reference/nyx/upsert",
        json={"month": "9月", "value": ""},
    )
    nyx_updated = api_client.post(
        "/api/monthly-reference/nyx/upsert",
        json={"original_month": "9月", "month": "09月", "value": "LOT-09"},
    )
    koya_listed = api_client.get("/api/monthly-reference/koya")
    nyx_listed = api_client.get("/api/monthly-reference/nyx")
    deleted = api_client.request(
        "DELETE",
        "/api/monthly-reference/nyx",
        json={"month": "09月"},
    )

    assert koya_created.status_code == 200
    assert koya_created.json()["data"]["entry"]["value"] == "P747"
    assert nyx_created.status_code == 200
    assert nyx_created.json()["data"]["entry"]["value"] == ""
    assert nyx_updated.status_code == 200
    assert nyx_listed.json()["data"]["entries"][0]["month"] == "09月"
    assert nyx_listed.json()["data"]["entries"][0]["value"] == "LOT-09"
    assert koya_listed.json()["data"]["value_label"] == "PO"
    assert nyx_listed.json()["data"]["value_label"] == "LOT"
    assert deleted.status_code == 200
    assert deleted.json()["data"]["removed"] is True
