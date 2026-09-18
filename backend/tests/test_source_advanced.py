import json
import os
from email.message import EmailMessage
from pathlib import Path
import sys

import pandas as pd
import pytest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.tools.source_rules import process_rule_source, validate_rules
from app.tools.shipment_merge import extract_raw_tables_from_html
from app.services.koya_model_service import KoyaModelService
from app.services.monthly_reference_service import MonthlyReferenceService
from app.services.shipment_source_service import ShipmentSourceService


def source(path, rules, folder=False):
    return {"label": "DEG", "path": str(path), "path_kind": "folder" if folder else "file", "sheet_rule": "", "file_rule": "", "recent_files": 10, "rules": rules}


def excel(path, rows):
    pd.DataFrame(rows).to_excel(path, index=False, header=False)


def test_cells_coalesce_split_and_excel_lookup(tmp_path):
    path, master = tmp_path / "source.xlsx", tmp_path / "master.xlsx"
    excel(path, [["2026-09-14"], ["工單", "機種", "用量", "PO", "備用PO"], ["W1*2/W2*3", "M1", "2", "", "P1"]])
    excel(master, [["Model", "BIOS"], ["M1", "B1"]])
    rules = {"version": 1, "header_row": 2, "column_mode": "select",
        "columns": [{"name": name, "aliases": [name], "required": True} for name in ["工單", "數量", "MAC數量", "月份", "PO", "BIOS"]],
        "cell_values": [{"target": "月份", "cells": ["B1", "A1"], "format": "date", "input_format": "%Y-%m-%d", "output_format": "%Y-%m"}],
        "transforms": [{"op": "coalesce", "field": "PO", "fields": ["備用PO"], "overwrite": "if_empty"}],
        "splits": [{"field": "工單", "separators": ["/"], "quantity_field": "數量", "calculate": "multiply", "unit_field": "用量", "total_field": "MAC數量", "mark_field": "拆列"}],
        "lookups": [{"kind": "excel", "path": str(master), "keys": [{"field": "機種", "lookup": "Model"}], "fields": [{"lookup": "BIOS", "target": "BIOS"}]}]}
    report = {}
    service = ShipmentSourceService(str(tmp_path / "sources.db")); service.initialize()
    created = service.create_entry(label="DEG", path_kind="file", path=str(path), sheet_rule="Sheet1", file_rule="source", recent_files=1, rules=rules)
    service.initialize()
    entry = json.loads(service.build_environment()["SHIPMENT_CUSTOM_SOURCES"])[0]
    assert entry["key"] == created.key
    result = process_rule_source(entry, report)
    assert result.to_dict("records") == [
        {"工單": "W1", "數量": "2", "MAC數量": "4", "月份": "2026-09", "PO": "P1", "BIOS": "B1"},
        {"工單": "W2", "數量": "3", "MAC數量": "6", "月份": "2026-09", "PO": "P1", "BIOS": "B1"}]
    assert report["lookup_results"][0]["matched"] == 2
    assert report["files"][0]["sheets"][0]["after"]["row_numbers"] == [3, 3]


def test_sqlite_family_month_and_proportional_remainder(tmp_path):
    db = str(tmp_path / "master.db")
    models = KoyaModelService(db); models.initialize()
    months = MonthlyReferenceService(db); months.initialize()
    months.upsert_entry(customer="koya", original_month=None, month="2026-09", value="P-09")
    path = tmp_path / "source.xlsx"
    excel(path, [["工單", "機種", "月份", "MAC"], ["W1*1/W2*1/W3*1", "CHG021-004L", "2026-09", "2"]])
    rules = {"version": 1, "splits": [{"field": "工單", "separators": ["/"], "quantity_field": "數量", "calculate": "proportional", "total_field": "MAC", "rounding": "floor", "remainder": "largest"}],
        "lookups": [{"kind": "koya_model", "match": "family_prefix", "keys": [{"field": "機種", "lookup": "model"}], "fields": [{"lookup": "pn", "target": "PN"}]},
                    {"kind": "koya_month", "keys": [{"field": "月份", "lookup": "month"}], "fields": [{"lookup": "value", "target": "PO", "overwrite": "always"}]}]}
    result = process_rule_source(source(path, rules), db_path=db)
    assert result["MAC"].tolist() == ["2", "0", "0"]
    assert result["PN"].tolist() == ["S-0060-01(A)"] * 3
    assert result["PO"].tolist() == ["P-09"] * 3
    rules["splits"][0]["remainder"] = "error"
    with pytest.raises(ValueError, match="差額"):
        process_rule_source(source(path, rules), db_path=db)


