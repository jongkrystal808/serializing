"""自訂來源的補值、對照及拆列；不改既有客戶處理器。"""
from datetime import datetime
from decimal import Decimal, ROUND_HALF_EVEN, ROUND_HALF_UP, ROUND_FLOOR, ROUND_CEILING
from pathlib import Path
import re
import sqlite3

if __package__:
    from .source_rules import _keys, _texts, _text, _integer, _list, _match, MATCH_MODES
else:
    from source_rules import _keys, _texts, _text, _integer, _list, _match, MATCH_MODES


def choice(value, choices, label):
    if value not in choices:
        raise ValueError(f"{label}不支援，允許：{', '.join(choices)}")


def field_name(value, label):
    _text(value, label)
    if not value.strip():
        raise ValueError(label + "不可只含空白")


def cell_position(address):
    match = re.fullmatch(r"([A-Za-z]+)([1-9][0-9]*)", address)
    if not match:
        raise ValueError(f"儲存格地址無效：{address}")
    column = 0
    for char in match[1].upper():
        column = column * 26 + ord(char) - 64
    row = int(match[2])
    if row > 1000 or column > 200:
        raise ValueError("儲存格擷取範圍限前1000列、200欄")
    return row - 1, column - 1


def date_value(value, input_format, output_format):
    return datetime.strptime(str(value).strip(), input_format).strftime(output_format)


