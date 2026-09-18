"""自訂 Excel 來源的有限、可設定匯入規則；網頁與獨立合併程式共用。"""
from pathlib import Path
import re


MATCH_MODES = ("exact", "trim_casefold", "compact_casefold")
DEFAULTS = {
    "version": 1, "file_strategy": "merge_recent", "sheet_mode": "first",
    "sheet_match": "exact", "sheet_names": [], "header_mode": "fixed",
    "header_row": 1, "scan_rows": 10, "header_keywords": [],
    "keyword_condition": "any", "keyword_match": "cell_exact",
    "header_match": "trim_casefold", "column_mode": "all", "columns": [],
    "column_match": "trim_casefold", "transforms": [], "filters": [],
    "deduplicate": "all_columns",
    "cell_values": [], "lookups": [], "splits": [],
    "input_format": "excel", "mail": {},
}


def _text(value, name, *, empty=False):
    if not isinstance(value, str) or len(value) > 1000 or (not empty and not value):
        raise ValueError(f"{name}須為{'可留空' if empty else '非空'}文字（最多1000字）")
    return value


def _integer(value, name, maximum):
    if type(value) is not int or not 1 <= value <= maximum:
        raise ValueError(f"{name}須為1～{maximum}的整數")


def _list(value, name, *, nonempty=False):
    if not isinstance(value, list) or len(value) > 200 or (nonempty and not value):
        raise ValueError(f"{name}須為{'非空' if nonempty else ''}清單（最多200項）")


def _texts(value, name, *, nonempty=False):
    _list(value, name, nonempty=nonempty)
    for item in value:
        _text(item, name)
        if not item.strip():
            raise ValueError(f"{name}不可只含空白")
    if len(set(value)) != len(value):
        raise ValueError(f"{name}不可重複")


def _keys(value, allowed, name):
    if not isinstance(value, dict):
        raise ValueError(f"{name}須為設定物件")
    unknown = set(value) - set(allowed)
    if unknown:
        raise ValueError(f"{name}包含不支援參數：{', '.join(sorted(unknown))}")


