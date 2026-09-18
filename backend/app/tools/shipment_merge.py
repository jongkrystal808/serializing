# -*- coding: utf-8 -*-
"""
統一出貨記錄整合工具
將所有客戶的出貨資料整合到同一個 Excel 檔案的不同工作表中
"""

import os
import json
from functools import partial
import re
import sys
import tempfile
from pathlib import Path
from datetime import datetime, timedelta
import pandas as pd
import numpy as np
from openpyxl import load_workbook
from openpyxl.styles import Alignment, Border, Font, NamedStyle, PatternFill, Side

if __package__:
    from .source_rules import process_rule_source
    from .mail_tables import extract_raw_tables_from_html
    from .source_migration import migration_keys, compare_customer, CUSTOMERS as MIGRATION_CUSTOMERS
else:
    from source_rules import process_rule_source
    from mail_tables import extract_raw_tables_from_html
    from source_migration import migration_keys, compare_customer, CUSTOMERS as MIGRATION_CUSTOMERS


def _env_csv(name, default):
    value = os.getenv(name, default)
    return [item.strip() for item in value.split(",") if item.strip()]


def _env_positive_int(name, default):
    try:
        value = int(os.getenv(name, str(default)).strip())
        return value if value > 0 else default
    except (TypeError, ValueError):
        return default

# ============================================================================
# 基本設定
# ============================================================================

# 統一輸出檔案（可由環境變數覆蓋，便於正式機部署）
OUTPUT_FOLDER = os.getenv("SHIPMENT_OUTPUT_FOLDER", "/mnt/netdisk/TE/個人資料/To Claire")
OUTPUT_FILE = os.path.join(OUTPUT_FOLDER, "出貨記錄總表.xlsx")
LOG_FILE = os.getenv("SHIPMENT_LOG_FILE", "").strip() or "/opt/sn_generator/shipment_merge.log"

# 各客戶資料來源設定
CUSTOMER_CONFIGS = {
    "營邦": {
        "source_folder": os.getenv(
            "SHIPMENT_SOURCE_ALG",
            "/mnt/netdisk/@思創出貨計畫(營邦)ALG/NPI 生產排程/2026"
        ),
        "target_sheets": _env_csv(
            "SHIPMENT_ALG_TARGET_SHEETS",
            "試產,OEM-ZV_V3,量產機種,Eldora機種,ZV_MP,重工,MB,參展",
        ),
        "num_files": _env_positive_int("SHIPMENT_ALG_RECENT_FILES", 10),
        "keep_columns": ["DDC料號", "工單", "料號", "品名", "採單號碼", "Q'TY"],
        "sheet_name": "營邦出貨"
    },
    "倫飛": {
        "source_folder": os.getenv(
            "SHIPMENT_SOURCE_BAG",
            "/mnt/netdisk/@思創出貨計畫(倫飛)/FCST"
        ),
        "target_sheet": os.getenv("SHIPMENT_BAG_TARGET_SHEET", "FCST"),
        "column_aliases": {
            "加工WO#": ["加工WO#", "加工 WO#", "加工WO", "加工工單"],
            "工單": ["工單", "工單#", "工令", "WO"],
            "P/N": ["P/N", "PN", "Part No", "PartNo"],
            "對應PCBA": ["對應PCBA", "PCBA對應", "PCBA"],
            "MO": ["MO", "MO#", "製令", "製令單"],
            "Q'ty": ["Q'ty", "Qty", "數量", "QTY"],
            "Model": ["Model", "機種", "型號"],
        },
        "sheet_name": "倫飛出貨"
    },
    "超恩": {
        "source_folder": os.getenv(
            "SHIPMENT_SOURCE_BNG",
            "/mnt/netdisk/TE/個人資料/To Claire"
        ),
        "keep_columns": ["日期", "MAC板子用量數量", "工單", "機種名稱", "機種料號",
                         "生產數量", "MAC數量", "MAC Address", "序號區間", "UUID區間"],
        "num_files": _env_positive_int("SHIPMENT_BNG_RECENT_FILES", 4),
        "sheet_name": "超恩出貨"
    },
    "KOYA": {
        "source_folder": os.getenv(
            "SHIPMENT_SOURCE_CHG",
            "/mnt/netdisk/@思創出貨資料(KOYA)"
        ),
        "target_sheet": os.getenv("SHIPMENT_CHG_TARGET_SHEET", "統計表"),
        "keep_columns": ["工單", "機種", "批量", "滿箱數量", "需求", "尾數數量", "小張貼紙"],
        "num_files": _env_positive_int("SHIPMENT_CHG_RECENT_FILES", 4),
        "sheet_name": "KOYA出貨"
    },
    "富弘年": {
        "source_folder": os.getenv(
            "SHIPMENT_SOURCE_DCG",
            "/mnt/netdisk/@思創出貨資料(富弘年)"
        ),
        "target_sheet": os.getenv("SHIPMENT_DCG_TARGET_SHEET", "生產排程表 2026"),
        "file_keyword": os.getenv("SHIPMENT_DCG_FILE_KEYWORD", "出貨"),
        "keep_columns": ["NO", "製令單號", "產品品號", "產品型號", "生產數量", "備註",
                         "BIOS版本", "MO", "Q'ty", "DDC PN", "SN區間", "MAC", "TP"],
        "sheet_name": "富弘年出貨"
    },
    "勤誠": {
        "source_folder": os.getenv(
            "SHIPMENT_SOURCE_FZG",
            "/mnt/netdisk/@思創出貨計畫(勤誠)/2026 交期確認表"
        ),
        "target_sheet_keyword": os.getenv("SHIPMENT_FZG_SHEET_KEYWORD", "0911"),
        "required_cols": ["PO#", "Chenbro PN", "DDC PN", "QTY", "廠 商 交 期", "DDC MO", "SUGON S/N"],
        "num_files": _env_positive_int("SHIPMENT_FZG_RECENT_FILES", 10),
        "sheet_name": "勤誠出貨"
    }
}


# ============================================================================
# 通用輔助函式
# ============================================================================

def normalize_text(s):
    """欄位名稱標準化（移除空白、符號等）"""
    if s is None:
        return ""
    s = str(s).replace(" ", "").replace("　", "").replace("'", "'")
    s = re.sub(r"[^a-zA-Z0-9\u4e00-\u9fff#']", "", s)
    return s.lower()


def find_latest_excels(folder, limit=10):
    """取得最新多個 Excel（供回溯使用）"""

    files = [
        f for f in os.listdir(folder)
        if f.lower().endswith((".xls", ".xlsx", ".xlsm"))
           and not f.startswith("~$")
    ]

    files = sorted(
        files,
        key=lambda f: os.path.getmtime(os.path.join(folder, f)),
        reverse=True
    )

    return [
        os.path.join(folder, f)
        for f in files[:limit]
    ]


def write_log(message):
    """寫入執行記錄"""
    os.makedirs(os.path.dirname(LOG_FILE) or ".", exist_ok=True)
    timestamp = datetime.now().strftime('%Y-%m-%d %H:%M:%S')
    with open(LOG_FILE, "a", encoding="utf-8") as log:
        log.write(f"[{timestamp}] {message}\n")


# ============================================================================
# 各客戶資料處理函式
# ============================================================================

def process_alg():
    """處理營邦出貨（回溯穩定版）"""

    print("\n🟢 處理營邦出貨...")
    config = CUSTOMER_CONFIGS["營邦"]

    files = find_latest_excels(
        config["source_folder"],
        limit=config["num_files"]
    )

    if not files:
        print("  ❌ 找不到來源檔案")
        return None

    for file_path in files:

        try:
            print(f"  📂 嘗試: {os.path.basename(file_path)}")

            all_sheets = pd.read_excel(
                file_path,
                sheet_name=config["target_sheets"],
                header=None,
                dtype=str,
                engine="openpyxl"
            )

            combined_data = []

            for sheet in config["target_sheets"]:

                if sheet not in all_sheets:
                    continue

                df_raw = all_sheets[sheet]

                header_row = None

                for i in range(min(5, len(df_raw))):

                    if any(
                            str(x).strip() in config["keep_columns"]
                            or str(x).strip() == "PO號碼"
                            for x in df_raw.iloc[i].values
                    ):
                        header_row = i
                        break

                if header_row is None:
                    continue

                df = df_raw.iloc[header_row:].reset_index(drop=True)

                df.columns = df.iloc[0]
                df = df[1:].reset_index(drop=True)

                # 處理重複欄名
                seen = {}
                new_cols = []

                for c in df.columns:

                    name = str(c).strip() or "Unnamed"

                    if name in seen:
                        seen[name] += 1
                        name = f"{name}_{seen[name]}"
                    else:
                        seen[name] = 1

                    new_cols.append(name)

                df.columns = new_cols

                # PO號碼 → 採單號碼
                if "採單號碼" not in df.columns and "PO號碼" in df.columns:
                    df["採單號碼"] = df["PO號碼"]

                available_cols = [
                    col for col in config["keep_columns"]
                    if col in df.columns
                ]

                if available_cols:
                    combined_data.append(df[available_cols].copy())

            if combined_data:

                result = pd.concat(combined_data, ignore_index=True)

                print(f"  ✅ 使用檔案: {os.path.basename(file_path)}")
                write_log(f"營邦出貨: {os.path.basename(file_path)}, {len(result)}筆")

                return result

            else:
                print("    ⚠️ 無有效資料，換下一個")

        except Exception as e:

            print(f"    ⚠️ 失敗: {e}")
            continue

    print("  ❌ 所有檔案皆失敗")
    return None