def validate_advanced(rules):
    choice(rules["input_format"], ("excel", "eml", "msg", "mixed"), "來源格式")
    defaults = {"location": "body_or_attachment", "table": "first", "min_columns": 1, "strike": "mark", "reply_prefixes": ["RE", "FW", "FWD"], "update_keys": [], "base_search": True}
    _keys(rules["mail"], defaults, "郵件設定")
    rules["mail"] = {**defaults, **rules["mail"]}
    mail = rules["mail"]
    choice(mail["location"], ("body", "attachment", "body_or_attachment"), "郵件抽表位置")
    choice(mail["table"], ("first", "widest"), "郵件表格選擇")
    choice(mail["strike"], ("mark", "omit", "text"), "刪除線處理")
    _integer(mail["min_columns"], "郵件最低欄數", 200)
    _texts(mail["reply_prefixes"], "回覆前綴", nonempty=True)
    _texts(mail["update_keys"], "局部更新鍵")
    if type(mail["base_search"]) is not bool:
        raise ValueError("底稿回溯須為布林值")
    if mail["update_keys"] and (rules["input_format"] == "excel" or rules["file_strategy"] != "merge_recent"):
        raise ValueError("局部更新需選郵件或混合格式，且選檔策略為合併最近N檔")
    for item in rules["splits"]:
        if isinstance(item, dict) and item.get("field") in mail["update_keys"] and item.get("duplicate_keys", "error") != "error":
            raise ValueError("局部更新的工單拆列需拒絕重複鍵")
    for kind in ("cell_values", "lookups", "splits"):
        _list(rules[kind], kind)
    for index, item in enumerate(rules["cell_values"], 1):
        label = f"儲存格補值第{index}項"
        _keys(item, ("target", "cells", "format", "input_format", "output_format", "overwrite", "on_empty"), label)
        field_name(item.get("target"), label + "輸出欄")
        _texts(item.get("cells"), label + "地址", nonempty=True)
        for address in item["cells"]:
            cell_position(address)
        choice(item.get("format", "raw"), ("raw", "date"), label + "格式")
        choice(item.get("overwrite", "always"), ("always", "if_empty"), label + "覆寫")
        choice(item.get("on_empty", "error"), ("blank", "keep", "error"), label + "空值處理")
        if item.get("format") == "date":
            _text(item.get("input_format"), label + "日期輸入格式")
            _text(item.get("output_format"), label + "日期輸出格式")
    for index, item in enumerate(rules["lookups"], 1):
        label = f"對照補值第{index}項"
        _keys(item, ("kind", "path", "sheet", "header_row", "keys", "fields", "match", "key_match", "duplicate_keys", "on_unmatched", "on_source_error"), label)
        choice(item.get("kind"), ("excel", "koya_model", "nyx_model", "koya_month", "nyx_month"), label + "來源")
        if item["kind"] == "excel":
            _text(item.get("path"), label + "路徑")
            _text(item.get("sheet", ""), label + "工作表", empty=True)
            _integer(item.get("header_row", 1), label + "表頭列", 1000)
        for name in ("keys", "fields"):
            _list(item.get(name), label + name, nonempty=True)
            for pair in item[name]:
                _keys(pair, ("field", "lookup") if name == "keys" else ("lookup", "target", "overwrite"), label + name)
                for param in (("field", "lookup") if name == "keys" else ("lookup", "target")):
                    field_name(pair.get(param), label + param)
                if name == "fields":
                    choice(pair.get("overwrite", "if_empty"), ("always", "if_empty"), label + "覆寫")
            targets = [pair["field" if name == "keys" else "target"] for pair in item[name]]
            if len(set(targets)) != len(targets):
                raise ValueError(label + name + "目標不可重複")
            if name == "keys" and len({pair["lookup"] for pair in item[name]}) != len(item[name]):
                raise ValueError(label + "對照鍵欄不可重複")
        choice(item.get("match", "exact"), ("exact", "family_prefix"), label + "匹配")
        if item.get("match") == "family_prefix" and len(item["keys"]) != 1:
            raise ValueError(label + "族群前綴僅支援單一鍵")
        choice(item.get("key_match", "trim_casefold"), MATCH_MODES, label + "鍵比對")
        choice(item.get("duplicate_keys", "error"), ("error", "first", "last"), label + "重複鍵")
        choice(item.get("on_unmatched", "keep"), ("blank", "keep", "error"), label + "未匹配")
        choice(item.get("on_source_error", "error"), ("error", "blank"), label + "來源失敗")
    for index, item in enumerate(rules["splits"], 1):
        label = f"工單拆列第{index}項"
        _keys(item, ("field", "separators", "quantity_marker", "quantity_field", "calculate", "unit_field", "total_field", "mark_field", "apply_single", "duplicate_keys", "rounding", "remainder"), label)
        field_name(item.get("field"), label + "工單欄")
        _texts(item.get("separators"), label + "分隔符", nonempty=True)
        _text(item.get("quantity_marker", "*"), label + "數量標記")
        for param in ("quantity_field", "mark_field"):
            _text(item.get(param, ""), label + param, empty=True)
        choice(item.get("calculate", "none"), ("none", "multiply", "proportional"), label + "計算")
        if item.get("calculate", "none") != "none":
            field_name(item.get("total_field"), label + "總用量欄")
            if item["calculate"] == "multiply":
                field_name(item.get("unit_field"), label + "單位用量欄")
        if type(item.get("apply_single", False)) is not bool:
            raise ValueError(label + "單工單套用須為布林值")
        choice(item.get("duplicate_keys", "error"), ("error", "first", "last"), label + "重複工單")
        choice(item.get("rounding", "half_even"), ("half_even", "half_up", "floor", "ceil"), label + "捨入")
        choice(item.get("remainder", "largest"), ("largest", "first", "error"), label + "差額處理")
        target_names = [item[name] for name in ("field", "quantity_field", "total_field", "mark_field") if item.get(name)]
        if len(set(target_names)) != len(target_names):
            raise ValueError(label + "工單／數量／總用量／標記欄不可重複")
        if item.get("quantity_marker", "*") in item["separators"]:
            raise ValueError(label + "數量標記不可同時作分隔符")


def cell_values(frame, workbook, sheet, items, detail):
    for index, item in enumerate(items, 1):
        positions = [cell_position(address) for address in item["cells"]]
        cells = workbook.parse(sheet, header=None, nrows=max(row for row, _ in positions) + 1, dtype=str, keep_default_na=False)
        value = next((str(cells.iat[row, column]) for row, column in positions if row < len(cells) and column < len(cells.columns) and str(cells.iat[row, column]).strip()), "")
        target = item["target"]
        if target not in frame:
            frame[target] = ""
        if not value:
            policy = item.get("on_empty", "error")
            if policy == "error":
                raise ValueError(f"儲存格補值第{index}項找不到非空值：{item['cells']}")
            if policy == "keep":
                continue
        elif item.get("format") == "date":
            try:
                value = date_value(value, item["input_format"], item["output_format"])
            except ValueError as error:
                raise ValueError(f"儲存格補值第{index}項日期格式不符：{value}") from error
        if target not in frame:
            frame[target] = ""
        if item.get("overwrite", "always") == "always":
            frame[target] = value
        else:
            frame.loc[frame[target].astype(str).str.strip().eq(""), target] = value
        if detail is not None:
            detail["steps"].append({"kind": "cell", "index": index, "op": f"{item['cells']} → {target}", "rows": len(frame)})
    return frame


