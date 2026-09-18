from copy import deepcopy
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import Thread

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.tools import shipment_merge as merge
from app.tools.source_migration import compare_customer, compare_frames, migration_keys, CUSTOMERS
from app.tools.shipment_check import check_release, ROOT
from app.services.shipment_source_service import ShipmentSourceService


def excel(path, rows, sheets):
    with pd.ExcelWriter(path) as writer:
        for sheet in sheets:
            pd.DataFrame(rows).to_excel(writer, sheet_name=sheet, header=False, index=False)


def configure(tmp_path, monkeypatch, key, rows=None):
    name, function = CUSTOMERS[key]
    config = deepcopy(merge.CUSTOMER_CONFIGS[name])
    config["source_folder"] = str(tmp_path)
    monkeypatch.setitem(merge.CUSTOMER_CONFIGS, name, config)
    monkeypatch.setattr(merge, "LOG_FILE", str(tmp_path / "legacy.log"))
    sheets = [config.get("target_sheet", "工作表3")]
    if key == "yingbang":
        config.update(target_sheets=["量產", "試產"], num_files=2)
        sheets = config["target_sheets"]
        rows = rows or [["DDC料號", "工單", "料號", "品名", "PO號碼", "Q'TY"], ["D1", "W1", "P1", "M1", "PO1", "2"]]
    elif key == "lunfei":
        rows = rows or [["加工 WO#", "工單", "P/N", "對應PCBA", "MO", "Q'ty", "Model"], ["WO1", "W1", "P1", "PC1", "MO1/MO2", "2/3", "BAG428-001D"]]
    elif key == "dcg":
        rows = rows or [["製令單號", "產品品號", "生產數量"], ["123", "P1", "2"], ["2026-01-02", "P2", "3"]]
    elif key == "fzg":
        config.update(target_sheet_keyword="工作表3", num_files=2)
        rows = rows or [["PO#", "Chenbro PN", "DDC PN", "QTY", "廠 商 交 期", "DDC MO", "SUGON S/N", "額外欄"], ["PO1", "P1", "D1", "2", "2026-09-14", "W1", "S1", "keep"]]
    path = tmp_path / "出貨-valid.xlsx"
    excel(path, rows, sheets)
    return config, getattr(merge, function), path


@pytest.mark.parametrize("key", ["yingbang", "lunfei", "dcg", "fzg"])
def test_real_customer_candidates_match_normal_workbooks(tmp_path, monkeypatch, key):
    config, processor, path = configure(tmp_path, monkeypatch, key)
    if key in ("yingbang", "fzg"):
        broken = tmp_path / "latest.xlsx"
        excel(broken, [["bad"]], ["wrong-sheet"])
        os.utime(broken, (path.stat().st_mtime + 10, path.stat().st_mtime + 10))
    original = path.read_bytes()
    frame, result = compare_customer(key, processor, config)
    assert result["matched"] and result["migration_status"] == "matched"
    assert frame is not None and path.read_bytes() == original
    if key == "fzg":
        assert "額外欄" in frame.columns


def test_dcg_conditional_padding_difference_falls_back(tmp_path, monkeypatch):
    config, processor, _ = configure(tmp_path, monkeypatch, "dcg", [["製令單號", "產品品號"], ["2026-1-2", "P1"], ["A-123", "P2"]])
    frame, result = compare_customer("dcg", processor, config)
    assert result["migration_status"] == "fallback"
    assert frame["製令單號"].tolist() == ["202612", "A-123"]
    assert result["differences"][0]["new"]["value"] == "'00202612'"


def test_yingbang_na_and_partial_sheet_are_not_hidden(tmp_path, monkeypatch):
    config, processor, path = configure(tmp_path, monkeypatch, "yingbang", [["工單", "料號"], ["W1", "NA"]])
    frame, result = compare_customer("yingbang", processor, config)
    assert not result["matched"] and pd.isna(frame.iloc[0]["料號"])
    assert result["differences"][0]["old"] == {"missing": True}
    excel(path, [["工單", "料號"], ["W1", "P1"]], ["量產"])
    with pd.ExcelWriter(path, mode="a", engine="openpyxl") as writer:
        pd.DataFrame([["無表頭"], ["保留舊行為"]]).to_excel(writer, sheet_name="試產", index=False, header=False)
    frame, result = compare_customer("yingbang", processor, config)
    assert len(frame) == 1 and result["migration_status"] == "fallback"
    assert "候選規則失敗" in result["reason"]