def process_bag():
    """處理倫飛出貨資料"""
    print("\n🔵 處理倫飛出貨...")
    config = CUSTOMER_CONFIGS["倫飛"]

    try:
        latest_file = find_latest_excel(config["source_folder"])
        if not latest_file:
            print("  ❌ 找不到來源檔案")
            return None

        print(f"  📂 {os.path.basename(latest_file)}")

        with pd.ExcelFile(latest_file, engine="openpyxl") as workbook:
            # 偵測表頭
            preview = pd.read_excel(workbook, sheet_name=config["target_sheet"],
                                    header=None, nrows=10)
            header_row = 0
            keywords = ["MO", "P/N", "PN"]
            for i, row in preview.iterrows():
                row_values = " ".join(str(x) for x in row.values if pd.notna(x))
                if any(k.lower() in row_values.lower() for k in keywords):
                    header_row = i
                    break

            # 讀取資料
            df = pd.read_excel(workbook, sheet_name=config["target_sheet"],
                               header=header_row, dtype=str, keep_default_na=False)

        # 欄位匹配
        normalized_cols = {normalize_text(c): c for c in df.columns}
        selected_cols = {}

        for std_name, aliases in config["column_aliases"].items():
            for alias in aliases:
                alias_norm = normalize_text(alias)
                match = next((orig for key, orig in normalized_cols.items() if key == alias_norm), None)
                if match:
                    selected_cols[std_name] = match
                    break

        if not selected_cols:
            print("  ❌ 無法匹配欄位")
            return None

        rename_map = {v: k for k, v in selected_cols.items()}
        result = df.rename(columns=rename_map)
        result = result[[col for col in config["column_aliases"].keys() if col in result.columns]]

        print(f"  ✅ 成功 ({len(result)} 筆)")
        write_log(f"倫飛出貨: {os.path.basename(latest_file)}, {len(result)}筆")
        return result

    except Exception as e:
        print(f"  ❌ 錯誤: {e}")
        return None


# ============================================================================
# 新增：載入超恩 FCST 產銷計畫表
# ============================================================================

def load_fcst_bng():
    """
    讀取超恩 FCST 產銷計畫表（2026 sheet），
    回傳包含 PO / Model / MO 的 DataFrame，供後續 join 使用。
    """
    FCST_FOLDER = os.getenv("SHIPMENT_FCST_FOLDER", "/mnt/netdisk/@思創出貨計畫(超恩)")
    FCST_KEYWORD = os.getenv("SHIPMENT_FCST_KEYWORD", "超恩FCST產銷計畫表")
    FCST_SHEET = os.getenv("SHIPMENT_FCST_SHEET", "2026")

    print(f"  📋 載入 FCST 表（{FCST_KEYWORD}）...")

    try:
        # 找出檔名含關鍵字的最新檔案
        files = [
            f for f in os.listdir(FCST_FOLDER)
            if FCST_KEYWORD in f
            and f.lower().endswith((".xls", ".xlsx", ".xlsm"))
            and not f.startswith("~$")
        ]

        if not files:
            print(f"  ⚠️  找不到 FCST 檔案（關鍵字：{FCST_KEYWORD}）")
            return None

        latest = max(files, key=lambda f: os.path.getmtime(os.path.join(FCST_FOLDER, f)))
        file_path = os.path.join(FCST_FOLDER, latest)
        print(f"  📂 FCST 檔案: {latest}")

        with pd.ExcelFile(file_path, engine="openpyxl") as workbook:
            # 先找表頭列（掃前10列，找到含 'PO' 的那列）
            df_preview = pd.read_excel(
                workbook, sheet_name=FCST_SHEET,
                header=None, nrows=10, dtype=str,
            )

            header_row = 0
            for i, row in df_preview.iterrows():
                row_vals = [str(v).strip() for v in row.values if pd.notna(v)]
                if any(re.search(r"po", v, re.IGNORECASE) for v in row_vals):
                    header_row = i
                    break

            df = pd.read_excel(
                workbook, sheet_name=FCST_SHEET,
                header=header_row, dtype=str, keep_default_na=False,
            )

        # 模糊匹配欄位名稱
        df.columns = [str(c).strip() for c in df.columns]

        col_map = {}
        for col in df.columns:
            col_lower = col.lower()
            col_clean = re.sub(r"[\s#號]", "", col_lower)  # 移除空白、#、號

            if re.search(r"^po", col_clean) and "PO" not in col_map:
                col_map["PO"] = col
            elif re.search(r"^model$", col_clean) and "Model" not in col_map:
                col_map["Model"] = col
            elif re.search(r"^mo$", col_clean) and "MO" not in col_map:
                col_map["MO"] = col

        missing = [k for k in ["PO", "Model", "MO"] if k not in col_map]
        if missing:
            print(f"  ⚠️  FCST 表找不到欄位: {missing}，可用欄位: {df.columns.tolist()}")
            return None

        result = df[[col_map["PO"], col_map["Model"], col_map["MO"]]].copy()
        result.columns = ["PO", "Model", "MO"]

        # 去除空白 PO
        result = result[result["PO"].str.strip() != ""]
        result = result.drop_duplicates(subset=["PO"])

        print(f"  ✅ FCST 表載入成功，共 {len(result)} 筆 PO")
        return result

    except Exception as e:
        print(f"  ❌ FCST 表載入失敗: {e}")
        import traceback
        traceback.print_exc()
        return None



# ============================================================================
# 載入 VECOW BIOS/FW 對照表
# ============================================================================

def load_bios_table():
    """
    讀取 VECOW 各機種 BIOS/FW 一覽表（List sheet），
    回傳包含 料號 / 新版BIOS(以此為主) / IGN FW版本 的 DataFrame。
    """
    BIOS_FILE = os.getenv(
        "SHIPMENT_BIOS_FILE",
        "/mnt/netdisk/TE/個人資料/To Claire/VECOW各機種BIOSFW測試程式一覽表.xlsx"
    )
    BIOS_SHEET = os.getenv("SHIPMENT_BIOS_SHEET", "List")

    print(f"  📋 載入 BIOS/FW 對照表...")

    try:
        with pd.ExcelFile(BIOS_FILE, engine="openpyxl") as workbook:
            # 掃前5列，找到含「料號」的那列當表頭
            df_preview = pd.read_excel(
                workbook, sheet_name=BIOS_SHEET,
                header=None, nrows=5, dtype=str,
            )

            header_row = 1  # 預設
            for i, row in df_preview.iterrows():
                row_vals = [str(v).strip() for v in row.values if pd.notna(v) and str(v).strip()]
                if "料號" in row_vals:
                    header_row = i
                    break

            df = pd.read_excel(
                workbook, sheet_name=BIOS_SHEET,
                header=header_row, dtype=str, keep_default_na=False,
            )

        df.columns = [str(c).strip() for c in df.columns]

        # 模糊匹配欄位
        col_map = {}
        for col in df.columns:
            col_s = col.strip()
            if col_s == "料號" and "料號" not in col_map:
                col_map["料號"] = col
            elif re.search(r"新版bios", col_s, re.IGNORECASE) and "新版BIOS(以此為主)" not in col_map:
                col_map["新版BIOS(以此為主)"] = col
            elif re.search(r"ign.*fw|fw.*ign", col_s, re.IGNORECASE) and "IGN FW版本" not in col_map:
                col_map["IGN FW版本"] = col

        missing = [k for k in ["料號", "新版BIOS(以此為主)", "IGN FW版本"] if k not in col_map]
        if missing:
            print(f"  ⚠️  BIOS 表找不到欄位: {missing}，可用欄位: {df.columns.tolist()}")
            return None

        result = df[[col_map["料號"], col_map["新版BIOS(以此為主)"], col_map["IGN FW版本"]]].copy()
        result.columns = ["料號", "新版BIOS(以此為主)", "IGN FW版本"]

        # 去除空白料號與重複
        result = result[result["料號"].str.strip() != ""]
        result = result.drop_duplicates(subset=["料號"])

        print(f"  ✅ BIOS 表載入成功，共 {len(result)} 筆料號")
        return result

    except Exception as e:
        print(f"  ❌ BIOS 表載入失敗: {e}")
        import traceback
        traceback.print_exc()
        return None