def mail(path, subject, orders, attachment=False):
    message = EmailMessage(); message["Subject"] = subject; message.set_content("plain")
    html = "<table><tr><th>工單</th><th>料號</th><th>數量</th></tr>" + "".join(f"<tr><td>{wo}</td><td>{pn}</td><td>{qty}</td></tr>" for wo, pn, qty in orders) + "</table>"
    if attachment:
        message.add_attachment(html.encode(), maintype="text", subtype="html", filename="table.html")
    else:
        message.add_alternative(html, subtype="html")
    path.write_bytes(message.as_bytes())


def test_mail_same_thread_patch_base_search_and_strike(tmp_path):
    original, other, reply = [tmp_path / name for name in ("base.eml", "other.eml", "reply.eml")]
    mail(original, "訂單A", [("W1", "P1", "1"), ("W2", "P2", "2")])
    mail(other, "訂單B", [("W1", "P1", "9")])
    mail(reply, "RE: FW: 訂單A", [("W1", "P1", "5")], attachment=True)
    for index, path in enumerate((original, other, reply)):
        os.utime(path, (100 + index, 100 + index))
    rules = {"version": 1, "input_format": "eml", "mail": {"update_keys": ["工單", "料號"], "base_search": True}}
    entry = source(tmp_path, rules, True); entry["recent_files"] = 2
    report = {}; result = process_rule_source(entry, report)
    assert result.to_dict("records") == [{"工單": "W2", "料號": "P2", "數量": "2"}, {"工單": "W1", "料號": "P1", "數量": "5"}, {"工單": "W1", "料號": "P1", "數量": "9"}]
    assert report["mail_updates"][0]["replaced"] == 1
    rules["mail"]["base_search"] = False
    with pytest.raises(ValueError, match="原始底稿"):
        process_rule_source(entry)
    rules = {"version": 1, "input_format": "eml", "mail": {"strike": "omit"}}
    mail(reply, "RE: 訂單A", [("<s>OLD</s>NEW", "P1", "5")])
    assert process_rule_source(source(reply, rules)).iloc[0]["工單"] == "NEW"
    assert extract_raw_tables_from_html("<table><tr><td><s>old</s>new</td></tr></table>") == [[["old[已刪除]new"]]]


def test_lookup_failures_are_explicit_and_do_not_create_db(tmp_path):
    path = tmp_path / "source.xlsx"; excel(path, [["Model", "PN"], ["M1", "OLD"]])
    missing = tmp_path / "missing.db"
    lookup = {"kind": "koya_model", "keys": [{"field": "Model", "lookup": "model"}], "fields": [{"lookup": "pn", "target": "PN"}]}
    entry = source(path, {"version": 1, "lookups": [lookup]})
    with pytest.raises(ValueError, match="來源失敗"):
        process_rule_source(entry, db_path=str(missing))
    assert not missing.exists()
    lookup["on_source_error"] = "blank"
    report = {}; result = process_rule_source(entry, report, db_path=str(missing))
    assert result.iloc[0]["PN"] == "" and report["warnings"]
    master = tmp_path / "master.xlsx"; excel(master, [["model", "pn"], ["M1", "A"], ["M1", "B"]])
    lookup.update(kind="excel", path=str(master), on_source_error="error")
    with pytest.raises(ValueError, match="重複鍵"):
        process_rule_source(entry)
    lookup["duplicate_keys"] = "last"
    assert process_rule_source(entry).iloc[0]["PN"] == "OLD"
    lookup["fields"][0]["overwrite"] = "always"
    assert process_rule_source(entry).iloc[0]["PN"] == "B"


def test_position_mapping_and_alias_ambiguity(tmp_path):
    path = tmp_path / "position.xlsx"
    excel(path, [["MAC", "工單", "MAC", ""], ["2", "W1", "4", "P1"]])
    rules = {"version": 1, "column_mode": "select", "columns": [{"name": name, "position": index, "required": True} for index, name in enumerate(["單位用量", "工單", "MAC數量", "PN"], 1)]}
    report = {}; result = process_rule_source(source(path, rules), report)
    assert result.to_dict("records") == [{"單位用量": "2", "工單": "W1", "MAC數量": "4", "PN": "P1"}]
    assert report["files"][0]["sheets"][0]["mappings"][-1]["position"] == 4
    rules["columns"][0] = {"name": "單位用量", "aliases": ["MAC"]}
    with pytest.raises(ValueError, match="歧義"):
        process_rule_source(source(path, rules))


@pytest.mark.parametrize("extra", [
    {"cell_values": [{"target": "月份", "cells": ["A0"]}]},
    {"lookups": [{"kind": "arbitrary_sql", "keys": [], "fields": []}]},
    {"splits": [{"field": "工單", "separators": []}]},
    {"input_format": "eml", "file_strategy": "latest", "mail": {"update_keys": ["工單"]}},
    {"transforms": [{"op": "coalesce", "field": "PO", "fields": "all", "overwrite": "if_empty"}]},
])
def test_invalid_advanced_rules(extra):
    with pytest.raises(ValueError):
        validate_rules({"version": 1, **extra})
