"""舊客戶逐次比對遷移；有差異就使用本次原處理器結果。"""
import os

if __package__:
    from .source_rules import process_rule_source, validate_rules
else:
    from source_rules import process_rule_source, validate_rules


CUSTOMERS = {
    "yingbang": ("營邦", "process_alg"), "lunfei": ("倫飛", "process_bag"),
    "bng": ("超恩", "process_bng"), "koya": ("KOYA", "process_chg"),
    "dcg": ("富弘年", "process_dcg"), "fzg": ("勤誠", "process_fzg"),
}
BLOCKERS = {
    "bng": "原超恩依檔名判斷RE、跨底稿雙鍵替換及兩套抽表，與新同主題更新不同；保持專用處理器",
    "koya": "原KOYA空白欄定位、小數截斷、逐檔跳過及Excel／畫面SQLite補值順序尚未等價；保持專用處理器",
}


def migration_keys(value=None):
    keys = {item.strip() for item in (os.getenv("SHIPMENT_RULE_MIGRATION_CUSTOMERS", "") if value is None else value).split(",") if item.strip()}
    unknown = keys - set(CUSTOMERS)
    if unknown:
        raise ValueError("未知遷移客戶：" + ", ".join(sorted(unknown)))
    return keys


def migration_source(key, config):
    """候選設定只在比較一致時採用，不改SQLite內建來源設定。"""
    if key in BLOCKERS:
        raise ValueError(BLOCKERS[key])
    if key not in CUSTOMERS:
        raise ValueError("未知遷移客戶：" + key)
    rules = {"version": 1, "header_mode": "scan", "keyword_match": "cell_exact", "deduplicate": "none", "column_mode": "select", "column_match": "trim_casefold"}
    source = {"label": config["sheet_name"], "path_kind": "folder", "path": config["source_folder"], "sheet_rule": config.get("target_sheet", ""), "file_rule": config.get("file_keyword", ""), "recent_files": config.get("num_files", 1)}
    if key == "yingbang":
        rules.update(file_strategy="first_valid", sheet_mode="list", sheet_names=config["target_sheets"], scan_rows=5, header_keywords=config["keep_columns"] + ["PO號碼"])
        rules["columns"] = [{"name": name, "aliases": [name, "PO號碼"] if name == "採單號碼" else [name]} for name in config["keep_columns"]]
    elif key == "lunfei":
        rules.update(file_strategy="latest", sheet_mode="exact", scan_rows=10, header_keywords=["MO", "P/N", "PN"], keyword_match="cell_contains", column_match="compact_casefold")
        rules["columns"] = [{"name": name, "aliases": aliases} for name, aliases in config["column_aliases"].items()]
    elif key == "dcg":
        rules.update(file_strategy="latest", sheet_mode="exact", scan_rows=80, header_keywords=config["keep_columns"])
        rules["columns"] = [{"name": name, "aliases": [name]} for name in config["keep_columns"]]
        rules["transforms"] = [{"op": "trim", "field": "製令單號"}, {"op": "remove_chars", "field": "製令單號", "chars": "-/"}, {"op": "zero_pad", "field": "製令單號", "width": 8}]
    elif key == "fzg":
        source["sheet_rule"] = config["target_sheet_keyword"]
        rules.update(file_strategy="first_valid", sheet_mode="contains", sheet_match="compact_casefold", scan_rows=10, header_keywords=config["required_cols"], keyword_match="cell_contains", header_match="compact_casefold", column_mode="all")
    source["rules"] = validate_rules(rules)
    return source


def _cell(value):
    import pandas as pd
    if pd.isna(value):
        return {"missing": True}
    return {"type": type(value).__name__, "value": repr(value)[:300]}


def compare_frames(old, new):
    """不排序、去重、trim或fillna，避免把業務差異藏掉。"""
    report = {"matched": False, "old_rows": 0 if old is None else len(old), "new_rows": 0 if new is None else len(new), "old_columns": [] if old is None else list(old.columns), "new_columns": [] if new is None else list(new.columns), "differences": []}
    if old is None or new is None or old.empty or new.empty:
        report["reason"] = "沒有兩份有效非空結果，不能證明可遷移"
        return report
    old, new = old.reset_index(drop=True), new.reset_index(drop=True)
    if old.equals(new):
        report.update(matched=True, reason="欄位、順序、筆數、型別及值完全一致")
        return report
    if list(old.columns) != list(new.columns):
        report["reason"] = "輸出欄位或欄位順序不同"
    elif len(old) != len(new):
        report["reason"] = "輸出筆數不同"
    elif list(old.dtypes.astype(str)) != list(new.dtypes.astype(str)):
        report["reason"] = "輸出欄位型別不同"
    else:
        report["reason"] = "輸出值或列順序不同"
    report["old_types"] = list(old.dtypes.astype(str))
    report["new_types"] = list(new.dtypes.astype(str))
    for row in range(min(len(old), len(new))):
        for column in range(min(len(old.columns), len(new.columns))):
            before, after = _cell(old.iat[row, column]), _cell(new.iat[row, column])
            if before != after:
                report["differences"].append({"row": row + 1, "old_column": str(old.columns[column]), "new_column": str(new.columns[column]), "old": before, "new": after})
                if len(report["differences"]) >= 10:
                    return report
    return report


def compare_customer(key, processor, config, db_path=None):
    # ponytail: 遷移窗口每次讀舊／新兩次；完成真實資料驗收後才移除舊路徑與逐次比對。
    old = processor()
    base = {"customer": key, "label": config["sheet_name"], "migration_status": "blocked" if key in BLOCKERS else "fallback"}
    if key in BLOCKERS:
        base.update(reason=BLOCKERS[key], old_rows=0 if old is None else len(old), new_rows=0, matched=False)
        return old, base
    try:
        source = migration_source(key, config)
        new = process_rule_source(source, db_path=db_path)
        result = compare_frames(old, new)
        result["candidate"] = source
        result.update(base)
        result["migration_status"] = "matched" if result["matched"] else "fallback"
        return new if result["matched"] else old, result
    except Exception as error:
        base.update(matched=False, reason=f"候選規則失敗：{error}", old_rows=0 if old is None else len(old), new_rows=0)
        return old, base