# ============================================================================
# 超恩出貨處理主函式
# ============================================================================

def is_reply_mail_filename(file_path):
    """判斷檔名是否為回覆/轉寄郵件（RE/FW/FWD）。"""
    name = os.path.splitext(os.path.basename(file_path))[0]
    return bool(re.match(r"^\s*(?:re|fw|fwd)\s*[:：_\-\s]+", name, flags=re.IGNORECASE))


def normalize_mail_thread_key(file_path):
    """將郵件檔名正規化為同主題 key（忽略 RE/FW 前綴）。"""
    key = os.path.splitext(os.path.basename(file_path))[0].strip()
    pattern = re.compile(r"^\s*(?:re|fw|fwd)\s*[:：_\-\s]+", flags=re.IGNORECASE)

    while True:
        new_key = pattern.sub("", key).strip()
        if new_key == key:
            break
        key = new_key

    return re.sub(r"\s+", "", key).lower()


def select_bng_files_for_processing(all_files, max_recent=4):
    """
    先選最近檔案，再補齊 RE/FW 對應的原始郵件。
    RE 可能只含局部更新，需保留原始郵件做底稿。
    """
    sorted_files = sorted(all_files, key=lambda x: x["mtime"], reverse=True)
    selected = sorted_files[:max_recent]
    selected_paths = {f["path"] for f in selected}

    added_original_count = 0

    for f in list(selected):
        if f["type"] not in {"eml", "msg"}:
            continue
        if not is_reply_mail_filename(f["path"]):
            continue

        thread_key = normalize_mail_thread_key(f["path"])

        original_candidates = [
            x for x in sorted_files
            if x["type"] in {"eml", "msg"}
            and not is_reply_mail_filename(x["path"])
            and normalize_mail_thread_key(x["path"]) == thread_key
        ]

        if not original_candidates:
            continue

        original = max(original_candidates, key=lambda x: x["mtime"])
        if original["path"] in selected_paths:
            continue

        selected.append(original)
        selected_paths.add(original["path"])
        added_original_count += 1
        print(
            f"  ➕ RE 郵件補齊原始底稿: {os.path.basename(original['path'])}"
        )

    if added_original_count > 0:
        print(f"  ✅ 已補齊 {added_original_count} 個 RE 對應原始郵件")

    selected.sort(key=lambda x: x["mtime"], reverse=True)
    return selected


def merge_bng_partial_updates_by_partno(dfs_with_meta):
    """
    RE 郵件僅更新部分料號時，用「工單 + 機種料號」做局部替換：
    1) 先保留原始資料
    2) 逐封套用 RE，刪除舊雙鍵列後加入 RE 新列
    """
    combined = pd.concat(dfs_with_meta, ignore_index=True)

    if "__is_reply" not in combined.columns:
        return combined

    base_df = combined[~combined["__is_reply"].astype(bool)].copy()
    reply_df = combined[combined["__is_reply"].astype(bool)].copy()

    if reply_df.empty:
        return combined

    result = base_df.copy()
    total_replaced = 0

    reply_order = (
        reply_df[["__source_path", "__source_mtime"]]
        .drop_duplicates()
        .sort_values("__source_mtime")
    )

    for _, row in reply_order.iterrows():
        source_path = row["__source_path"]
        patch_df = reply_df[reply_df["__source_path"] == source_path].copy()

        required_cols = ["工單", "機種料號"]
        has_required_cols = all(c in patch_df.columns and c in result.columns for c in required_cols)

        if has_required_cols:
            patch_keys_df = patch_df[required_cols].astype(str).apply(lambda c: c.str.strip())
            patch_keys_df = patch_keys_df[
                (patch_keys_df["工單"] != "") &
                (patch_keys_df["機種料號"] != "") &
                (patch_keys_df["工單"].str.lower() != "nan") &
                (patch_keys_df["機種料號"].str.lower() != "nan")
            ]
            keys = set(zip(patch_keys_df["工單"], patch_keys_df["機種料號"]))

            replaced_count = 0
            if keys:
                before = len(result)
                result_key_df = result[required_cols].astype(str).apply(lambda c: c.str.strip())
                result_pairs = list(zip(result_key_df["工單"], result_key_df["機種料號"]))
                keep_mask = [pair not in keys for pair in result_pairs]
                result = result.loc[keep_mask].copy()
                replaced_count = before - len(result)
                total_replaced += replaced_count

            print(
                f"  🔁 套用 RE 更新: {os.path.basename(source_path)} "
                f"(雙鍵 {len(keys)} 筆，替換舊列 {replaced_count} 筆)"
            )
        else:
            print(
                f"  ⚠️ RE 更新略過雙鍵替換（缺少工單/機種料號欄）: {os.path.basename(source_path)}"
            )

        result = pd.concat([result, patch_df], ignore_index=True)

    if total_replaced > 0:
        print(f"  ✅ RE 局部更新完成，共替換 {total_replaced} 筆舊資料")

    result = result.drop_duplicates(keep="last")
    return result


def _to_int_safe(value):
    """安全轉整數；失敗回傳 None。"""
    if value is None or (isinstance(value, float) and np.isnan(value)):
        return None
    text = str(value).strip()
    if not text or text.lower() == "nan":
        return None
    text = text.replace(",", "")
    if re.fullmatch(r"-?\d+", text):
        return int(text)
    if re.fullmatch(r"-?\d+\.\d+", text):
        try:
            return int(float(text))
        except ValueError:
            return None
    return None


def parse_bng_work_orders(work_order_text):
    """
    解析超恩工單欄位，支援：
    1) 單筆：51025B0032
    2) 多筆同列：5102620024*100 5102630018*100
    回傳 [(工單, 數量或None), ...]
    """
    if work_order_text is None:
        return []

    text = str(work_order_text).strip()
    if not text or text.lower() == "nan":
        return []

    # 統一分隔符
    text = text.replace("\r", " ").replace("\n", " ")
    text = re.sub(r"[，、；;|/]+", " ", text)
    text = re.sub(r"\s*([*xX×])\s*", r"\1", text)
    text = re.sub(r"\s+", " ", text).strip()

    parts = [p for p in text.split(" ") if p]
    parsed = []
    seen = set()

    for part in parts:
        m = re.fullmatch(r"([A-Za-z0-9]+)(?:[*xX×](\d+))?", part)
        if not m:
            continue
        wo = m.group(1).strip()
        qty = int(m.group(2)) if m.group(2) else None

        # 避免同列重複工單造成重覆展開
        if wo in seen:
            continue
        seen.add(wo)
        parsed.append((wo, qty))

    return parsed


def split_bng_rows_by_work_order(df):
    """
    將「同一列多筆工單」展開為多列。
    若工單格式為 WO*QTY，會同步更新生產數量與 MAC數量。
    """
    if df is None or df.empty or "工單" not in df.columns:
        return df

    if "拆分標記" not in df.columns:
        df = df.copy()
        df["拆分標記"] = ""

    expanded_rows = []
    split_rows = 0

    for _, row in df.iterrows():
        parsed = parse_bng_work_orders(row.get("工單"))

        # 非多工單維持原樣
        if len(parsed) <= 1:
            normal_row = row.copy()
            normal_row["拆分標記"] = ""
            expanded_rows.append(normal_row.to_dict())
            continue

        split_rows += 1

        all_have_qty = all(qty is not None for _, qty in parsed)
        total_split_qty = sum(qty for _, qty in parsed if qty is not None)
        mac_per_unit = _to_int_safe(row.get("MAC板子用量數量"))
        orig_mac_total = _to_int_safe(row.get("MAC數量"))

        for wo, qty in parsed:
            new_row = row.copy()
            new_row["工單"] = wo
            new_row["拆分標記"] = "拆分"

            # 有解析到 *數量 時，優先使用該數量更新欄位
            if qty is not None:
                new_row["生產數量"] = str(qty)
                if mac_per_unit is not None:
                    new_row["MAC數量"] = str(qty * mac_per_unit)
                elif all_have_qty and total_split_qty > 0 and orig_mac_total is not None:
                    ratio_mac = int(round(orig_mac_total * (qty / total_split_qty)))
                    new_row["MAC數量"] = str(ratio_mac)

            expanded_rows.append(new_row.to_dict())

    result = pd.DataFrame(expanded_rows, columns=df.columns)
    if split_rows > 0:
        print(f"  [split] 多工單拆分完成：{split_rows} 列展開為 {len(result)} 列")
    return result


