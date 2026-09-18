import json
import os
from pathlib import Path
import subprocess
import sys

import pandas as pd
import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.tools.source_rules import process_rule_source, validate_rules
from app.tools.shipment_merge import process_custom_source
from app.services.shipment_source_service import ShipmentSourceService
from app.core.errors import AppError


def source(path, rules):
    return {"label": "DEG", "path": str(path), "path_kind": "file", "sheet_rule": "生產排程 2026",
            "file_rule": "泉影訂單總表", "recent_files": 2, "rules": rules}


def workbook(path, rows, sheets=("生產排程 2026",)):
    with pd.ExcelWriter(path, engine="openpyxl") as writer:
        for sheet in sheets:
            pd.DataFrame(rows).to_excel(writer, sheet_name=sheet, index=False, header=False)


def test_rule_source_persistence_and_real_excel(tmp_path):
    file = tmp_path / "泉影訂單總表.xlsx"
    workbook(file, [["說明"], ["2026"], ["製令單號", "產品品號", "生產數量", "備註"],
                    ["12345678.0", "old→new", "3", "正常"], ["12345678.0", "old→new", "3", "正常"],
                    ["00123456", "keep", "2", "Total"], ["12.5", "keep", "1", "正常"]])
    rules = {"version": 1, "sheet_mode": "exact", "header_row": 3, "column_mode": "select",
             "columns": [{"name": "工單", "aliases": ["製令單號"], "required": True},
                         {"name": "料號", "aliases": ["產品品號"], "required": True}],
             "transforms": [{"op": "strip_integer_decimal", "field": "工單"}, {"op": "arrow_last", "field": "料號"}],
             "filters": [{"op": "drop_contains", "fields": ["備註"], "value": "total"},
                         {"op": "keep_digits", "field": "工單", "length": 8}]}
    service = ShipmentSourceService(str(tmp_path / "sources.db"))
    service.initialize()
    created = service.create_entry(label="DEG", path_kind="file", path=str(file), sheet_rule="生產排程 2026",
                                   file_rule="泉影訂單總表", recent_files=1, rules=rules)
    service.initialize()
    # 舊版用戶端未送 rules 時仍保留已設定規則。
    edited = service.update_entry(created.key, path=str(file), sheet_rule="生產排程 2026", file_rule="泉影訂單總表", recent_files=1)
    assert edited.rules["header_row"] == 3
    entry = json.loads(service.build_environment()["SHIPMENT_CUSTOM_SOURCES"])[0]
    result = process_custom_source(entry)
    assert result.columns.tolist() == ["工單", "料號"]
    assert result.to_dict("records") == [{"工單": "12345678", "料號": "new"}]
    service.update_entry(created.key, path=str(file), sheet_rule="生產排程 2026", file_rule="泉影訂單總表", recent_files=1, rules=None)
    assert next(item for item in service.list_entries() if item.key == created.key).rules is None


def test_scan_multi_sheet_and_transforms(tmp_path):
    file = tmp_path / "泉影訂單總表.xlsx"
    workbook(file, [["說明"], ["工單", "料號", "備註"], ["123", " a:b 到 c:d ", ""],
                    ["00123456", "OLD->middle→NEW", ""], ["12.5", " x ", ""], ["", "", ""]],
             sheets=("生產排程 2026", "備用"))
    rules = {"version": 1, "sheet_mode": "list", "sheet_names": ["備用", "生產排程 2026"],
             "header_mode": "scan", "scan_rows": 3, "header_keywords": ["工單", "料號"], "keyword_condition": "all",
             "transforms": [{"op": "trim", "field": "料號"}, {"op": "replace", "field": "料號", "old": "到", "new": "~"},
                            {"op": "remove_chars", "field": "料號", "chars": ":"}, {"op": "arrow_last", "field": "料號"},
                            {"op": "zero_pad", "field": "工單", "width": 8}],
             "filters": [{"op": "drop_empty_rows"}, {"op": "drop_empty_field", "field": "工單"}], "deduplicate": "none"}
    result = process_rule_source(source(file, rules))
    assert len(result) == 6
    assert result.iloc[:3]["工單"].tolist() == ["00000123", "00123456", "12.5"]
    assert result.iloc[:3]["料號"].tolist() == ["ab ~ cd", "NEW", "x"]
    rules["sheet_mode"], rules["sheet_names"] = "contains", []
    entry = source(file, rules)
    entry["sheet_rule"] = "生產排程"
    assert len(process_rule_source(entry)) == 3


