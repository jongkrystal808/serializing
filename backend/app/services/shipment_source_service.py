from __future__ import annotations

from contextlib import closing
from dataclasses import dataclass
from datetime import datetime
import logging
import json
import re
import os
import sqlite3
from pathlib import Path
from uuid import uuid4
from typing import Optional

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.shipment_source import ShipmentSourceEntry
from app.tools.source_rules import validate_rules
from app.tools.source_presets import EDITABLE, EDITABLE_SUMMARY, SPECIAL, preset_for


logger = logging.getLogger(__name__)


@dataclass(frozen=True)
class SourceDefinition:
    key: str
    label: str
    path_kind: str
    path_env: str
    default_path: str
    sheet_env: str = ""
    default_sheet_rule: str = ""
    sheet_rule_label: str = ""
    file_env: str = ""
    default_file_rule: str = ""
    file_rule_label: str = ""
    recent_env: str = ""
    default_recent_files: Optional[int] = None
    recent_files_label: str = ""


SOURCE_DEFINITIONS = (
    SourceDefinition(
        "yingbang", "營邦出貨", "folder", "SHIPMENT_SOURCE_ALG",
        "/mnt/netdisk/@思創出貨計畫(營邦)ALG/NPI 生產排程/2026",
        "SHIPMENT_ALG_TARGET_SHEETS", "試產,OEM-ZV_V3,量產機種,Eldora機種,ZV_MP,重工,MB,參展", "工作表（逗號分隔）",
        recent_env="SHIPMENT_ALG_RECENT_FILES", default_recent_files=10, recent_files_label="回溯檔案數",
    ),
    SourceDefinition(
        "lunfei", "倫飛出貨", "folder", "SHIPMENT_SOURCE_BAG",
        "/mnt/netdisk/@思創出貨計畫(倫飛)/FCST",
        "SHIPMENT_BAG_TARGET_SHEET", "FCST", "工作表",
    ),
    SourceDefinition(
        "bng", "超恩郵件／Excel", "folder", "SHIPMENT_SOURCE_BNG",
        "/mnt/netdisk/TE/個人資料/To Claire",
        file_env="SHIPMENT_BNG_FILE_KEYWORD", default_file_rule="超恩", file_rule_label="檔名關鍵字",
        recent_env="SHIPMENT_BNG_RECENT_FILES", default_recent_files=4, recent_files_label="最近檔案數",
    ),
    SourceDefinition(
        "bng_fcst", "超恩 FCST", "folder", "SHIPMENT_FCST_FOLDER",
        "/mnt/netdisk/@思創出貨計畫(超恩)",
        "SHIPMENT_FCST_SHEET", "2026", "工作表",
        "SHIPMENT_FCST_KEYWORD", "超恩FCST產銷計畫表", "檔名關鍵字",
    ),
    SourceDefinition(
        "bios", "VECOW BIOS／FW", "file", "SHIPMENT_BIOS_FILE",
        "/mnt/netdisk/TE/個人資料/To Claire/VECOW各機種BIOSFW測試程式一覽表.xlsx",
        "SHIPMENT_BIOS_SHEET", "List", "工作表",
    ),
    SourceDefinition(
        "koya", "KOYA 出貨", "folder", "SHIPMENT_SOURCE_CHG",
        "/mnt/netdisk/@思創出貨資料(KOYA)",
        "SHIPMENT_CHG_TARGET_SHEET", "統計表", "工作表",
        recent_env="SHIPMENT_CHG_RECENT_FILES", default_recent_files=4, recent_files_label="最近檔案數",
    ),
    SourceDefinition(
        "koya_model", "KOYA Model 對照", "file", "SHIPMENT_KOYA_MODEL_FILE",
        "/mnt/netdisk/TE/個人資料/To Claire/KOYA_model.xlsx",
    ),
    SourceDefinition(
        "dcg", "富弘年出貨", "folder", "SHIPMENT_SOURCE_DCG",
        "/mnt/netdisk/@思創出貨資料(富弘年)",
        "SHIPMENT_DCG_TARGET_SHEET", "生產排程表 2026", "工作表",
        "SHIPMENT_DCG_FILE_KEYWORD", "出貨", "檔名關鍵字",
    ),
    SourceDefinition(
        "fzg", "勤誠出貨", "folder", "SHIPMENT_SOURCE_FZG",
        "/mnt/netdisk/@思創出貨計畫(勤誠)/2026 交期確認表",
        "SHIPMENT_FZG_SHEET_KEYWORD", "0911", "工作表關鍵字",
        recent_env="SHIPMENT_FZG_RECENT_FILES", default_recent_files=10, recent_files_label="回溯檔案數",
    ),
)
DEFINITIONS_BY_KEY = {definition.key: definition for definition in SOURCE_DEFINITIONS}