def process_bng():
    """
    處理超恩出貨資料（支援多種格式），
    並與 FCST 產銷計畫表 join 帶入 Model / MO，
    再與 BIOS/FW 對照表 join 帶入 新版BIOS / IGN FW版本。
    Model / MO 置於第一、二欄。
    """
    print("\n🟤 處理超恩出貨...")
    config = CUSTOMER_CONFIGS["超恩"]

    try:
        import glob
        # 定義支援的檔案格式
        file_keyword = os.getenv("SHIPMENT_BNG_FILE_KEYWORD", "超恩")
        file_patterns = {
            'xlsx': f"*{file_keyword}*.xlsx",
            'msg':  f"*{file_keyword}*.msg",
            'eml':  f"*{file_keyword}*.eml"
        }

        all_files = []

        # 收集所有符合條件的檔案
        for file_type, pattern in file_patterns.items():
            pattern_path = os.path.join(config["source_folder"], pattern)
            files = glob.glob(pattern_path)
            for f in files:
                all_files.append({
                    'path':  f,
                    'type':  file_type,
                    'mtime': os.path.getmtime(f)
                })

        if not all_files:
            print("  ❌ 找不到超恩檔案（支援 .xlsx, .msg, .eml）")
            return None

        files_to_process = select_bng_files_for_processing(
            all_files,
            max_recent=config["num_files"],
        )

        print(f"  📁 找到 {len(all_files)} 個檔案，將處理最新的 {len(files_to_process)} 個:")

        all_dfs = []

        for idx, file_info in enumerate(files_to_process, 1):
            file_path = file_info['path']
            file_type = file_info['type']

            print(f"  📂 [{idx}/{len(files_to_process)}] {os.path.basename(file_path)} ({file_type.upper()})")

            df = None
            if file_type == 'xlsx':
                df = read_excel_bng(file_path)
            elif file_type == 'msg':
                df = read_msg_bng(file_path)
            elif file_type == 'eml':
                df = read_eml_bng(file_path)

            if df is None or df.empty:
                print(f"      ⚠️ 無法讀取資料，跳過此檔案")
                continue

            processed_df = process_bng_data(df, file_path, config)

            if processed_df is not None and not processed_df.empty:
                processed_df = processed_df.copy()
                is_reply = (
                    file_type in {"eml", "msg"} and
                    is_reply_mail_filename(file_path)
                )
                processed_df["__source_path"] = file_path
                processed_df["__source_mtime"] = file_info["mtime"]
                processed_df["__is_reply"] = is_reply
                processed_df["__thread_key"] = (
                    normalize_mail_thread_key(file_path)
                    if file_type in {"eml", "msg"}
                    else os.path.splitext(os.path.basename(file_path))[0].lower()
                )
                all_dfs.append(processed_df)
                reply_tag = " [RE更新]" if is_reply else ""
                print(f"      ✓ 成功讀取 {len(processed_df)} 筆{reply_tag}")
            else:
                print(f"      ⚠️ 資料處理失敗，跳過此檔案")

        if not all_dfs:
            print("  ❌ 所有檔案皆無有效資料")
            return None

        # 合併資料：RE 郵件用機種料號做局部替換
        result = merge_bng_partial_updates_by_partno(all_dfs)

        # 移除內部欄位
        for internal_col in ["__source_path", "__source_mtime", "__is_reply", "__thread_key"]:
            if internal_col in result.columns:
                result = result.drop(columns=[internal_col])

        # ── Join 1：與 FCST 表 join，帶入 Model / MO ──
        fcst_df = load_fcst_bng()

        if fcst_df is not None and not fcst_df.empty:
            result["工單"] = result["工單"].astype(str).str.strip()
            fcst_df["PO"] = fcst_df["PO"].astype(str).str.strip()

            result = result.merge(
                fcst_df[["PO", "Model", "MO"]],
                left_on="工單",
                right_on="PO",
                how="left"
            )

            if "PO" in result.columns:
                result = result.drop(columns=["PO"])

            matched = result["Model"].notna().sum()
            print(f"  🔗 FCST join 完成：{matched}/{len(result)} 筆有配對到 Model/MO")

        else:
            result["Model"] = ""
            result["MO"] = ""
            print("  ⚠️  FCST 表未載入，Model/MO 留空")

        # ── Join 2：與 BIOS/FW 對照表 join，帶入 新版BIOS / IGN FW版本 ──
        bios_df = load_bios_table()

        if bios_df is not None and not bios_df.empty:
            result["機種料號"] = result["機種料號"].astype(str).str.strip()
            bios_df["料號"] = bios_df["料號"].astype(str).str.strip()

            result = result.merge(
                bios_df[["料號", "新版BIOS(以此為主)", "IGN FW版本"]],
                left_on="機種料號",
                right_on="料號",
                how="left"
            )

            if "料號" in result.columns:
                result = result.drop(columns=["料號"])

            matched = result["新版BIOS(以此為主)"].notna().sum()
            print(f"  🔗 BIOS join 完成：{matched}/{len(result)} 筆有配對到 BIOS/FW")

        else:
            result["新版BIOS(以此為主)"] = ""
            result["IGN FW版本"] = ""
            print("  ⚠️  BIOS 表未載入，新版BIOS/IGN FW版本 留空")

        # ── Model / MO 移到第一、二欄 ──
        cols = result.columns.tolist()
        front = [c for c in ["Model", "MO"] if c in cols]
        rest  = [c for c in cols if c not in front]
        result = result[front + rest]

        print(f"  ✅ 成功合併 {len(files_to_process)} 個檔案，共 {len(result)} 筆資料")
        write_log(f"超恩出貨: 合併{len(files_to_process)}個檔案, 共{len(result)}筆")
        return result

    except Exception as e:
        print(f"  ❌ 錯誤: {e}")
        import traceback
        traceback.print_exc()
        return None


def read_excel_bng(file_path):
    """讀取 Excel 檔案"""
    try:
        df = pd.read_excel(file_path, header=0, dtype=str, engine="openpyxl")
        return df
    except Exception as e:
        print(f"  ❌ Excel 讀取失敗: {e}")
        return None


def extract_table_from_html(html_content):
    """從 HTML 內容中提取表格"""
    try:
        from io import StringIO
        # 使用 pandas 讀取 HTML 表格
        tables = pd.read_html(StringIO(html_content), flavor='lxml', header=0)
        if tables:
            tables.sort(key=lambda df: df.shape[1], reverse=True)
            df = tables[0]
            df = df.astype(str).replace("nan", "")
            return df
    except Exception:
        pass

    # 備用方案：使用 BeautifulSoup
    try:
        from bs4 import BeautifulSoup
        soup = BeautifulSoup(html_content, 'html.parser')
        tables = soup.find_all('table')

        if not tables:
            return None

        for table in tables:
            rows = table.find_all('tr')
            if len(rows) < 2:
                continue

            data = []
            for row in rows:
                cols = row.find_all(['td', 'th'])
                cols_text = [col.get_text(strip=True) for col in cols]
                data.append(cols_text)

            if data:
                df = pd.DataFrame(data[1:], columns=data[0])
                return df
    except Exception:
        pass

    return None


def read_msg_bng(file_path):
    """讀取 .msg 檔案並提取 HTML 表格"""
    try:
        import extract_msg

        msg = extract_msg.Message(file_path)

        print(f"  📧 主旨: {msg.subject or 'N/A'}")

        # 從 HTML 本文提取
        html_body = msg.htmlBody
        if html_body:
            df = extract_table_from_html(html_body)
            if df is not None and not df.empty:
                return df

        # 檢查附件
        for attachment in msg.attachments:
            if hasattr(attachment, 'longFilename'):
                filename = attachment.longFilename.lower()
                if filename.endswith(('.html', '.htm')):
                    try:
                        for enc in ['utf-8-sig', 'big5', 'cp950', 'utf-8']:
                            try:
                                html_content = attachment.data.decode(enc)
                                break
                            except:
                                continue
                        df = extract_table_from_html(html_content)
                        if df is not None and not df.empty:
                            return df
                    except Exception:
                        pass

        print("  ⚠️ 在 MSG 檔案中找不到表格")
        return None

    except ImportError:
        print("  ❌ 需要安裝 extract-msg 套件: pip install extract-msg")
        return None
    except Exception as e:
        print(f"  ❌ MSG 讀取失敗: {e}")
        return None