def test_file_strategies_and_actionable_errors(tmp_path):
    old, latest = tmp_path / "泉影訂單總表_old.xlsx", tmp_path / "泉影訂單總表_new.xlsx"
    workbook(old, [["工單"], ["00123456"]])
    workbook(latest, [["不對的表頭"], ["x"]])
    os.utime(old, (100, 100))
    os.utime(latest, (200, 200))
    entry = source(tmp_path, {"version": 1, "sheet_mode": "exact", "file_strategy": "first_valid",
                              "column_mode": "select", "columns": [{"name": "工單", "aliases": ["工單"], "required": True}]})
    entry["path_kind"] = "folder"
    assert process_rule_source(entry).to_dict("records") == [{"工單": "00123456"}]
    for strategy in ("latest", "merge_recent"):
        entry["rules"]["file_strategy"] = strategy
        with pytest.raises(ValueError, match="泉影訂單總表_new.xlsx.*必需欄位"):
            process_rule_source(entry)
    entry["rules"] = {"version": 1, "sheet_mode": "list", "sheet_names": ["不存在"]}
    with pytest.raises(ValueError, match="不存在.*實際"):
        process_rule_source(entry)
    entry["rules"] = {"version": 1, "filters": [{"op": "drop_empty_field", "field": "不存在"}]}
    with pytest.raises(ValueError, match="過濾第1項.*不存在"):
        process_rule_source(entry)


@pytest.mark.parametrize("rules", [
    {"version": 2}, {"version": True}, {"version": 1, "unknown": True},
    {"version": 1, "header_row": 0}, {"version": 1, "header_row": 1.5},
    {"version": 1, "sheet_mode": "list"}, {"version": 1, "header_mode": "scan"},
    {"version": 1, "column_mode": "select"},
    {"version": 1, "columns": [{"name": "工單", "aliases": ["WO"]}, {"name": "工單", "aliases": ["MO"]}]},
    {"version": 1, "transforms": [{"op": "eval", "field": "工單"}]},
    {"version": 1, "transforms": [{"op": "zero_pad", "field": "工單", "width": True}]},
    {"version": 1, "filters": [{"op": "drop_contains", "fields": "all", "value": "x", "case_sensitive": "false"}]},
])
def test_invalid_rules_rejected(rules):
    with pytest.raises(ValueError):
        validate_rules(rules)


def test_alias_ambiguity_and_empty_output(tmp_path):
    file = tmp_path / "泉影訂單總表.xlsx"
    workbook(file, [["PN", "pn"], ["a", "b"]])
    result = process_rule_source(source(file, {"version": 1}))
    assert result.to_dict("records") == [{"PN": "a", "pn": "b"}]
    with pytest.raises(ValueError, match="重複或匹配歧義"):
        process_rule_source(source(file, {"version": 1, "columns": [{"name": "料號", "aliases": ["PN"]}]}))
    workbook(file, [["PN", "PN"], ["a", "b"]])
    with pytest.raises(ValueError, match="重複或匹配歧義"):
        process_rule_source(source(file, {"version": 1}))
    workbook(file, [["工單", "備註"], ["00123456", "Total"]])
    with pytest.raises(ValueError, match="沒有有效資料"):
        process_rule_source(source(file, {"version": 1, "filters": [{"op": "drop_contains", "fields": "all", "value": "Total"}]}))


def test_rules_invalid_save_preserves_previous_setting(tmp_path):
    service = ShipmentSourceService(str(tmp_path / "sources.db"))
    service.initialize()
    with pytest.raises(AppError, match="不支援"):
        service.update_entry("yingbang", path="/tmp/x", sheet_rule="x", file_rule="", recent_files=1, rules={"version": 2})
    assert service.list_entries()[0].path != "/tmp/x"