def _master(item, db_path):
    import pandas as pd
    if item["kind"] == "excel":
        with pd.ExcelFile(item["path"]) as workbook:
            row = item.get("header_row", 1) - 1
            raw = workbook.parse(item.get("sheet") or 0, header=None, nrows=row + 1, dtype=str, keep_default_na=False)
            if row >= len(raw):
                raise ValueError("對照表頭列超出範圍")
            names = [str(value) for value in raw.iloc[row]]
            frame = workbook.parse(item.get("sheet") or 0, header=row, dtype=str, keep_default_na=False)
            names.extend([""] * (len(frame.columns) - len(names)))
            kept = [index for index, name in enumerate(names) if name.strip()]
            named = [names[index] for index in kept]
            if len(set(named)) != len(named):
                raise ValueError("對照表原始欄名重複")
            frame = frame.iloc[:, kept].copy()
            frame.columns = named
            return frame
    if not db_path:
        raise ValueError("未提供既有主檔資料庫")
    uri = Path(db_path).resolve().as_uri() + "?mode=ro"
    with sqlite3.connect(uri, uri=True) as conn:
        if item["kind"] in ("koya_model", "nyx_model"):
            query = "SELECT model, pn, full_pn, po FROM koya_model" if item["kind"] == "koya_model" else "SELECT model, pn, lot FROM nyx_model"
            return pd.read_sql_query(query, conn).fillna("")
        customer = "koya" if item["kind"] == "koya_month" else "nyx"
        return pd.read_sql_query("SELECT month, value FROM monthly_reference WHERE customer = ?", conn, params=(customer,)).fillna("")


def apply_lookups(frame, items, db_path, report=None):
    for index, item in enumerate(items, 1):
        label = f"對照補值第{index}項"
        source_fields = [pair["field"] for pair in item["keys"]]
        if any(name not in frame for name in source_fields):
            raise ValueError(label + f"輸入鍵欄缺少：{source_fields}")
        try:
            master = _master(item, db_path)
            lookup_fields = [pair["lookup"] for pair in item["keys"] + item["fields"]]
            if any(name not in master for name in lookup_fields) or len(set(master.columns)) != len(master.columns):
                raise ValueError(f"主檔缺欄或欄名重複；需要{lookup_fields}；實際{list(master.columns)}")
            mode = item.get("key_match", "trim_casefold")
            mapping = {}
            for _, row in master.iterrows():
                key = tuple(_match(row[pair["lookup"]], mode) for pair in item["keys"])
                if any(not part.strip() for part in key):
                    continue
                if key in mapping:
                    policy = item.get("duplicate_keys", "error")
                    if policy == "error":
                        raise ValueError(f"主檔重複鍵：{key}")
                    if policy == "first":
                        continue
                mapping[key] = row
        except Exception as error:
            if item.get("on_source_error", "error") == "error":
                raise ValueError(f"{label}來源失敗：{error}") from error
            for pair in item["fields"]:
                frame[pair["target"]] = ""
            if report is not None:
                report.setdefault("warnings", []).append(f"{label}來源失敗，依設定清空輸出：{error}")
            continue
        matched = 0
        for pair in item["fields"]:
            if pair["target"] not in frame:
                frame[pair["target"]] = ""
        for row_index, row in frame.iterrows():
            key = tuple(_match(row[name], mode) for name in source_fields)
            found = mapping.get(key) if all(part.strip() for part in key) else None
            if found is None and all(part.strip() for part in key) and item.get("match") == "family_prefix":
                candidates = [value for pattern, value in mapping.items() if pattern[0].endswith(_match("XXXX", mode)) and key[0].startswith(pattern[0][:-4])]
                if len(candidates) > 1:
                    raise ValueError(f"{label}族群前綴匹配歧義：{key}")
                found = candidates[0] if candidates else None
            if found is None:
                policy = item.get("on_unmatched", "keep")
                if policy == "error":
                    raise ValueError(f"{label}未匹配：{key}")
                if policy == "blank":
                    for pair in item["fields"]:
                        frame.at[row_index, pair["target"]] = ""
                continue
            matched += 1
            for pair in item["fields"]:
                target = pair["target"]
                if pair.get("overwrite", "if_empty") == "always" or not str(row[target]).strip():
                    frame.at[row_index, target] = str(found[pair["lookup"]])
        if report is not None:
            report.setdefault("lookup_results", []).append({"index": index, "kind": item["kind"], "matched": matched, "unmatched": len(frame) - matched})
    return frame