def test_lunfei_and_fzg_fallback_headers_keep_legacy_result(tmp_path, monkeypatch):
    config, processor, _ = configure(tmp_path, monkeypatch, "lunfei", [["型號", "Qty"], ["BAG428-001D", "2"]])
    frame, result = compare_customer("lunfei", processor, config)
    assert result["migration_status"] == "fallback" and frame["Model"].tolist() == ["BAG428-001D"]
    config, processor, _ = configure(tmp_path, monkeypatch, "fzg", [["額外欄", "資料欄"], ["keep", "value"]])
    frame, result = compare_customer("fzg", processor, config)
    assert result["migration_status"] == "fallback" and list(frame.columns) == ["額外欄", "資料欄"]


def test_blocked_bng_re_and_rounding_behaviour_are_preserved():
    def part(thread, reply, qty, time):
        return pd.DataFrame({"工單": ["W1"], "機種料號": ["P1"], "生產數量": [qty], "__source_path": [thread], "__source_mtime": [time], "__is_reply": [reply], "__thread_key": [thread]})
    processor = lambda: merge.merge_bng_partial_updates_by_partno([part("thread-A", False, "1", 1), part("thread-B", False, "2", 2), part("RE-thread-A", True, "3", 3)])
    frame, result = compare_customer("bng", processor, {"sheet_name": "超恩出貨"})
    assert result["migration_status"] == "blocked" and frame["生產數量"].tolist() == ["3"]
    old = merge.split_bng_rows_by_work_order(pd.DataFrame({"工單": ["W1*1/W2*1/W3*1"], "MAC數量": ["2"], "生產數量": ["3"]}))
    assert old["MAC數量"].tolist() == ["1", "1", "1"]  # 舊流程總和3，不能自動改成新規則總和2。


def test_blocked_koya_total_order_month_and_model_are_preserved(tmp_path, monkeypatch):
    config, processor, _ = configure(tmp_path, monkeypatch, "koya", [["2026-09", ""], ["", "機種", "批量", "小張貼紙"], ["12345678.5", "M1", "2", "2"], ["87654321", "Total", "2", "2"], ["123", "M1", "1", "1"]])
    monkeypatch.setattr(merge, "load_koya_model", lambda: pd.DataFrame({"Model": ["M1"], "full PN": ["FULL"], "PN": ["P1"], "PO": ["PO1"]}))
    frame, result = compare_customer("koya", processor, config)
    assert result["migration_status"] == "blocked"
    assert frame["工單"].tolist() == ["12345678"]
    assert frame["工單月份"].tolist() == ["2026-09"] and frame["PO"].tolist() == ["PO1"]


def test_main_default_rollback_and_guarded_output(tmp_path, monkeypatch, capsys):
    config, processor, _ = configure(tmp_path, monkeypatch, "lunfei")
    monkeypatch.setattr(merge, "OUTPUT_FOLDER", str(tmp_path))
    output = tmp_path / "output" / "total.xlsx"; output.parent.mkdir()
    monkeypatch.setattr(merge, "OUTPUT_FILE", str(output))
    monkeypatch.setenv("SHIPMENT_CUSTOM_SOURCES", "[]")
    for function in ("process_alg", "process_bng", "process_chg", "process_dcg", "process_fzg"):
        monkeypatch.setattr(merge, function, lambda: None)
    monkeypatch.delenv("SHIPMENT_RULE_MIGRATION_CUSTOMERS", raising=False)
    assert merge.main() == 0
    lines = capsys.readouterr().out
    assert "遷移檢查" not in lines
    monkeypatch.setenv("SHIPMENT_RULE_MIGRATION_CUSTOMERS", "lunfei")
    assert merge.main() == 0
    line = next(line for line in capsys.readouterr().out.splitlines() if line.startswith("SHIPMENT_SOURCE_RESULTS "))
    result = next(item for item in json.loads(line.split(" ", 1)[1]) if item["label"] == "倫飛出貨")
    assert result["status"] == "updated" and result["migration_status"] == "matched"
    assert pd.read_excel(output, sheet_name="倫飛出貨", dtype=str)["Model"].tolist() == ["BAG428-001D"]
    monkeypatch.setenv("SHIPMENT_RULE_MIGRATION_CUSTOMERS", "")
    assert merge.main() == 0 and "遷移檢查" not in capsys.readouterr().out