def read_eml_bng(file_path):
    """讀取 .eml 檔案並提取 HTML 表格（只讀取第一個表格-最新，照讀照寫，保留刪除線）"""
    try:
        import email
        from email import policy

        with open(file_path, 'rb') as f:
            msg = email.message_from_binary_file(f, policy=policy.default)

        print(f"  📧 主旨: {msg['subject'] or 'N/A'}")

        # 提取 HTML 內容
        html_content = None

        if msg.is_multipart():
            for part in msg.walk():
                content_type = part.get_content_type()

                if content_type == 'text/html':
                    try:
                        html_bytes = part.get_payload(decode=True)

                        # 嘗試多種編碼（優先 BIG5 處理繁體中文）
                        for encoding in ['utf-8-sig', 'big5', 'cp950', 'utf-8', 'gb18030']:
                            try:
                                html_content = html_bytes.decode(encoding, errors='ignore')
                                if html_content and len(html_content) > 1000:
                                    print(f"  🔤 使用編碼: {encoding.upper()}")
                                    break
                            except:
                                continue

                        if html_content:
                            tables = extract_raw_tables_from_html(html_content)

                            if tables:
                                print(f"  📊 找到 {len(tables)} 個表格")

                                # 只處理第一個表格（最新）
                                print(f"  ⚡ 只讀取第一個表格（最新）")

                                df = pd.DataFrame(tables[0])  # 取第一個表格

                                # 檢查是否有足夠的欄位
                                if df.shape[1] >= 10:  # 至少要有10欄
                                    # 跳過第一行（表頭），移除空行
                                    df_data = df.iloc[1:].copy()
                                    df_data = df_data[df_data.iloc[:, 0].notna()]

                                    if len(df_data) > 0:
                                        print(f"  ✅ 第一個表格有效資料: {len(df_data)} 列")
                                        return df_data
                                    else:
                                        print(f"  ⚠️ 第一個表格沒有有效資料")
                                else:
                                    print(f"  ⚠️ 第一個表格欄位數不足（需要至少10欄，實際{df.shape[1]}欄）")
                    except Exception as e:
                        print(f"  ⚠️ HTML 解析失敗: {e}")
                        import traceback
                        traceback.print_exc()

                elif content_type in ['application/octet-stream']:
                    filename = part.get_filename()
                    if filename and filename.lower().endswith(('.html', '.htm')):
                        try:
                            html_content = part.get_payload(decode=True).decode('utf-8', errors='ignore')
                            df = extract_table_from_html(html_content)
                            if df is not None and not df.empty:
                                return df
                        except Exception:
                            pass
        else:
            content_type = msg.get_content_type()
            if content_type == 'text/html':
                html_content = msg.get_payload(decode=True).decode('utf-8', errors='ignore')
                df = extract_table_from_html(html_content)
                if df is not None and not df.empty:
                    return df

        print("  ⚠️ 在 EML 檔案中找不到有效表格")
        return None

    except Exception as e:
        print(f"  ❌ EML 讀取失敗: {e}")
        import traceback
        traceback.print_exc()
        return None


def process_bng_data(df, source_file, config):
    """處理超恩資料的統一邏輯（支援照讀照寫）"""

    # 檢查是否使用數字欄位（表頭有亂碼或使用 header=None 讀取）
    has_numeric_columns = all(isinstance(col, (int, np.integer)) for col in df.columns)

    if has_numeric_columns:
        print(f"  🔍 使用位置對照（照讀照寫）")

        # 根據位置對照欄位
        # 位置 0: 日期
        # 位置 1: MAC板子用量數量
        # 位置 2: 工單
        # 位置 3: 機種名稱
        # 位置 4: 機種料號
        # 位置 5: 生產數量
        # 位置 6: MAC數量
        # 位置 7: MAC Address
        # 位置 8: 序號區間
        # 位置 9: UUID區間

        # 只取前10欄
        if df.shape[1] >= 10:
            result = df.iloc[:, :10].copy()
            result.columns = ["日期", "MAC板子用量數量", "工單", "機種名稱", "機種料號",
                              "生產數量", "MAC數量", "MAC Address", "序號區間", "UUID區間"]

            # 移除空白行
            result = result[result["日期"].notna()]

            # 清理資料
            nonempty = result.astype(str).apply(lambda col: col.str.strip().str.len().gt(0)).any(axis=1)
            result = result[nonempty]

            # 替換「到」為「 ~ 」（保留前後空格）
            if "序號區間" in result.columns:
                result["序號區間"] = result["序號區間"].astype(str).str.replace(" 到 ", " ~ ", regex=False)
                result["序號區間"] = result["序號區間"].astype(str).str.replace("到", " ~ ", regex=False)
                print(f"  ✨ 序號區間: 已將「到」替換為「 ~ 」")

            if "UUID區間" in result.columns:
                result["UUID區間"] = result["UUID區間"].astype(str).str.replace(" 到 ", " ~ ", regex=False)
                result["UUID區間"] = result["UUID區間"].astype(str).str.replace("到", " ~ ", regex=False)
                print(f"  ✨ UUID區間: 已將「到」替換為「 ~ 」")

            # 處理 MAC Address
            if "MAC Address" in result.columns:
                # 先替換「至」為「 ~ 」
                result["MAC Address"] = result["MAC Address"].astype(str).str.replace(" 至 ", " ~ ", regex=False)
                result["MAC Address"] = result["MAC Address"].astype(str).str.replace("至", " ~ ", regex=False)
                # 刪除所有冒號
                result["MAC Address"] = result["MAC Address"].astype(str).str.replace(":", "", regex=False)
                print(f"  ✨ MAC Address: 已將「至」替換為「 ~ 」並刪除所有冒號")

            result = split_bng_rows_by_work_order(result)
            print(f"  ✅ 成功處理 10 個欄位")
            return result
        else:
            print(f"  ❌ 欄位數不足（需要至少10欄，實際{df.shape[1]}欄）")
            return None

    else:
        # 清理欄位名稱
        def clean_column_name(col):
            if col is None:
                return ""
            return str(col).replace('\xa0', '').replace(' ', '').strip()

        df.columns = [clean_column_name(col) for col in df.columns]

        print(f"  🔍 偵測到的欄位: {df.columns.tolist()[:5]}...")

        # 建立欄位對照
        column_mapping = {
            "日期": "日期",
            "MAC": "MAC板子用量數量",
            "工單": "工單",
            "機種名稱": "機種名稱",
            "機種料號": "機種料號",
            "生產數量": "生產數量",
            "MAC.1": "MAC數量",
            "MACAddress": "MAC Address",
            "序號區間": "序號區間",
            "UUID區間": "UUID區間"
        }

        # 選取需要的欄位
        available_cols = []
        rename_map = {}

        for df_col in df.columns:
            if df_col in column_mapping:
                available_cols.append(df_col)
                rename_map[df_col] = column_mapping[df_col]

        if not available_cols:
            print("  ❌ 無法匹配欄位")
            print(f"     可用欄位: {df.columns.tolist()}")
            return None

        # 篩選並重新命名欄位
        result = df[available_cols].copy()
        result = result.rename(columns=rename_map)

        # 移除空白行
        result = result[result.iloc[:, 0].notna()]

        # 清理資料
        nonempty = result.astype(str).apply(lambda col: col.str.strip().str.len().gt(0)).any(axis=1)
        result = result[nonempty]

        # 替換「到」為「 ~ 」（保留前後空格）
        if "序號區間" in result.columns:
            result["序號區間"] = result["序號區間"].astype(str).str.replace(" 到 ", " ~ ", regex=False)
            result["序號區間"] = result["序號區間"].astype(str).str.replace("到", " ~ ", regex=False)
            print(f"  ✨ 序號區間: 已將「到」替換為「 ~ 」")

        if "UUID區間" in result.columns:
            result["UUID區間"] = result["UUID區間"].astype(str).str.replace(" 到 ", " ~ ", regex=False)
            result["UUID區間"] = result["UUID區間"].astype(str).str.replace("到", " ~ ", regex=False)
            print(f"  ✨ UUID區間: 已將「到」替換為「 ~ 」")

        if "MAC Address" in result.columns:
            # 先替換「至」為「 ~ 」
            result["MAC Address"] = result["MAC Address"].astype(str).str.replace(" 至 ", " ~ ", regex=False)
            result["MAC Address"] = result["MAC Address"].astype(str).str.replace("至", " ~ ", regex=False)
            # 刪除所有冒號
            result["MAC Address"] = result["MAC Address"].astype(str).str.replace(":", "", regex=False)
            print(f"  ✨ MAC Address: 已將「至」替換為「 ~ 」並刪除所有冒號")

        result = split_bng_rows_by_work_order(result)
        print(f"  ✅ 成功匹配 {len(available_cols)} 個欄位")
        return result


