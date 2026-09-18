"""可由共用規則執行的內建來源範本，以及仍須專用處理器的摘要。"""
from .source_migration import migration_source

EDITABLE = {"yingbang", "lunfei", "dcg", "fzg"}
EDITABLE_SUMMARY = {
    "yingbang": "可編輯候選：多工作表、欄位選取與 PO 別名。舊流程的 NA 值與部分分頁／表頭容錯仍可能不同；勾選並儲存後才切換。",
    "lunfei": "可編輯候選：欄位別名與標準化。舊流程的符號移除及表頭未命中回第 1 列仍可能不同；勾選並儲存後才切換。",
    "dcg": "可編輯候選：欄位選取、製令單號移除分隔符與補零。舊流程只對特定日期形狀補零，短日期可能不同；勾選並儲存後才切換。",
    "fzg": "可編輯候選：工作表包含匹配、逐檔回溯與全部欄位。舊流程跨儲存格拼字、符號清理及表頭回退仍可能不同；勾選並儲存後才切換。",
}
SPECIAL = {
    "bng": "Email 特殊規則：EML／MSG 抽表、RE／FW 原信補齊與局部更新、多工單拆列、MAC 計算、FCST 與 BIOS 補值。現有表單無法完整等價，繼續使用專用處理器。",
    "koya": "KOYA 特殊規則：空白欄定位、八位工單與小數尾碼處理、逐檔跳過、月份擷取、Model／PN／PO 主檔補值。現有表單無法完整等價，繼續使用專用處理器。",
    "bng_fcst": "超恩 FCST 對照來源：由超恩 Email 特殊規則讀取，不能獨立改成出貨匯入規則。",
    "bios": "VECOW BIOS／FW 對照來源：由超恩 Email 特殊規則補值，不能獨立改成出貨匯入規則。",
    "koya_model": "KOYA Model 對照來源：由 KOYA 特殊規則補值，不能獨立改成出貨匯入規則。",
}

def preset_for(entry):
    key = entry.key
    if key not in EDITABLE:
        return None
    if key == "yingbang":
        config = {"sheet_name": entry.label, "source_folder": entry.path, "target_sheets": [x.strip() for x in entry.sheet_rule.split(",") if x.strip()], "num_files": entry.recent_files, "keep_columns": ["DDC料號", "工單", "料號", "品名", "採單號碼", "Q'TY"]}
    elif key == "lunfei":
        config = {"sheet_name": entry.label, "source_folder": entry.path, "target_sheet": entry.sheet_rule, "column_aliases": {
            "加工WO#": ["加工WO#", "加工 WO#", "加工WO", "加工工單"], "工單": ["工單", "工單#", "工令", "WO"], "P/N": ["P/N", "PN", "Part No", "PartNo"],
            "對應PCBA": ["對應PCBA", "PCBA對應", "PCBA"], "MO": ["MO", "MO#", "製令", "製令單"], "Q'ty": ["Q'ty", "Qty", "數量", "QTY"], "Model": ["Model", "機種", "型號"]}}
    elif key == "dcg":
        config = {"sheet_name": entry.label, "source_folder": entry.path, "target_sheet": entry.sheet_rule, "file_keyword": entry.file_rule,
                  "keep_columns": ["NO", "製令單號", "產品品號", "產品型號", "生產數量", "備註", "BIOS版本", "MO", "Q'ty", "DDC PN", "SN區間", "MAC", "TP"]}
    else:
        config = {"sheet_name": entry.label, "source_folder": entry.path, "target_sheet_keyword": entry.sheet_rule, "num_files": entry.recent_files,
                  "required_cols": ["PO#", "Chenbro PN", "DDC PN", "QTY", "廠 商 交 期", "DDC MO", "SUGON S/N"]}
    return migration_source(key, config)["rules"]