def validate_rules(value):
    if value is None:
        return None
    _keys(value, DEFAULTS, "匯入規則")
    if type(value.get("version")) is not int or value["version"] != 1:
        raise ValueError("不支援的匯入規則版本，須為version=1")
    rules = {**DEFAULTS, **value}
    choices = {
        "file_strategy": ("latest", "first_valid", "merge_recent"),
        "sheet_mode": ("first", "exact", "contains", "list"),
        "header_mode": ("fixed", "scan"), "keyword_condition": ("any", "all"),
        "keyword_match": ("cell_exact", "cell_contains"),
        "column_mode": ("all", "select"), "deduplicate": ("none", "all_columns"),
        "sheet_match": MATCH_MODES, "header_match": MATCH_MODES, "column_match": MATCH_MODES,
    }
    for name, options in choices.items():
        if rules[name] not in options:
            raise ValueError(f"{name}不支援，允許：{', '.join(options)}")
    for name in ("header_row", "scan_rows"):
        _integer(rules[name], name, 1000)
    _texts(rules["sheet_names"], "工作表清單", nonempty=rules["sheet_mode"] == "list")
    _texts(rules["header_keywords"], "表頭關鍵字", nonempty=rules["header_mode"] == "scan")
    _list(rules["columns"], "欄位清單", nonempty=rules["column_mode"] == "select")
    names = []
    for index, column in enumerate(rules["columns"], 1):
        label = f"欄位設定第{index}項"
        _keys(column, ("name", "aliases", "required", "position"), label)
        name = _text(column.get("name"), label + "名稱")
        if not name.strip():
            raise ValueError(label + "名稱不可只含空白")
        if "position" in column:
            _integer(column["position"], label + "原始欄位置", 200)
        _texts(column.get("aliases", []), label + "候選欄名", nonempty="position" not in column)
        if type(column.get("required", False)) is not bool:
            raise ValueError(label + "必需欄位須為布林值")
        names.append(name)
    normalized_names = [name.strip().casefold() for name in names]
    if len(set(normalized_names)) != len(names):
        raise ValueError("輸出欄位名稱不可重複")
    operations = {
        "transforms": {
            "trim": ("field",), "arrow_last": ("field",),
            "replace": ("field", "old", "new"), "remove_chars": ("field", "chars"),
            "strip_integer_decimal": ("field",), "zero_pad": ("field", "width"),
            "coalesce": ("field", "fields", "overwrite"),
            "date_format": ("field", "input_format", "output_format"),
        },
        "filters": {
            "drop_empty_rows": (), "drop_empty_field": ("field",),
            "drop_contains": ("fields", "value", "case_sensitive"),
            "keep_digits": ("field", "length"),
        },
    }
    for kind, available in operations.items():
        _list(rules[kind], kind)
        for index, item in enumerate(rules[kind], 1):
            label = f"{kind}第{index}項"
            if not isinstance(item, dict) or not isinstance(item.get("op"), str) or item["op"] not in available:
                raise ValueError(label + "操作不支援")
            params = available[item["op"]]
            _keys(item, ("op", *params), label)
            for param in params:
                val = item.get(param, False if param == "case_sensitive" else None)
                if param in ("width", "length"):
                    _integer(val, label + param, 100)
                elif param == "case_sensitive":
                    if type(val) is not bool:
                        raise ValueError(label + "大小寫設定須為布林值")
                elif param == "fields":
                    if val != "all" or kind == "transforms":
                        _texts(val, label + "欄位清單", nonempty=True)
                elif param == "overwrite":
                    if val not in ("always", "if_empty"):
                        raise ValueError(label + "覆寫須為always或if_empty")
                else:
                    _text(val, label + param, empty=param == "new")
                    if param == "field" and not val.strip():
                        raise ValueError(label + "欄位不可只含空白")
    if __package__:
        from .source_advanced import validate_advanced
    else:
        from source_advanced import validate_advanced
    validate_advanced(rules)
    return rules


def _match(text, mode):
    value = str(text)
    if mode == "compact_casefold":
        return re.sub(r"\s+", "", value).casefold()
    return value.strip().casefold() if mode == "trim_casefold" else value


def _sample(frame, row_offset=None):
    # ponytail: 回應最多20列、100欄、每格500字；預覽先限制傳輸量，超大檔另加串流讀取。
    sample = {"columns": list(frame.columns)[:100], "rows": [[str(value)[:500] for value in row] for row in frame.iloc[:20, :100].itertuples(index=False, name=None)]}
    if row_offset is not None:
        sample["row_numbers"] = [int(index + row_offset) for index in frame.index[:20]]
    return sample


