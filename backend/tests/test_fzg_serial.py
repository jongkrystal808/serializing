from datetime import date
from pathlib import Path
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import AppError
from app.core.config import CustomerFileConfig, settings
from app.services.excel_service import ExcelService
from openpyxl import Workbook
from app.schemas.sn import GenerateSnRequest
from app.services.fzg_serial_service import MAC_MAX, fzg_status, generate_fzg, parse_category_code, reset_fzg, week_key
from app.services.history_service import HistoryService
from app.services.sn_service import SnService
from app.core.dependencies import get_sn_service
from app.main import app


def test_fzg_part_number_examples():
    assert parse_category_code("80H03311902A2") == "03311902"
    assert parse_category_code("380-11902-3300A0") == "11902300"
    with pytest.raises(AppError):
        parse_category_code("invalid")


def test_fzg_mac_and_customer_serials_persist_independently(tmp_path):
    history = HistoryService(str(tmp_path / "serials.db"))
    history.initialize()
    service = SnService(history)
    mac = service.generate(GenerateSnRequest(customer="fzg", key="WO-1", qty=2, fzg_kind="mac"))
    assert mac.sn_list == ["5001C450 200000BF", "5001C450 200001BF"]
    again = service.generate(GenerateSnRequest(customer="fzg", key="WO-2", qty=1, fzg_kind="mac"))
    assert again.sn_list == ["5001C450 200002BF"]
    serials, key, previous, current = generate_fzg(history, "customer", "80H03311902A2", 2, date(2026, 9, 15))
    assert (key, previous, current) == ("26-W38", 0, 2)
    assert serials == ["26380331190200001", "26380331190200002"]
    other, _, previous, _ = generate_fzg(history, "customer", "380-11902-3300A0", 1, date(2026, 9, 16))
    assert previous == 2 and other == ["26381190230000003"]


def test_fzg_iso_year_and_bounds(tmp_path):
    assert week_key(date(2021, 1, 1)) == ("21-W53", "2153")
    history = HistoryService(str(tmp_path / "serials.db"))
    history.initialize()
    history.reserve_range("fzg", "MAC", MAC_MAX - 0x200000, start=0x200000, maximum=MAC_MAX)
    with pytest.raises(AppError):
        generate_fzg(history, "mac", "", 2)
    assert history.get_last_serial("fzg", "MAC") == MAC_MAX - 1
    history.reserve_range("fzg", "26-W38", 99999, start=1, maximum=99999)
    with pytest.raises(AppError):
        generate_fzg(history, "customer", "80H03311902A2", 1, date(2026, 9, 15))
    assert history.get_last_serial("fzg", "26-W38") == 99999


def test_fzg_generation_api(tmp_path):
    history = HistoryService(str(tmp_path / "api.db"))
    history.initialize()
    original = app.dependency_overrides.copy()
    app.dependency_overrides[get_sn_service] = lambda: SnService(history)
    try:
        client = TestClient(app)
        result = client.post("/api/sn/generate", json={
            "customer": "fzg", "key": "WO-FZG", "qty": 1, "fzg_kind": "mac"
        })
        assert result.status_code == 200
        assert result.json()["data"]["sn_list"] == ["5001C450 200000BF"]
        bad = client.post("/api/sn/generate", json={
            "customer": "fzg", "key": "bad", "qty": 1, "fzg_kind": "customer"
        })
        assert bad.status_code == 400
        assert history.get_last_serial("fzg", "MAC") == 0x200000
        status = client.get("/api/sn/fzg/status")
        assert status.status_code == 200
        assert status.json()["data"]["mac_next"] == "200001"
        invalid = client.post("/api/sn/fzg/reset", json={"kind": "mac", "start_hex": "100000"})
        assert invalid.status_code == 400
        assert history.get_last_serial("fzg", "MAC") == 0x200000
        reset = client.post("/api/sn/fzg/reset", json={"kind": "mac", "start_hex": "200010"})
        assert reset.status_code == 200
        assert reset.json()["data"]["mac_next"] == "200010"
    finally:
        app.dependency_overrides = original


def test_fzg_work_orders_load_from_shipment_sheet(tmp_path, monkeypatch):
    path = tmp_path / "shipments.xlsx"
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "勤誠出貨"
    sheet.append(["工單", "料號", "數量"])
    sheet.append(["WO-FZG", "80H03311902A2", 2])
    workbook.save(path)
    workbook.close()
    monkeypatch.setitem(settings.default_excel, "fzg", CustomerFileConfig(str(path), "勤誠出貨", ["trim"]))
    result = ExcelService().load_from_default_path("fzg")
    assert result.rows == [{"工單": "WO-FZG", "料號": "80H03311902A2", "數量": "2"}]


def test_fzg_week_reset_only_affects_current_week(tmp_path):
    history = HistoryService(str(tmp_path / "reset.db"))
    history.initialize()
    key, _ = week_key()
    history.reserve_range("fzg", key, 2, start=1, maximum=99999)
    history.reserve_range("fzg", "MAC", 1, start=0x200000, maximum=MAC_MAX)
    assert fzg_status(history)["customer_next"] == 3
    reset_fzg(history, "customer")
    assert fzg_status(history)["customer_next"] == 1
    assert fzg_status(history)["mac_next"] == "200001"