def test_standalone_merge_imports_shared_rules():
    script = BACKEND_ROOT / "app/tools/shipment_merge.py"
    result = subprocess.run([sys.executable, "-c", "import shipment_merge; assert callable(shipment_merge.process_rule_source)"],
                            cwd=script.parent, capture_output=True, text=True)
    assert result.returncode == 0, result.stderr


def test_header_scan_reuses_excel_handle(tmp_path, monkeypatch):
    from pandas.io.excel._base import ExcelFile
    from app.tools import shipment_merge as merge

    file = tmp_path / "倫飛.xlsx"
    workbook(file, [["說明"], ["MO", "QTY"], ["MO-1", "2"]], sheets=("FCST",))
    opened = 0
    original_init = ExcelFile.__init__

    def count_open(self, *args, **kwargs):
        nonlocal opened
        opened += 1
        original_init(self, *args, **kwargs)

    monkeypatch.setattr(ExcelFile, "__init__", count_open)
    monkeypatch.setattr(merge, "find_latest_excel", lambda *_args, **_kwargs: str(file))
    monkeypatch.setattr(merge, "write_log", lambda _message: None)

    assert merge.process_bag().iloc[0]["MO"] == "MO-1"
    assert opened == 1


def test_rule_source_updates_total_and_retains_on_failure(tmp_path, monkeypatch, capsys):
    from app.tools import shipment_merge as merge

    file = tmp_path / "泉影訂單總表.xlsx"
    output = tmp_path / "出貨記錄總表.xlsx"
    workbook(file, [["工單", "數量"], ["00123456", "3"]])
    entry = source(file, {"version": 1, "sheet_mode": "exact"})
    monkeypatch.setenv("SHIPMENT_CUSTOM_SOURCES", json.dumps([entry], ensure_ascii=False))
    monkeypatch.setattr(merge, "OUTPUT_FOLDER", str(tmp_path))
    monkeypatch.setattr(merge, "OUTPUT_FILE", str(output))
    monkeypatch.setattr(merge, "LOG_FILE", str(tmp_path / "merge.log"))
    monkeypatch.setattr(merge, "process_alg", lambda: pd.DataFrame({"工單": ["new-alg"]}))
    for name in ("process_bag", "process_bng", "process_chg", "process_dcg", "process_fzg"):
        monkeypatch.setattr(merge, name, lambda: None)
    assert merge.main() == 0
    def reported():
        lines = capsys.readouterr().out.splitlines()
        return {item["label"]: item for item in json.loads(next(line.split(" ", 1)[1] for line in lines if line.startswith("SHIPMENT_SOURCE_RESULTS ")))}
    assert reported()["DEG"]["status"] == "updated"
    assert pd.read_excel(output, sheet_name="DEG", dtype=str).to_dict("records") == [{"工單": "00123456", "數量": "3"}]
    entry["rules"]["header_row"] = 999
    monkeypatch.setenv("SHIPMENT_CUSTOM_SOURCES", json.dumps([entry], ensure_ascii=False))
    assert merge.main() == 0
    results = reported()
    assert results["DEG"]["status"] == "retained"
    assert results["DEG"]["rows"] == 1 and "找不到表頭" in results["DEG"]["error"]
    assert results["倫飛出貨"]["status"] == "skipped"
    assert pd.read_excel(output, sheet_name="DEG", dtype=str).to_dict("records") == [{"工單": "00123456", "數量": "3"}]
    original = output.read_bytes()
    monkeypatch.setattr(merge, "process_alg", lambda: None)
    assert merge.main() == 1
    assert reported()["DEG"]["status"] == "failed"
    assert output.read_bytes() == original
    monkeypatch.setattr(merge, "process_alg", lambda: pd.DataFrame({"工單": ["new-alg"]}))
    def reject_write(results):
        raise PermissionError("測試寫入被拒絕")
    monkeypatch.setattr(merge, "write_results_atomically", reject_write)
    assert merge.main() == 1
    results = reported()
    assert results["營邦出貨"]["status"] == "failed"
    assert "總表寫入失敗" in results["營邦出貨"]["error"]
    assert output.read_bytes() == original