def _read_sheet(workbook, sheet, rules, detail=None):
    import pandas as pd

    preview = workbook.parse(sheet, header=None, nrows=(rules["header_row"] if rules["header_mode"] == "fixed" else rules["scan_rows"]), dtype=str, keep_default_na=False)
    row_index = rules["header_row"] - 1
    if rules["header_mode"] == "scan":
        row_index = None
        for index, row in preview.iterrows():
            cells = [_match(cell, rules["header_match"]) for cell in row]
            hits = [any((keyword == cell if rules["keyword_match"] == "cell_exact" else keyword in cell) for cell in cells)
                    for keyword in (_match(word, rules["header_match"]) for word in rules["header_keywords"])]
            if (all(hits) if rules["keyword_condition"] == "all" else any(hits)):
                row_index = index
                break
    if row_index is None or row_index >= len(preview):
        raise ValueError("找不到表頭，請檢查表頭列或掃描關鍵字")
    headers = [str(value) for value in preview.iloc[row_index]]
    frame = workbook.parse(sheet, header=row_index, dtype=str, keep_default_na=False)
    headers.extend([""] * (len(frame.columns) - len(headers)))
    if detail is not None:
        detail.update(header_row=int(row_index + 1), headers=headers)
    if not any(name.strip() for name in headers):
        raise ValueError("表頭全空")
    named_headers = [name for name in headers if name.strip()]
    normalized = [_match(name, rules["column_match"]) for name in named_headers]
    positional = any("position" in column for column in rules["columns"])
    name_mapped = any("position" not in column for column in rules["columns"])
    duplicate_headers = len(set(named_headers)) != len(named_headers)
    ambiguous_headers = name_mapped and len(set(normalized)) != len(normalized)
    if (duplicate_headers or ambiguous_headers) and not positional:
        raise ValueError("原始表頭有重複或匹配歧義，請先區分欄名")
    positions = {column["position"] - 1 for column in rules["columns"] if "position" in column}
    kept = [index for index, name in enumerate(headers) if name.strip() or index in positions]
    frame = frame.iloc[:, kept].copy()
    frame.columns = [headers[index] for index in kept]
    if detail is not None:
        detail.update(header_row=int(row_index + 1), input_rows=len(frame), mappings=[], warnings=[], steps=[])
        if detail.get("sample_enabled"):
            detail["before"] = _sample(frame, row_index + 2)
    frame.columns = kept
    if len(named_headers) != len(headers):
        print(f"  ⚠️ {sheet}略過空白欄名")
        if detail is not None:
            detail["warnings"].append("略過空白欄名")
    rename, selected = {}, []
    generated = {item["target"] for item in rules["cell_values"]}
    generated.update(pair["target"] for item in rules["lookups"] for pair in item["fields"])
    generated.update(item[name] for item in rules["splits"] for name in ("quantity_field", "total_field", "mark_field") if item.get(name))
    generated.update(item["field"] for item in rules["transforms"] if item["op"] == "coalesce")
    for column in rules["columns"]:
        original = None
        if "position" in column:
            position = column["position"] - 1
            original = position if position in kept else None
        for alias in ([] if "position" in column else column.get("aliases", [])):
            matches = [index for index in kept if _match(headers[index], rules["column_match"]) == _match(alias, rules["column_match"])]
            if len(matches) > 1:
                raise ValueError(f"欄位{column['name']}候選{alias}匹配歧義")
            if matches:
                original = matches[0]
                break
        if original is None:
            if column["name"] in generated:
                selected.append(column["name"])
                continue
            if column.get("required", False):
                raise ValueError(f"缺少必需欄位：{column['name']}，候選：{column.get('aliases', [])}，位置：{column.get('position', '')}；實際：{headers}")
            print(f"  ⚠️ {sheet}缺少非必需欄位：{column['name']}")
            if detail is not None:
                detail["warnings"].append(f"缺少非必需欄位：{column['name']}")
            continue
        if original in rename:
            raise ValueError(f"原欄位{original}被重複選取")
        rename[original] = column["name"]
        selected.append(column["name"])
    frame.columns = [rename.get(index, headers[index]) for index in kept]
    if detail is not None:
        detail["mappings"] = [{"original": headers[index], "position": index + 1, "output": rename.get(index, headers[index])} for index in kept]
    if len(set(frame.columns)) != len(frame.columns):
        raise ValueError("欄位改名後撞名")
    if __package__:
        from .source_advanced import cell_values, split_rows, date_value
    else:
        from source_advanced import cell_values, split_rows, date_value
    frame = cell_values(frame, workbook, sheet, rules["cell_values"], detail)
    for index, transform in enumerate(rules["transforms"], 1):
        field, op = transform["field"], transform["op"]
        if op == "coalesce":
            if field not in frame:
                frame[field] = ""
            missing = [name for name in transform["fields"] if name not in frame]
            if missing:
                raise ValueError(f"轉換第{index}項補值候選欄缺少：{missing}")
        if field not in frame.columns:
            raise ValueError(f"轉換第{index}項{op}找不到欄位：{field}")
        values = frame[field].astype(str)
        if op == "trim":
            values = values.str.strip()
        elif op == "arrow_last":
            values = values.map(lambda text: next((part.strip() for part in reversed(re.split(r"->|→|>", text)) if part.strip()), "") if re.search(r"->|→|>", text) else text)
        elif op == "replace":
            values = values.str.replace(transform["old"], transform["new"], regex=False)
        elif op == "remove_chars":
            values = values.str.translate(str.maketrans("", "", transform["chars"]))
        elif op == "strip_integer_decimal":
            values = values.str.replace(r"^([0-9]+)\.0+$", r"\1", regex=True)
        elif op == "zero_pad":
            values = values.map(lambda text: text.zfill(transform["width"]) if re.fullmatch(r"[0-9]+", text) else text)
        elif op == "coalesce":
            candidates = frame[transform["fields"]].astype(str)
            replacement = candidates.apply(lambda row: next((value for value in row if value.strip()), ""), axis=1)
            values = replacement if transform["overwrite"] == "always" else values.where(~values.str.strip().eq(""), replacement)
        elif op == "date_format":
            try:
                values = values.map(lambda value: date_value(value, transform["input_format"], transform["output_format"]) if value.strip() else "")
            except ValueError as error:
                raise ValueError(f"轉換第{index}項日期格式不符：{error}") from error
        frame[field] = values
        if detail is not None:
            detail["steps"].append({"kind": "transform", "index": index, "op": op, "rows": len(frame)})
    for index, condition in enumerate(rules["filters"], 1):
        op = condition["op"]
        fields = (list(frame.columns) if condition.get("fields") == "all" or op == "drop_empty_rows"
                  else condition.get("fields", [condition.get("field")]))
        missing = [name for name in fields if name not in frame.columns]
        if missing:
            raise ValueError(f"過濾第{index}項{op}找不到欄位：{missing}")
        values = frame[fields].astype(str)
        if op == "drop_contains":
            drop = values.apply(lambda col: col.str.contains(condition["value"], case=condition.get("case_sensitive", False), regex=False)).any(axis=1)
        elif op == "keep_digits":
            drop = ~values.iloc[:, 0].str.fullmatch(r"[0-9]{" + str(condition["length"]) + r"}")
        else:
            drop = values.apply(lambda col: col.str.strip().eq("")).all(axis=1)
        frame = frame.loc[~drop].copy()
        if detail is not None:
            detail["steps"].append({"kind": "filter", "index": index, "op": op, "rows": len(frame)})
    frame = split_rows(frame, rules["splits"], detail)
    if rules["column_mode"] == "select" and not selected:
        raise ValueError("沒有可用輸出欄位")
    print(f"  ✅ {sheet}表頭第{row_index + 1}列，讀取{len(frame)}筆")
    if detail is not None:
        detail.update(filtered_rows=len(frame))
        if detail.get("sample_enabled"):
            detail["after"] = _sample(frame, row_index + 2)
    return frame, selected


