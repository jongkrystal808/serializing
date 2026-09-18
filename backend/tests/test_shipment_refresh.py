import os
from dataclasses import replace
from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import AppError
from app.core.config import _default_excel_path
from app.services import shipment_refresh_service as service_module
from app.services.shipment_refresh_service import ShipmentRefreshService
from app.tools import shipment_merge as merge_module


def test_default_excel_path_targets_production_netdisk(monkeypatch: pytest.MonkeyPatch) -> None:
    monkeypatch.delenv("DEFAULT_EXCEL_PATH", raising=False)
    assert _default_excel_path() == "/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx"


def test_default_excel_update_is_recorded_in_shipment_log(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    output_path = tmp_path / "出貨記錄總表.xlsx"
    log_path = tmp_path / "shipment_merge.log"
    monkeypatch.setattr(merge_module, "OUTPUT_FOLDER", str(tmp_path))
    monkeypatch.setattr(merge_module, "OUTPUT_FILE", str(output_path))
    monkeypatch.setattr(merge_module, "LOG_FILE", str(log_path))

    merge_module.write_results_atomically(
        {"營邦出貨": merge_module.pd.DataFrame([{"work_order": "WO-001"}])}
    )

    assert output_path.is_file()
    assert f"總表已更新: {output_path}" in log_path.read_text(encoding="utf-8")


class ImmediateThread:
    def __init__(self, *, target, name: str, daemon: bool) -> None:
        self.target = target

    def start(self) -> None:
        self.target()


class FakeProcess:
    def __init__(self, output_path: Path) -> None:
        self.stdout = iter(
            [
                'SHIPMENT_SOURCE_RESULTS [{"label":"DEG","status":"retained","rows":3,"error":"缺少必需欄位"}]\n',
                "🟢 處理營邦出貨...\n",
                "🟣 處理勤誠出貨（回溯穩定版）\n",
                "💾 正在儲存到: 出貨記錄總表.xlsx\n",
                "✅ 處理完成！\n",
            ]
        )
        self.output_path = output_path

    def wait(self) -> int:
        self.output_path.write_bytes(b"new workbook")
        current = self.output_path.stat().st_mtime_ns
        os.utime(self.output_path, ns=(current + 1_000_000, current + 1_000_000))
        return 0


@pytest.mark.parametrize("custom_log", [False, True])
def test_refresh_runs_in_background_and_reports_completion(
    tmp_path: Path,
    monkeypatch: pytest.MonkeyPatch,
    custom_log: bool,
) -> None:
    data_folder = tmp_path / "data"
    data_folder.mkdir()
    monkeypatch.setattr(service_module, "settings", replace(service_module.settings, db_path=str(data_folder / "sources.db")))
    expected_log = str(tmp_path / "custom.log") if custom_log else "/opt/sn_generator/shipment_merge.log"
    if custom_log:
        monkeypatch.setenv("SHIPMENT_LOG_FILE", expected_log)
    else:
        monkeypatch.delenv("SHIPMENT_LOG_FILE", raising=False)
    script_path = tmp_path / "shipment_merge.py"
    script_path.write_text("print('placeholder')", encoding="utf-8")
    output_path = tmp_path / "出貨記錄總表.xlsx"
    output_path.write_bytes(b"old workbook")
    class SourceServiceStub:
        def build_environment(self) -> dict[str, str]:
            return {"SHIPMENT_SOURCE_ALG": "/mnt/custom/alg"}

    service = ShipmentRefreshService(
        str(script_path),
        str(output_path),
        source_service=SourceServiceStub(),
    )
    captured_environment = {}

    monkeypatch.setattr(service_module, "Thread", ImmediateThread)
    monkeypatch.setattr(
        service_module.subprocess,
        "Popen",
        lambda *args, **kwargs: (
            captured_environment.update(kwargs["env"]) or FakeProcess(output_path)
        ),
    )

    result = service.start()

    assert result.status == "succeeded"
    assert result.source_results[0].status == "retained"
    assert result.source_results[0].error == "缺少必需欄位"
    assert result.progress == 100
    assert result.stage == "更新完成"
    assert service.get_status().finished_at is not None
    assert captured_environment["SHIPMENT_SOURCE_ALG"] == "/mnt/custom/alg"
    assert captured_environment["SHIPMENT_LOG_FILE"] == expected_log
    assert result.last_updated_at is not None


def test_refresh_date_uses_workbook_mtime_and_survives_restart(tmp_path: Path) -> None:
    output_path = tmp_path / "出貨記錄總表.xlsx"
    service = ShipmentRefreshService(output_path=str(output_path))
    assert service.get_status().last_updated_at is None
    output_path.write_bytes(b"workbook")
    os.utime(output_path, (1704067200, 1704067200))
    assert service.get_status().last_updated_at == "2024-01-01 08:00:00"
    restarted_service = ShipmentRefreshService(output_path=str(output_path))
    assert restarted_service.get_status().last_updated_at == "2024-01-01 08:00:00"


def test_refresh_rejects_duplicate_running_job(monkeypatch: pytest.MonkeyPatch) -> None:
    class DeferredThread:
        def __init__(self, **kwargs) -> None:
            pass

        def start(self) -> None:
            pass

    service = ShipmentRefreshService("unused.py", "unused.xlsx")
    monkeypatch.setattr(service_module, "Thread", DeferredThread)
    assert service.start().status == "running"

    with pytest.raises(AppError) as error:
        service.start()

    assert error.value.code == "SHIPMENT_REFRESH_RUNNING"
    assert error.value.status_code == 409