def test_comparison_and_parameter_validation():
    assert not compare_frames(pd.DataFrame({"x": ["", "1"]}), pd.DataFrame({"x": [None, "1"]}))["matched"]
    assert not compare_frames(pd.DataFrame({"x": ["1", "2"]}), pd.DataFrame({"x": ["2", "1"]}))["matched"]
    assert not compare_frames(None, None)["matched"]
    with pytest.raises(ValueError, match="未知"):
        migration_keys("lunfei,typo")


def test_saved_builtin_rules_replace_only_the_selected_processor(monkeypatch):
    source = {"key": "yingbang", "label": "營邦出貨", "rules": {"version": 1}, "path": "/mnt/alg"}
    monkeypatch.setenv("SHIPMENT_BUILTIN_RULE_SOURCES", json.dumps([source], ensure_ascii=False))
    monkeypatch.setenv("SHIPMENT_CUSTOM_SOURCES", "[]")
    processors = merge.build_processors()
    assert processors["營邦出貨"].func is merge.process_custom_source
    assert processors["營邦出貨"].args[0] == source
    assert processors["倫飛出貨"] is merge.process_bag
    monkeypatch.setenv("SHIPMENT_BUILTIN_RULE_SOURCES", json.dumps([{"label": "超恩出貨", "rules": {"version": 1}}]))
    with pytest.raises(ValueError, match="內建共用規則來源無效"):
        merge.build_processors()


def test_check_manifest_and_actual_http_mime(tmp_path):
    class Handler(SimpleHTTPRequestHandler):
        def log_message(self, *args):
            pass
        def guess_type(self, path):
            return "text/html" if path.endswith("sourcePreview.js") else super().guess_type(path)
    server = ThreadingHTTPServer(("127.0.0.1", 0), partial(Handler, directory=str(ROOT)))
    Thread(target=server.serve_forever, daemon=True).start()
    try:
        checked = check_release(base_url=f"http://127.0.0.1:{server.server_port}")
        assert any("MIME錯誤" in error and "sourcePreview" in error for error in checked["errors"])
    finally:
        server.shutdown(); server.server_close()
    checked = check_release()
    assert not checked["errors"]
    checked["files"]["js/app.js"] = "0" * 64
    manifest = tmp_path / "release.json"; manifest.write_text(json.dumps(checked), encoding="utf-8")
    assert any("js/app.js" in error for error in check_release(manifest)["errors"])


def test_cli_compare_is_readonly_and_missing_db_not_created(tmp_path, monkeypatch):
    folder = tmp_path / "source"; folder.mkdir()
    config, _, original = configure(folder, monkeypatch, "lunfei")
    db = tmp_path / "sources.db"; service = ShipmentSourceService(str(db)); service.initialize()
    service.update_entry("lunfei", path=str(folder), sheet_rule=config["target_sheet"], file_rule="", recent_files=None)
    output, log = tmp_path / "total.xlsx", tmp_path / "log.txt"
    output.write_bytes(b"original total"); log.write_bytes(b"original log")
    before = {path: path.read_bytes() for path in (db, original, output, log)}
    environment = {**os.environ, "DB_PATH": str(db), "DEFAULT_EXCEL_PATH": str(output), "SHIPMENT_LOG_FILE": str(log), "SHIPMENT_RULE_MIGRATION_CUSTOMERS": ""}
    run = subprocess.run([sys.executable, str(ROOT / "backend/app/tools/shipment_check.py"), "--compare", "lunfei"], env=environment, capture_output=True, text=True, encoding="utf-8")
    assert run.returncode == 0, run.stdout + run.stderr
    assert json.loads(run.stdout)["comparisons"][0]["matched"]
    assert all(path.read_bytes() == data for path, data in before.items())
    missing = tmp_path / "missing.db"
    run = subprocess.run([sys.executable, str(ROOT / "backend/app/tools/shipment_check.py"), "--check"], env={**environment, "DB_PATH": str(missing)}, capture_output=True, text=True, encoding="utf-8")
    assert run.returncode == 1 and not missing.exists()