def _number(value, label, positive=False):
    if not re.fullmatch(r"[0-9]+", str(value).strip()) or (positive and int(value) == 0):
        raise ValueError(f"{label}須為{'正' if positive else '非負'}整數：{value}")
    return int(value)


def split_rows(frame, items, detail=None):
    import pandas as pd
    for index, item in enumerate(items, 1):
        field = item["field"]
        if field not in frame:
            raise ValueError(f"工單拆列第{index}項找不到欄位：{field}")
        for name in ("quantity_field", "mark_field"):
            if item.get(name) and item[name] not in frame:
                frame[item[name]] = ""
        required = [item["unit_field"]] if item.get("calculate") == "multiply" else [item["total_field"]] if item.get("calculate") == "proportional" else []
        if any(name not in frame for name in required):
            raise ValueError(f"工單拆列第{index}項缺少計算欄：{required}")
        if item.get("calculate") == "multiply" and item["total_field"] not in frame:
            frame[item["total_field"]] = ""
        rows, row_indexes = [], []
        pattern = "|".join(re.escape(value) for value in sorted(item["separators"], key=len, reverse=True))
        for row_index, row in frame.iterrows():
            parts = [part.strip() for part in re.split(pattern, str(row[field])) if part.strip()]
            parsed = []
            for part in parts:
                pair = part.rsplit(item.get("quantity_marker", "*"), 1)
                order = pair[0].strip()
                quantity = _number(pair[1], "工單標記數量", True) if len(pair) == 2 else None
                if not order:
                    raise ValueError("工單標記缺少工單")
                duplicate = next((n for n, entry in enumerate(parsed) if entry[0] == order), None)
                if duplicate is not None:
                    policy = item.get("duplicate_keys", "error")
                    if policy == "error":
                        raise ValueError(f"同列重複工單：{order}")
                    if policy == "first":
                        continue
                    parsed[duplicate] = (order, quantity)
                else:
                    parsed.append((order, quantity))
            if len(parsed) < 2 and not item.get("apply_single", False):
                rows.append(row.to_dict()); row_indexes.append(row_index); continue
            if not parsed:
                rows.append(row.to_dict()); row_indexes.append(row_index); continue
            calculate = item.get("calculate", "none")
            if (calculate != "none" or item.get("quantity_field")) and any(quantity is None for _, quantity in parsed):
                raise ValueError(f"工單拆列第{index}項每筆工單需標記數量")
            totals = None
            if calculate == "multiply":
                unit = _number(row.get(item["unit_field"], ""), "單位用量")
                totals = [quantity * unit for _, quantity in parsed]
            elif calculate == "proportional":
                total = _number(row.get(item["total_field"], ""), "原總用量")
                sum_quantity = sum(quantity for _, quantity in parsed)
                fractions = [Decimal(total) * Decimal(quantity) / Decimal(sum_quantity) for _, quantity in parsed]
                rounding = {"half_even": ROUND_HALF_EVEN, "half_up": ROUND_HALF_UP, "floor": ROUND_FLOOR, "ceil": ROUND_CEILING}[item.get("rounding", "half_even")]
                totals = [int(value.to_integral_value(rounding=rounding)) for value in fractions]
                difference = total - sum(totals)
                policy = item.get("remainder", "largest")
                if difference and policy == "error":
                    raise ValueError("比例拆分捨入有差額，請指定差額分配方式")
                if difference:
                    target = 0 if policy == "first" else max(range(len(parsed)), key=lambda n: parsed[n][1])
                    totals[target] += difference
                    if totals[target] < 0:
                        raise ValueError("比例拆分差額造成負數，請改用向下捨入")
            for n, (order, quantity) in enumerate(parsed):
                copied = row.to_dict(); copied[field] = order
                if item.get("quantity_field"):
                    copied[item["quantity_field"]] = str(quantity)
                if totals is not None:
                    copied[item["total_field"]] = str(totals[n])
                if item.get("mark_field"):
                    copied[item["mark_field"]] = "拆列" if len(parsed) > 1 else "單工單"
                rows.append(copied); row_indexes.append(row_index)
        frame = pd.DataFrame(rows, index=row_indexes).fillna("") if rows else frame
        if detail is not None:
            detail["steps"].append({"kind": "split", "index": index, "op": field, "rows": len(frame)})
    return frame
