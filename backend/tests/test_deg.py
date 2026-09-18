from io import BytesIO
from pathlib import Path
import sys

import pytest
from openpyxl import load_workbook

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.core.errors import AppError
from app.schemas.sn import DegOptions, GenerateSnRequest
from app.schemas.export import ExportRequest
from app.services.deg_service import build_deg_serials
from app.services.sn_service import SnService
from app.services.history_service import HistoryService
from app.services.export_service import ExportService


@pytest.mark.parametrize("options,expected", [
    (dict(spec="hl", product="M2A", date_code="2638"), ["HLDDM2A263800001", "HLDDM2A263800002"]),
    (dict(spec="pizza_box", product="ABC-123", year_last="6", week="38", weekday="1"), ["ABC-123DD638100000001", "ABC-123DD638100000002"]),
    (dict(spec="pizza_carton", date_code="260914", week="38", start_serial=998), ["CO26091438P998", "CO26091438P999"]),
])
def test_deg_generation_history_export(tmp_path, options, expected):
    history = HistoryService(str(tmp_path / "deg.db"))
    history.initialize()
    response = SnService(history).generate(GenerateSnRequest(customer="deg", key="deg", qty=2, deg=DegOptions(**options)))
    assert response.sn_list == expected
    assert response.current_serial == 2
    assert history.list_entries("deg")[0].last_serial == 2
    assert expected[0] in history.list_generation_records("deg")[0].record
    _, content, _ = ExportService().export(ExportRequest(customer="deg", sn_rows=[{"SN": sn} for sn in response.sn_list]))
    workbook = load_workbook(BytesIO(content))
    assert list(workbook["SN"].values) == [("SN",)] + [(sn,) for sn in expected]


@pytest.mark.parametrize("options,qty", [
    (None, 1),
    (dict(spec="unknown"), 1),
    (dict(spec="hl", product="M2A", date_code="2600"), 1),
    (dict(spec="hl", product="M2A", date_code="2638", start_serial=99999), 2),
    (dict(spec="pizza_carton", date_code="260230", week="38"), 1),
    (dict(spec="pizza_carton", date_code="260914", week="54"), 1),
    (dict(spec="pizza_carton", date_code="260914", week="38", start_serial=999), 2),
    (dict(spec="pizza_box", product="ABC", year_last="26", week="38", weekday="1"), 1),
    (dict(spec="pizza_box", product="ABC", year_last="6", week="38", weekday="0"), 1),
])
def test_invalid_deg_does_not_write_history(tmp_path, options, qty):
    history = HistoryService(str(tmp_path / "deg.db"))
    history.initialize()
    payload = GenerateSnRequest(customer="deg", key="deg", qty=qty, deg=DegOptions(**options) if options else None)
    with pytest.raises(AppError):
        SnService(history).generate(payload)
    assert history.list_entries("deg") == []