class ShipmentSourceService:
    """持久保存合併程式的來源位置及安全、有限的讀取規則。"""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.db_path

    def initialize(self) -> None:
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS shipment_source_config (
                    source_key TEXT PRIMARY KEY,
                    path TEXT NOT NULL,
                    sheet_rule TEXT NOT NULL,
                    file_rule TEXT NOT NULL,
                    recent_files INTEGER,
                    updated_at TEXT NOT NULL
                )
                """
            )
            columns = {row["name"] for row in conn.execute("PRAGMA table_info(shipment_source_config)")}
            for column in ("label", "path_kind"):
                if column not in columns:
                    conn.execute(f"ALTER TABLE shipment_source_config ADD COLUMN {column} TEXT")
            if "rules_json" not in columns:
                conn.execute("ALTER TABLE shipment_source_config ADD COLUMN rules_json TEXT")
            for column in ("search_customer", "work_order_column", "customer_keywords"):
                if column not in columns:
                    conn.execute(f"ALTER TABLE shipment_source_config ADD COLUMN {column} TEXT")
            conn.execute("CREATE UNIQUE INDEX IF NOT EXISTS shipment_source_search_customer ON shipment_source_config(search_customer) WHERE search_customer IS NOT NULL")
            for definition in SOURCE_DEFINITIONS:
                conn.execute(
                    """
                    INSERT OR IGNORE INTO shipment_source_config
                        (source_key, path, sheet_rule, file_rule, recent_files, updated_at)
                    VALUES (?, ?, ?, ?, ?, ?)
                    """,
                    self._default_record(definition),
                )

    def list_entries(self, *, readonly: bool = False) -> list[ShipmentSourceEntry]:
        with closing(self._connect(readonly=readonly)) as conn:
            rows = conn.execute(
                """
                SELECT *
                FROM shipment_source_config
                """
            ).fetchall()
        rows_by_key = {row["source_key"]: row for row in rows}
        return [self._to_entry(rows_by_key[item.key], item) for item in SOURCE_DEFINITIONS] + [
            self._to_entry(row, self._custom_definition(row)) for row in rows
            if row["source_key"] not in DEFINITIONS_BY_KEY
        ]

    def create_entry(self, *, label: str, path_kind: str, path: str,
                     sheet_rule: str, file_rule: str, recent_files: Optional[int], rules=None,
                     search_customer="", work_order_column="", customer_keywords="") -> ShipmentSourceEntry:
        self._validate_search(search_customer, work_order_column)
        rules_json = self._rules_json(rules, sheet_rule)
        label, path, sheet_rule, file_rule = label.strip(), path.strip(), sheet_rule.strip(), file_rule.strip()
        if (not label or len(label) > 31 or re.search(r"[\\/*?:\[\]\x00-\x1f]", label)
                or label.startswith("'") or label.endswith("'") or label.lower() == "history"):
            raise AppError("來源名稱須為有效的 Excel 工作表名稱（最多 31 字）", code="INVALID_SHIPMENT_SOURCE")
        reserved = {entry.label.casefold() for entry in self.list_entries()}
        reserved.add("koya出貨")
        if label.casefold() in reserved:
            raise AppError("資料來源名稱已存在", code="INVALID_SHIPMENT_SOURCE", status_code=409)
        if not path or path_kind not in ("folder", "file") or (recent_files is not None and not 1 <= recent_files <= 50):
            raise AppError("來源路徑、類型或檔案數無效", code="INVALID_SHIPMENT_SOURCE")
        if not sheet_rule or not file_rule:
            raise AppError("自訂來源須填寫檔名關鍵字與工作表關鍵字", code="INVALID_SHIPMENT_SOURCE")
        key = "custom_" + uuid4().hex
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            self._check_search_owner(conn, search_customer, key)
            conn.execute(
                "INSERT INTO shipment_source_config (source_key, path, sheet_rule, file_rule, recent_files, updated_at, label, path_kind, rules_json, search_customer, work_order_column, customer_keywords) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
                (key, path, sheet_rule, file_rule, recent_files or 1, self._now_text(), label, path_kind, rules_json, search_customer or None, work_order_column.strip(), customer_keywords.strip()),
            )
        return next(entry for entry in self.list_entries() if entry.key == key)

    def update_entry(
        self,
        key: str,
        *,
        path: str,
        sheet_rule: str,
        file_rule: str,
        recent_files: Optional[int],
        customer_keywords=...,
        rules=...,
        search_customer=...,
        work_order_column=...,
    ) -> ShipmentSourceEntry:
        definition = self._definition(key)
        if rules is not ... and rules is not None and key in DEFINITIONS_BY_KEY and key not in EDITABLE:
            raise AppError("內建來源仍使用既有客戶規則，暫不支援自訂匯入設定", code="INVALID_SHIPMENT_SOURCE")
        rules_json = self._rules_json(rules, sheet_rule) if rules is not ... else None
        normalized_path = str(path or "").strip()
        if not normalized_path:
            raise AppError("資料來源路徑不可為空", code="INVALID_SHIPMENT_SOURCE")
        normalized_sheet_rule = sheet_rule.strip()
        normalized_file_rule = file_rule.strip()
        if key not in DEFINITIONS_BY_KEY and (not normalized_sheet_rule or not normalized_file_rule):
            raise AppError("自訂來源須填寫檔名關鍵字與工作表關鍵字", code="INVALID_SHIPMENT_SOURCE")
        if definition.file_env and not normalized_file_rule:
            raise AppError(f"{definition.file_rule_label}不可為空", code="INVALID_SHIPMENT_SOURCE")
        if definition.recent_env and recent_files is None:
            raise AppError(f"{definition.recent_files_label}不可為空", code="INVALID_SHIPMENT_SOURCE")
        now = self._now_text()
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            saved_search = conn.execute("SELECT * FROM shipment_source_config WHERE source_key = ?", (key,)).fetchone()
            if search_customer is ...:
                search_customer = saved_search["search_customer"] or ""
            if work_order_column is ...:
                work_order_column = saved_search["work_order_column"] or ""
            if customer_keywords is ...:
                customer_keywords = saved_search["customer_keywords"] or ""
            self._validate_search(search_customer, work_order_column)
            if search_customer and key in DEFINITIONS_BY_KEY:
                raise AppError("請在自訂來源設定泉影搜尋", code="INVALID_SHIPMENT_SOURCE")
            self._check_search_owner(conn, search_customer, key)
            if rules is ...:
                saved = conn.execute("SELECT rules_json FROM shipment_source_config WHERE source_key = ?", (key,)).fetchone()
                rules_json = saved["rules_json"]
                self._rules_json(json.loads(rules_json) if rules_json else None, sheet_rule)
            if definition.sheet_env and not normalized_sheet_rule and not rules_json:
                raise AppError(f"{definition.sheet_rule_label}不可為空", code="INVALID_SHIPMENT_SOURCE")
            conn.execute(
                """
                UPDATE shipment_source_config
                SET path = ?, sheet_rule = ?, file_rule = ?, recent_files = ?, updated_at = ?, rules_json = ?, search_customer = ?, work_order_column = ?, customer_keywords = ?
                WHERE source_key = ?
                """,
                (normalized_path, normalized_sheet_rule, normalized_file_rule, recent_files, now, rules_json, search_customer or None, work_order_column.strip(), customer_keywords.strip(), key),
            )
            row = conn.execute(
                """
                SELECT *
                FROM shipment_source_config WHERE source_key = ?
                """,
                (key,),
            ).fetchone()
        log_event(logger, logging.INFO, "shipment_source_updated", source_key=key)
        return self._to_entry(row, definition)

    def reset_entry(self, key: str) -> ShipmentSourceEntry:
        definition = self._definition(key)
        if key not in DEFINITIONS_BY_KEY:
            raise AppError("自訂來源沒有內建預設值", code="INVALID_SHIPMENT_SOURCE")
        record = self._default_record(definition)
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                UPDATE shipment_source_config
                SET path = ?, sheet_rule = ?, file_rule = ?, recent_files = ?, updated_at = ?,
                    rules_json = NULL, search_customer = NULL, work_order_column = '', customer_keywords = ''
                WHERE source_key = ?
                """,
                (record[1], record[2], record[3], record[4], record[5], key),
            )
        log_event(logger, logging.INFO, "shipment_source_reset", source_key=key)
        return next(entry for entry in self.list_entries() if entry.key == key)

    def build_environment(self, *, readonly: bool = False) -> dict[str, str]:
        entries = {entry.key: entry for entry in self.list_entries(readonly=readonly)}
        environment: dict[str, str] = {}
        environment["SHIPMENT_CUSTOM_SOURCES"] = json.dumps([
            entry.model_dump() for entry in entries.values() if entry.is_custom
        ], ensure_ascii=False)
        environment["SHIPMENT_BUILTIN_RULE_SOURCES"] = json.dumps([
            entry.model_dump() for entry in entries.values() if entry.key in EDITABLE and entry.rules is not None
        ], ensure_ascii=False)
        for definition in SOURCE_DEFINITIONS:
            entry = entries[definition.key]
            environment[definition.path_env] = entry.path
            if definition.sheet_env:
                environment[definition.sheet_env] = entry.sheet_rule
            if definition.file_env:
                environment[definition.file_env] = entry.file_rule
            if definition.recent_env and entry.recent_files is not None:
                environment[definition.recent_env] = str(entry.recent_files)
        return environment

    def _default_record(self, definition: SourceDefinition) -> tuple:
        path = os.getenv(definition.path_env, definition.default_path).strip()
        sheet_rule = os.getenv(definition.sheet_env, definition.default_sheet_rule).strip() if definition.sheet_env else ""
        file_rule = os.getenv(definition.file_env, definition.default_file_rule).strip() if definition.file_env else ""
        recent_files = definition.default_recent_files
        if definition.recent_env:
            raw_recent = os.getenv(definition.recent_env, str(definition.default_recent_files)).strip()
            try:
                recent_files = max(1, min(50, int(raw_recent)))
            except ValueError:
                recent_files = definition.default_recent_files
        return (definition.key, path, sheet_rule, file_rule, recent_files, self._now_text())

    @staticmethod
    def _rules_json(rules, sheet_rule: str):
        try:
            normalized = validate_rules(rules)
            if normalized and normalized["sheet_mode"] in ("exact", "contains") and not sheet_rule.strip():
                raise ValueError("完全名稱或包含模式必須填寫工作表名稱／關鍵字")
            return json.dumps(normalized, ensure_ascii=False) if normalized is not None else None
        except ValueError as error:
            raise AppError(f"匯入規則無效：{error}", code="INVALID_SOURCE_RULES") from error

    @staticmethod
    def _to_entry(row: sqlite3.Row, definition: SourceDefinition) -> ShipmentSourceEntry:
        base = ShipmentSourceService._base_entry(row, definition)
        return ShipmentSourceEntry(
            rule_template=preset_for(base) if definition.key in EDITABLE else None,
            rule_summary=EDITABLE_SUMMARY.get(definition.key, SPECIAL.get(definition.key, "")),
            rule_editable=definition.key in EDITABLE,
            customer_keywords=(row["customer_keywords"] or "") if "customer_keywords" in row.keys() else "",
            search_customer=(row["search_customer"] or "") if "search_customer" in row.keys() else "",
            work_order_column=(row["work_order_column"] or "") if "work_order_column" in row.keys() else "",
            rules=json.loads(row["rules_json"]) if row["rules_json"] else None,
            is_custom=definition.key not in DEFINITIONS_BY_KEY,
            key=definition.key,
            label=definition.label,
            path_kind=definition.path_kind,
            path=row["path"],
            sheet_rule=row["sheet_rule"],
            sheet_rule_label=definition.sheet_rule_label,
            file_rule=row["file_rule"],
            file_rule_label=definition.file_rule_label,
            recent_files=row["recent_files"],
            recent_files_label=definition.recent_files_label,
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _base_entry(row, definition):
        from types import SimpleNamespace
        return SimpleNamespace(key=definition.key, label=definition.label, path=row["path"], sheet_rule=row["sheet_rule"],
                               file_rule=row["file_rule"], recent_files=row["recent_files"])

    @staticmethod
    def _validate_search(customer, column):
        if customer not in ("", "deg") or not isinstance(column, str) or len(column) > 1000:
            raise AppError("搜尋客戶或工單欄名無效", code="INVALID_SHIPMENT_SOURCE")

    @staticmethod
    def _check_search_owner(conn, customer, key):
        if customer and conn.execute("SELECT 1 FROM shipment_source_config WHERE search_customer = ? AND source_key != ?", (customer, key)).fetchone():
            raise AppError("泉影搜尋已綁定其他來源，請先取消原來源的搜尋設定", code="INVALID_SHIPMENT_SOURCE", status_code=409)

    def get_search_entry(self, customer):
        return next((entry for entry in self.list_entries(readonly=True) if entry.search_customer == customer and customer), None)

    @staticmethod
    def _custom_definition(row: sqlite3.Row) -> SourceDefinition:
        return SourceDefinition(row["source_key"], row["label"], row["path_kind"], "", "",
                                sheet_rule_label="工作表關鍵字",
                                file_rule_label="檔名關鍵字", recent_files_label="最近檔案數")

    def _definition(self, key: str) -> SourceDefinition:
        definition = DEFINITIONS_BY_KEY.get(str(key or "").strip())
        if definition is None:
            with closing(self._connect()) as conn:
                row = conn.execute("SELECT * FROM shipment_source_config WHERE source_key = ?", (key,)).fetchone()
            if row is not None:
                return self._custom_definition(row)
        if definition is None:
            raise AppError(
                f"不支援的資料來源：{key}",
                code="UNKNOWN_SHIPMENT_SOURCE",
                status_code=404,
            )
        return definition

    def _connect(self, *, readonly: bool = False) -> sqlite3.Connection:
        target = Path(self.db_path).resolve().as_uri() + "?mode=ro" if readonly else self.db_path
        conn = sqlite3.connect(target, uri=readonly, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
