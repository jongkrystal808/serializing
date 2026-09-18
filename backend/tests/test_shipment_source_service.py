from pathlib import Path
import json
import sys

import pytest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.core.errors import AppError
from app.services.shipment_source_service import ShipmentSourceService


def test_custom_source_persistence_edit_and_merge(tmp_path: Path) -> None:
    import pandas as pd
    from app.tools.shipment_merge import process_custom_source

    source_file = tmp_path / "shipment.xlsx"
    pd.DataFrame({"工單": ["WO001"], "數量": [3]}).to_excel(source_file, index=False)
    service = ShipmentSourceService(str(tmp_path / "sources.db"))
    service.initialize()
    created = service.create_entry(label="新客戶", path_kind="file", path=str(source_file),
                                   sheet_rule="Sheet1", file_rule="shipment", recent_files=1,
                                   customer_keywords="新客戶, NEW")
    service.initialize()
    assert len(service.list_entries()) == 10
    assert next(entry for entry in service.list_entries() if entry.key == created.key).is_custom
    assert created.customer_keywords == "新客戶, NEW"
    updated = service.update_entry(created.key, path=str(source_file), sheet_rule="Sheet1",
                                   file_rule="shipment", recent_files=1)
    assert updated.customer_keywords == "新客戶, NEW"
    custom = json.loads(service.build_environment()["SHIPMENT_CUSTOM_SOURCES"])
    assert custom[0]["sheet_rule"] == updated.sheet_rule
    assert process_custom_source(custom[0]).to_dict("records") == [{"工單": "WO001", "數量": "3"}]
    with pytest.raises(ValueError, match="找不到自訂來源 Excel 檔案"):
        process_custom_source({**custom[0], "file_rule": "missing"})
    custom[0].update(path=str(tmp_path), path_kind="folder", file_rule="shipment")
    assert len(process_custom_source(custom[0])) == 1
    for name in ("新客戶", "KOYA出貨", "營邦出貨", "bad/name", "   "):
        with pytest.raises(AppError):
            service.create_entry(label=name, path_kind="file", path=str(source_file),
                                 sheet_rule="Sheet1", file_rule="shipment", recent_files=1)
    with pytest.raises(AppError, match="檔名關鍵字與工作表關鍵字"):
        service.create_entry(label="缺少關鍵字", path_kind="file", path=str(source_file),
                             sheet_rule="", file_rule="", recent_files=1)
    with pytest.raises(AppError):
        service.reset_entry(created.key)


def test_source_settings_seed_update_and_survive_reinitialize(tmp_path: Path) -> None:
    db_path = str(tmp_path / "sources.db")
    service = ShipmentSourceService(db_path)
    service.initialize()

    entries = service.list_entries()
    assert len(entries) == 9
    assert entries[0].key == "yingbang"
    assert entries[0].rule_editable is True
    assert entries[0].rule_template["file_strategy"] == "first_valid"
    assert "NA" in entries[0].rule_summary
    assert next(item for item in entries if item.key == "bng").rule_editable is False
    assert "Email 特殊規則" in next(item for item in entries if item.key == "bng").rule_summary

    updated = service.update_entry(
        "yingbang",
        path="/mnt/custom/alg",
        sheet_rule="試產,量產機種",
        file_rule="",
        recent_files=6,
    )
    service.initialize()

    assert updated.path == "/mnt/custom/alg"
    assert service.list_entries()[0].path == "/mnt/custom/alg"
    environment = service.build_environment()
    assert environment["SHIPMENT_SOURCE_ALG"] == "/mnt/custom/alg"
    assert environment["SHIPMENT_ALG_TARGET_SHEETS"] == "試產,量產機種"
    assert environment["SHIPMENT_ALG_RECENT_FILES"] == "6"
    assert json.loads(environment["SHIPMENT_BUILTIN_RULE_SOURCES"]) == []

    enabled = service.update_entry("yingbang", path=updated.path, sheet_rule=updated.sheet_rule,
                                   file_rule="", recent_files=updated.recent_files, rules=updated.rule_template)
    configured = json.loads(service.build_environment()["SHIPMENT_BUILTIN_RULE_SOURCES"])
    assert configured[0]["key"] == "yingbang"
    assert configured[0]["rules"] == enabled.rule_template
    assert service.reset_entry("yingbang").rules is None

    with pytest.raises(AppError, match="內建來源"):
        service.update_entry("bng", path="/tmp", sheet_rule="", file_rule="超恩", recent_files=1,
                             rules={"version": 1})


def test_source_setting_can_restore_default(tmp_path: Path) -> None:
    service = ShipmentSourceService(str(tmp_path / "sources.db"))
    service.initialize()
    service.update_entry(
        "bios",
        path="/tmp/bios.xlsx",
        sheet_rule="Other",
        file_rule="",
        recent_files=None,
        work_order_column="工單",
        customer_keywords="客戶, CUSTOMER",
    )

    restored = service.reset_entry("bios")

    assert restored.path == "/mnt/netdisk/TE/個人資料/To Claire/VECOW各機種BIOSFW測試程式一覽表.xlsx"
    assert restored.sheet_rule == "List"
    assert restored.work_order_column == ""
    assert restored.customer_keywords == ""
    assert restored.search_customer == ""


def test_first_sheet_rule_does_not_require_builtin_sheet_keyword(tmp_path: Path) -> None:
    service = ShipmentSourceService(str(tmp_path / "sources.db"))
    service.initialize()
    entry = next(item for item in service.list_entries() if item.key == "fzg")
    rules = {**entry.rule_template, "sheet_mode": "first"}

    saved = service.update_entry(
        "fzg",
        path=entry.path,
        sheet_rule="",
        file_rule=entry.file_rule,
        recent_files=entry.recent_files,
        rules=rules,
    )

    assert saved.sheet_rule == ""
    assert saved.rules["sheet_mode"] == "first"


def test_unknown_source_is_rejected(tmp_path: Path) -> None:
    service = ShipmentSourceService(str(tmp_path / "sources.db"))
    service.initialize()

    with pytest.raises(AppError) as error:
        service.reset_entry("unknown")

    assert error.value.code == "UNKNOWN_SHIPMENT_SOURCE"