# ============================================================================
# 新增：載入 KOYA Model 對照表
# ============================================================================

def load_koya_model():
    """
    讀取 KOYA_model.xlsx，
    回傳包含 Model / full PN / PN / PO 的 DataFrame，供後續 join 使用。
    key: Model 欄（對應 KOYA 出貨統計表的「機種」欄）
    """
    KOYA_MODEL_FILE = os.getenv(
        "SHIPMENT_KOYA_MODEL_FILE",
        "/mnt/netdisk/TE/個人資料/To Claire/KOYA_model.xlsx"
    )

    print(f"  📋 載入 KOYA Model 對照表...")

    try:
        with pd.ExcelFile(KOYA_MODEL_FILE, engine="openpyxl") as workbook:
            # 掃前5列找表頭（找到含 'Model' 的那列）
            df_preview = pd.read_excel(
                workbook, header=None, nrows=5, dtype=str,
            )

            header_row = 0
            for i, row in df_preview.iterrows():
                row_vals = [str(v).strip() for v in row.values if pd.notna(v) and str(v).strip()]
                if any(re.search(r"^model$", v, re.IGNORECASE) for v in row_vals):
                    header_row = i
                    break

            df = pd.read_excel(
                workbook, header=header_row, dtype=str, keep_default_na=False,
            )

        df.columns = [str(c).strip() for c in df.columns]

        # 模糊匹配 Model / full PN / PN / PO 欄
        col_map = {}
        for col in df.columns:
            col_clean = re.sub(r"\s+", " ", col.strip().lower())

            if re.search(r"^model$", col_clean) and "Model" not in col_map:
                col_map["Model"] = col
            elif re.search(r"^full\s*pn$", col_clean) and "full PN" not in col_map:
                col_map["full PN"] = col
            elif re.search(r"^pn$", col_clean) and "PN" not in col_map:
                col_map["PN"] = col
            elif re.search(r"^po$", col_clean) and "PO" not in col_map:
                col_map["PO"] = col

        missing = [k for k in ["Model", "full PN", "PN", "PO"] if k not in col_map]
        if missing:
            print(f"  ⚠️  KOYA Model 表找不到欄位: {missing}，可用欄位: {df.columns.tolist()}")
            return None

        result = df[[col_map["Model"], col_map["full PN"], col_map["PN"], col_map["PO"]]].copy()
        result.columns = ["Model", "full PN", "PN", "PO"]

        # 去除空白 Model 與重複
        result = result[result["Model"].str.strip() != ""]
        result = result.drop_duplicates(subset=["Model"])

        print(f"  ✅ KOYA Model 表載入成功，共 {len(result)} 筆")
        return result

    except Exception as e:
        print(f"  ❌ KOYA Model 表載入失敗: {e}")
        import traceback
        traceback.print_exc()
        return None


def read_koya_a1b2_value(workbook, sheet_name):
    """
    讀取 KOYA 工作表 A1:B2 區塊的值。
    優先回傳 A1/B1/A2/B2 的第一個非空值（含 A1:B2 合併情境）。
    """
    try:
        if sheet_name not in workbook.sheetnames:
            return ""

        ws = workbook[sheet_name]

        for cell in ["A1", "B1", "A2", "B2"]:
            value = ws[cell].value
            if value is not None and str(value).strip():
                return str(value).strip()

        return ""
    except Exception:
        return ""


# ============================================================================
# KOYA 出貨處理主函式
# ============================================================================

def process_chg():
    """處理 KOYA 出貨資料，並與 KOYA_model.xlsx join 帶入 Model / full PN / PN / PO"""
    print("\n🟡 處理 KOYA 出貨...")
    config = CUSTOMER_CONFIGS["KOYA"]

    try:
        # 找最新的 num_files 個檔案
        files = [f for f in os.listdir(config["source_folder"])
                 if f.lower().endswith((".xls", ".xlsx", ".xlsm")) and not f.startswith("~$")]
        files_sorted = sorted(
            files,
            key=lambda f: os.path.getmtime(os.path.join(config["source_folder"], f)),
            reverse=True
        )
        latest_files = files_sorted[:config["num_files"]]

        if not latest_files:
            print("  ❌ 找不到來源檔案")
            return None

        print(f"  📂 處理 {len(latest_files)} 個檔案")

        all_dataframes = []
        for file_name in latest_files:
            file_path = os.path.join(config["source_folder"], file_name)
            with pd.ExcelFile(file_path, engine="openpyxl") as workbook:
                a1b2_value = read_koya_a1b2_value(workbook.book, config["target_sheet"])

                # 先只掃少量列找表頭，避免整張表先讀入造成卡頓
                df_preview = pd.read_excel(
                    workbook,
                    sheet_name=config["target_sheet"],
                    header=None,
                    dtype=str,
                    nrows=80,
                )

                # 找表頭
                header_row = None
                for i, row in df_preview.iterrows():
                    row_str = ' '.join([str(x) for x in row.values if pd.notna(x)])
                    if '機種' in row_str and '批量' in row_str:
                        header_row = i
                        break

                if header_row is None:
                    continue

                df = pd.read_excel(
                    workbook, sheet_name=config["target_sheet"],
                    header=header_row, dtype=str, keep_default_na=False,
                )

            # 處理欄名（Unnamed → 工單號碼）
            df_cols = list(df.columns)
            for i, col in enumerate(df_cols):
                if 'Unnamed' in str(col) and i <= 2:
                    df_cols[i] = "工單號碼"
                    break

            if "工單" in df_cols:
                idx = df_cols.index("工單")
                df_cols[idx] = "序號"

            df.columns = df_cols

            # 清理資料（移除 Total 列）
            has_total = df.astype(str).apply(
                lambda col: col.str.contains("Total", case=False, na=False)
            ).any(axis=1)
            df = df[~has_total]

            if "工單號碼" in df.columns:
                order_numbers = df["工單號碼"].astype(str).str.strip().str.split(".", n=1, regex=False).str[0]
                valid_orders = order_numbers.str.fullmatch(r"\d{8}", na=False)
                df = df[valid_orders].copy()
                df["工單號碼"] = order_numbers[valid_orders]
                df = df.rename(columns={"工單號碼": "工單"})

            # 選取欄位
            available_cols = [col for col in config["keep_columns"] if col in df.columns]
            if available_cols:
                subset = df[available_cols].copy()
                subset["工單月份"] = a1b2_value
                all_dataframes.append(subset)

        if not all_dataframes:
            print("  ❌ 無有效資料")
            return None

        result = pd.concat(all_dataframes, ignore_index=True)

        # ── Join：與 KOYA_model.xlsx join，帶入 Model / full PN / PN / PO ──
        koya_model_df = load_koya_model()

        if koya_model_df is not None and not koya_model_df.empty:
            result["機種"] = result["機種"].astype(str).str.strip()
            koya_model_df["Model"] = koya_model_df["Model"].astype(str).str.strip()

            result = result.merge(
                koya_model_df[["Model", "full PN", "PN", "PO"]],
                left_on="機種",
                right_on="Model",
                how="left"   # 保留所有 KOYA 資料，找不到對應的留空
            )

            matched = result["Model"].notna().sum()
            print(f"  🔗 Model join 完成：{matched}/{len(result)} 筆有配對到 Model/full PN/PN/PO")

        else:
            result["Model"] = ""
            result["full PN"] = ""
            result["PN"] = ""
            result["PO"] = ""
            print("  ⚠️  KOYA Model 表未載入，Model/full PN/PN/PO 留空")

        print(f"  ✅ 成功 ({len(result)} 筆)")
        write_log(f"KOYA出貨: 合併{len(latest_files)}個檔案, {len(result)}筆")
        return result

    except Exception as e:
        print(f"  ❌ 錯誤: {e}")
        import traceback
        traceback.print_exc()
        return None