def process_rule_source(source, report=None, db_path=None):
    import pandas as pd

    rules = validate_rules(source["rules"])
    if report is not None:
        report.update(files=[], output_rows=0, before_deduplicate=0)
    if rules is None:
        raise ValueError("未指定匯入規則")
    if rules["sheet_mode"] in ("exact", "contains") and not source["sheet_rule"]:
        raise ValueError("工作表名稱或關鍵字不可空白")
    path = Path(source["path"])
    suffixes = {"excel": (".xls", ".xlsx", ".xlsm"), "eml": (".eml",), "msg": (".msg",), "mixed": (".xls", ".xlsx", ".xlsm", ".eml", ".msg")}[rules["input_format"]]
    files = ([path] if source["file_rule"] in path.name else []) if source["path_kind"] == "file" else [
        item for item in path.iterdir() if item.is_file()
        and item.suffix.lower() in suffixes
        and not item.name.startswith("~$") and source["file_rule"] in item.name
    ]
    candidates = sorted(files, key=lambda item: (-item.stat().st_mtime, item.name))
    files = candidates[:1 if rules["file_strategy"] == "latest" else (source["recent_files"] or 1)]
    if not files:
        raise ValueError("找不到符合條件的來源檔案")
    if any(file.suffix.lower() not in suffixes for file in files):
        raise ValueError("檔案副檔名與所選來源格式不符")
    if __package__:
        from .source_mail import open_source, expand_bases, merge_batches
    else:
        from source_mail import open_source, expand_bases, merge_batches
    files = expand_bases(files, candidates, rules)
    frames, selected, failures = [], [], []
    batches = []
    sampled_sheets = 0
    for file in files:
        file_frames, file_selected = [], []
        file_detail = {"file": str(file), "sheets": [], "error": None, "used": False}
        if report is not None:
            report["files"].append(file_detail)
        try:
            print(f"  📂 {source['label']}讀取：{file.name}")
            with open_source(file, rules) as (workbook, metadata):
                file_detail.update(metadata)
                available = workbook.sheet_names
                mode = rules["sheet_mode"]
                if mode == "first":
                    sheets = available[:1]
                elif mode == "list":
                    sheets = []
                    for name in rules["sheet_names"]:
                        matches = [sheet for sheet in available if _match(name, rules["sheet_match"]) == _match(sheet, rules["sheet_match"])]
                        if len(matches) != 1 or matches[0] in sheets:
                            raise ValueError(f"工作表{name}缺少、重複或匹配歧義；實際：{available}")
                        sheets.append(matches[0])
                else:
                    query = _match(source["sheet_rule"], rules["sheet_match"])
                    matches = [sheet for sheet in available if (query == _match(sheet, rules["sheet_match"]) if mode == "exact" else query in _match(sheet, rules["sheet_match"]))]
                    if mode == "exact" and len(matches) > 1:
                        raise ValueError("工作表名稱匹配歧義")
                    sheets = matches[:1]
                if not sheets:
                    raise ValueError(f"找不到工作表{source['sheet_rule']}；實際：{available}")
                for sheet in sheets:
                    detail = {"sheet": sheet, "sample_enabled": sampled_sheets < 10}
                    sampled_sheets += 1
                    file_detail["sheets"].append(detail)
                    try:
                        frame, fields = _read_sheet(workbook, sheet, rules, detail if report is not None else None)
                    except Exception as error:
                        detail["error"] = str(error)
                        raise ValueError(f"工作表{sheet}：{error}") from error
                    file_frames.append(frame)
                    file_selected.extend(name for name in fields if name not in file_selected)
            if not any(not frame.empty for frame in file_frames):
                raise ValueError("處理後沒有有效資料")
        except Exception as error:
            detail = f"檔案{file.name}：{error}"
            file_detail["error"] = str(error)
            if rules["file_strategy"] != "first_valid":
                raise ValueError(detail) from error
            print(f"  ⚠️ {source['label']}回溯：{detail}")
            failures.append(detail)
            continue
        frames.extend(file_frames)
        batches.append((metadata, pd.concat(file_frames, ignore_index=True).fillna("")))
        file_detail["used"] = True
        selected.extend(name for name in file_selected if name not in selected)
        if rules["file_strategy"] == "first_valid":
            break
    if not frames:
        raise ValueError("所有回溯檔案皆失敗：" + "；".join(failures))
    result = merge_batches(batches, rules["mail"]["update_keys"], report)
    if __package__:
        from .source_advanced import apply_lookups
    else:
        from source_advanced import apply_lookups
    result = apply_lookups(result, rules["lookups"], db_path, report)
    if rules["column_mode"] == "select":
        order = [column["name"] for column in rules["columns"] if column["name"] in selected]
        result = result[order]
    if rules["deduplicate"] == "all_columns":
        if report is not None:
            report["before_deduplicate"] = len(result)
        result = result.drop_duplicates(keep="first")
    if report is not None:
        if rules["deduplicate"] == "none":
            report["before_deduplicate"] = len(result)
        report.update(output_rows=len(result), output=_sample(result))
    return result