def find_latest_excel(folder, name_filter=None):
    """尋找資料夾中最新的 Excel 檔案

    Args:
        folder: 資料夾路徑
        name_filter: 檔名必須包含的關鍵字（可選）
    """
    files = [f for f in os.listdir(folder)
             if f.lower().endswith((".xls", ".xlsx", ".xlsm")) and not f.startswith("~$")]

    # 如果有指定檔名過濾條件
    if name_filter:
        files = [f for f in files if name_filter in f]
        print(f"  🔍 過濾條件: 檔名包含 '{name_filter}'")
        print(f"  📁 符合條件的檔案: {len(files)} 個")

    if not files:
        return None

    latest = max(files, key=lambda f: os.path.getmtime(os.path.join(folder, f)))
    return os.path.join(folder, latest)


def process_dcg():
    """處理富弘年出貨資料（修改版：只讀取檔名含"出貨"的最新檔案）"""
    print("\n🟠 處理富弘年出貨...")
    config = CUSTOMER_CONFIGS["富弘年"]

    try:
        # ⭐ 修改：加入檔名過濾條件，只找包含"出貨"的檔案
        latest_file = find_latest_excel(
            config["source_folder"],
            name_filter=config["file_keyword"],
        )

        if not latest_file:
            print(f"  ❌ 找不到檔名包含'{config['file_keyword']}'的檔案")
            return None

        print(f"  📂 {os.path.basename(latest_file)}")

        with pd.ExcelFile(latest_file, engine="openpyxl") as workbook:
            # 表頭只會出現在前段，不必先讀完整張工作表。
            df_preview = pd.read_excel(
                workbook, sheet_name=config["target_sheet"],
                header=None, dtype=str, nrows=80,
            )

            # 找表頭
            header_row = None
            for i, row in df_preview.iterrows():
                if any(str(x).strip() in config["keep_columns"] for x in row.values):
                    header_row = i
                    break

            if header_row is None:
                print("  ❌ 找不到表頭")
                return None

            df = pd.read_excel(
                workbook, sheet_name=config["target_sheet"],
                header=header_row, dtype=str,
            )

        # 處理重複欄名
        seen = {}
        new_cols = []
        for c in df.columns:
            name = str(c).strip() if str(c).strip() else "Unnamed"
            if name in seen:
                seen[name] += 1
                name = f"{name}_{seen[name]}"
            else:
                seen[name] = 1
            new_cols.append(name)
        df.columns = new_cols

        # 修正製令單號格式
        if "製令單號" in df.columns:
            def fix_order_no(x):
                if pd.isna(x):
                    return ""
                x = str(x).strip()
                if re.match(r"^\d{4}-\d{1,2}-\d{1,2}$", x):
                    return x.replace("-", "")
                if re.match(r"^\d{4}/\d{1,2}/\d{1,2}$", x):
                    return x.replace("/", "")
                if x.isdigit() and len(x) < 8:
                    return x.zfill(8)
                return x

            df["製令單號"] = df["製令單號"].apply(fix_order_no)

        # 選取欄位
        available_cols = [col for col in config["keep_columns"] if col in df.columns]
        result = df[available_cols].copy()

        print(f"  ✅ 成功 ({len(result)} 筆)")
        write_log(f"富弘年出貨: {os.path.basename(latest_file)}, {len(result)}筆")
        return result

    except Exception as e:
        print(f"  ❌ 錯誤: {e}")
        return None


def process_fzg():
    """處理勤誠出貨（回溯穩定版）"""

    print("\n🟣 處理勤誠出貨...")
    config = CUSTOMER_CONFIGS["勤誠"]

    files = find_latest_excels(
        config["source_folder"],
        limit=config["num_files"]
    )

    if not files:
        print("  ❌ 找不到來源檔案")
        return None

    for file_path in files:

        try:
            print(f"  📂 嘗試: {os.path.basename(file_path)}")

            with pd.ExcelFile(file_path, engine="openpyxl") as workbook:
                match_sheet = None
                key_clean = normalize_text(config["target_sheet_keyword"])

                for s in workbook.sheet_names:

                    if key_clean in normalize_text(s):
                        match_sheet = s
                        break

                if not match_sheet:
                    print("    ⚠️ 找不到目標 Sheet")
                    continue

                df_preview = pd.read_excel(
                    workbook,
                    sheet_name=match_sheet,
                    header=None,
                    dtype=str,
                    nrows=10,
                )

                header_row = 0

                for i, row in df_preview.iterrows():

                    if any(str(x).strip() for x in row if pd.notna(x)):

                        if any(
                                normalize_text(req) in "".join([
                                    normalize_text(str(x)) for x in row.values
                                ])
                                for req in config["required_cols"]
                        ):
                            header_row = i
                            break

                df = pd.read_excel(
                    workbook,
                    sheet_name=match_sheet,
                    header=header_row,
                    dtype=str,
                    keep_default_na=False,
                )

            if df.empty:
                continue

            print(f"  ✅ 使用檔案: {os.path.basename(file_path)}")
            write_log(f"勤誠出貨: {os.path.basename(file_path)}, {len(df)}筆")

            return df

        except Exception as e:

            print(f"    ⚠️ 失敗: {e}")
            continue

    print("  ❌ 所有檔案皆失敗")
    return None


# ============================================================================
# 主程式
# ============================================================================

def apply_formatting(workbook_path):
    """統一套用 Excel 樣板格式（字型 + 配色 + 格線 + 對齊）"""

    try:
        wb = load_workbook(workbook_path)

        # =========================
        # 樣式設定
        # =========================

        base_font = Font(name="標楷體", size=12)

        center_align = Alignment(
            horizontal="center",
            vertical="center",
            wrap_text=True
        )

        # 表頭
        # 客戶表頭配色
        customer_colors = {
            "營邦": "305496",  # 深藍
            "倫飛": "548235",  # 深綠
            "超恩": "7030A0",  # 紫
            "KOYA": "ED7D31",  # 橘
            "富弘年": "C00000",  # 深紅
            "勤誠": "5B9BD5",  # 深青
        }

        default_color = "595959"  # 灰色（預設）

        header_font = Font(
            name="標楷體",
            size=12,
            bold=True,
            color="FFFFFF"
        )

        # 斑馬線
        even_fill = PatternFill("solid", fgColor="F2F2F2")
        odd_fill = PatternFill("solid", fgColor="FFFFFF")

        # 數量欄
        qty_fill = PatternFill("solid", fgColor="FFF2CC")

        # 框線
        thin = Side(style="thin")
        cell_border = Border(
            left=thin,
            right=thin,
            top=thin,
            bottom=thin
        )

        data_styles = {}
        for name, fill in (("even", even_fill), ("odd", odd_fill), ("qty", qty_fill)):
            style = NamedStyle(
                name=f"shipment_{name}",
                font=base_font,
                alignment=center_align,
                border=cell_border,
                fill=fill,
            )
            if style.name in wb.named_styles:
                data_styles[name] = style.name
            else:
                wb.add_named_style(style)
                data_styles[name] = style

        qty_keywords = ["qty", "q'ty", "數量", "生產數量", "q ty"]

        # =========================
        # 套用格式
        # =========================

        for ws in wb.worksheets:

            max_row = ws.max_row
            max_col = ws.max_column

            color = next(
                (code for name, code in customer_colors.items() if name in ws.title),
                default_color
            )
            header_fill = PatternFill("solid", fgColor=color)
            max_lengths = []

            # 1️⃣ 表頭
            for col in range(1, max_col + 1):

                cell = ws.cell(row=1, column=col)
                cell.fill = header_fill
                cell.font = header_font
                cell.alignment = center_align
                cell.border = cell_border
                max_lengths.append(len(str(cell.value or "")))

            # 2️⃣ 找 QTY 欄
            qty_cols = set()

            for col in range(1, max_col + 1):

                title = str(ws.cell(1, col).value or "").lower()

                if any(k in title for k in qty_keywords):
                    qty_cols.add(col)

            # 3️⃣ 資料列
            for row_number, cells in enumerate(
                ws.iter_rows(min_row=2, max_row=max_row, max_col=max_col), start=2
            ):
                row_style = data_styles["even" if row_number % 2 == 0 else "odd"]

                for col, cell in enumerate(cells, start=1):
                    cell.style = data_styles["qty"] if col in qty_cols else row_style

                    if cell.value is not None:
                        max_lengths[col - 1] = max(max_lengths[col - 1], len(str(cell.value)))

            # 4️⃣ 自動欄寬
            for col in range(1, max_col + 1):

                col_letter = ws.cell(1, col).column_letter
                ws.column_dimensions[col_letter].width = min(max_lengths[col - 1] + 4, 35)

            # 5️⃣ 列高
            ws.sheet_format.defaultRowHeight = 32

        wb.save(workbook_path)

        print("\n✨ 已套用完整樣板（含格線）")

    except Exception as e:
        print(f"\n⚠️ 格式錯誤: {e}")
        raise


def write_results_atomically(results):
    """完整產生新檔後才取代舊檔，避免排程中斷損壞總表。"""
    fd, temp_path = tempfile.mkstemp(
        prefix="shipment_merge_", suffix=".xlsx", dir=OUTPUT_FOLDER
    )
    os.close(fd)

    try:
        with pd.ExcelWriter(temp_path, engine="openpyxl") as writer:
            for sheet_name, df in results.items():
                df.to_excel(writer, sheet_name=sheet_name, index=False)
                print(f"  ✅ {sheet_name}: {len(df)} 筆")

        apply_formatting(temp_path)
        os.replace(temp_path, OUTPUT_FILE)
        write_log(f"總表已更新: {OUTPUT_FILE}")
    finally:
        if os.path.exists(temp_path):
            os.remove(temp_path)


def process_custom_source(source):
    """自訂 Excel 來源保留原始欄位，第一列作為欄名。"""
    if source.get("rules") is not None:
        return process_rule_source(source, db_path=os.getenv("SHIPMENT_DB_PATH"))
    path = Path(source["path"])
    files = ([path] if source["file_rule"] in path.name else []) if source["path_kind"] == "file" else [
        item for item in path.iterdir()
        if item.is_file() and item.suffix.lower() in (".xls", ".xlsx", ".xlsm")
        and not item.name.startswith("~$") and source["file_rule"] in item.name
    ]
    files = sorted(files, key=lambda item: item.stat().st_mtime, reverse=True)[:source["recent_files"] or 1]
    if not files:
        raise ValueError("找不到自訂來源 Excel 檔案")
    return pd.concat([
        pd.read_excel(item, sheet_name=source["sheet_rule"] or 0, dtype=str, keep_default_na=False)
        for item in files
    ], ignore_index=True).drop_duplicates()


def build_processors():
    processors = {"營邦出貨": process_alg, "倫飛出貨": process_bag, "超恩出貨": process_bng,
                  "KOYA出貨": process_chg, "富弘年出貨": process_dcg, "勤誠出貨": process_fzg}
    editable = {"yingbang": "營邦出貨", "lunfei": "倫飛出貨", "dcg": "富弘年出貨", "fzg": "勤誠出貨"}
    for source in json.loads(os.getenv("SHIPMENT_BUILTIN_RULE_SOURCES", "[]")):
        if editable.get(source.get("key")) != source.get("label") or source.get("rules") is None:
            raise ValueError("內建共用規則來源無效")
        processors[source["label"]] = partial(process_custom_source, source)
    for source in json.loads(os.getenv("SHIPMENT_CUSTOM_SOURCES", "[]")):
        if source["label"].casefold() in {name.casefold() for name in processors}:
            raise ValueError("自訂來源名稱與既有工作表重複")
        processors[source["label"]] = partial(process_custom_source, source)
    return processors


def main():
    """主程式"""
    print("=" * 70)
    print("🚀 統一出貨記錄整合工具")
    print(f"⏰ 執行時間: {datetime.now().strftime('%Y-%m-%d %H:%M:%S')}")
    print("=" * 70)

    # 建立輸出資料夾
    os.makedirs(OUTPUT_FOLDER, exist_ok=True)

    # 處理各客戶資料
    selected_migrations = migration_keys()
    migration_by_label = {CUSTOMER_CONFIGS[MIGRATION_CUSTOMERS[key][0]]["sheet_name"]: key for key in selected_migrations}
    processors = build_processors()
    configured_rules = {source["label"] for source in json.loads(os.getenv("SHIPMENT_BUILTIN_RULE_SOURCES", "[]"))}
    migration_by_label = {label: key for label, key in migration_by_label.items() if label not in configured_rules}

    results = {}
    failed = []
    source_results = {}
    for name, processor in processors.items():
        migration = None
        try:
            if name in migration_by_label:
                key = migration_by_label[name]
                df, migration = compare_customer(key, processor, CUSTOMER_CONFIGS[MIGRATION_CUSTOMERS[key][0]], db_path=os.getenv("SHIPMENT_DB_PATH"))
                print(f"  🔎 {name}遷移檢查：{migration['migration_status']}；{migration['reason']}")
            else:
                df = processor()
            if df is not None and not df.empty:
                results[name] = df
                source_results[name] = {"label": name, "status": "updated", "rows": len(df), "error": None}
            else:
                failed.append(name)
                source_results[name] = {"label": name, "status": "skipped", "rows": 0, "error": "處理器沒有返回有效資料；詳細原因請查看服務日誌"}
        except Exception as e:
            print(f"\n❌ {name} 處理失敗: {e}")
            failed.append(name)
            source_results[name] = {"label": name, "status": "failed", "rows": 0, "error": str(e)}
        if migration is not None:
            source_results[name].update(migration_status=migration["migration_status"], migration_reason=migration["reason"])

    if not results:
        print("SHIPMENT_SOURCE_RESULTS " + json.dumps(list(source_results.values()), ensure_ascii=False), flush=True)
        message = "所有客戶皆處理失敗，未更新總表"
        print(f"\n❌ {message}")
        write_log(message)
        return 1

    updated_count = len(results)
    retained = []
    if failed and os.path.isfile(OUTPUT_FILE):
        try:
            with pd.ExcelFile(OUTPUT_FILE, engine="openpyxl") as previous:
                for name in failed:
                    if name in previous.sheet_names:
                        results[name] = previous.parse(name, dtype=str, keep_default_na=False)
                        retained.append(name)
                        source_results[name].update(status="retained", rows=len(results[name]))
        except Exception as e:
            print(f"\n⚠️ 無法讀取舊總表，將只輸出本次成功資料: {e}")

    results = {name: results[name] for name in processors if name in results}
    skipped = [name for name in failed if name not in retained]

    # 輸出到 Excel（多個工作表）
    print(f"\n💾 正在儲存到: {OUTPUT_FILE}")

    try:
        write_results_atomically(results)
        print("SHIPMENT_SOURCE_RESULTS " + json.dumps(list(source_results.values()), ensure_ascii=False), flush=True)

        # 顯示摘要
        print("\n" + "=" * 70)
        print("📊 執行摘要")
        print("=" * 70)
        print(f"✅ 本次更新: {updated_count} 個客戶")
        if retained:
            print(f"♻️ 沿用舊資料: {', '.join(retained)}")
        if skipped:
            print(f"⚠️ 無舊資料可沿用: {', '.join(skipped)}")
        print(f"📄 輸出檔案: {OUTPUT_FILE}")

        total_records = sum(len(df) for df in results.values())
        print(f"📊 總資料筆數: {total_records}")

        write_log(
            f"整合完成: 更新{updated_count}個客戶, 沿用{len(retained)}個客戶, "
            f"略過{len(skipped)}個客戶, 總計{total_records}筆資料"
        )

        print("=" * 70)
        print("✅ 處理完成！")
        return 0

    except Exception as e:
        print(f"\n❌ 輸出失敗: {e}")
        for item in source_results.values():
            if item["status"] == "updated":
                item.update(status="failed", rows=0, error=f"總表寫入失敗：{e}")
        print("SHIPMENT_SOURCE_RESULTS " + json.dumps(list(source_results.values()), ensure_ascii=False), flush=True)
        write_log(f"輸出失敗: {e}")
        return 1


if __name__ == "__main__":
    exit_code = 1
    try:
        for stream in (sys.stdout, sys.stderr):
            if hasattr(stream, "reconfigure"):
                stream.reconfigure(errors="replace")
        exit_code = main()
    except KeyboardInterrupt:
        print("\n\n⚠️ 使用者中斷執行")
        exit_code = 130
    except Exception as e:
        print(f"\n\n❌ 發生錯誤: {e}")
        import traceback

        traceback.print_exc()

    # 僅在互動模式下暫停，避免被 API 呼叫時卡住
    no_pause = os.getenv("SHIPMENT_NO_PAUSE", "").strip() == "1"
    if not no_pause and sys.stdin and sys.stdin.isatty():
        try:
            input("\n按 Enter 鍵結束...")
        except EOFError:
            pass

    sys.exit(exit_code)
