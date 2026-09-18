from contextlib import closing
from datetime import datetime
import logging
import os
import sqlite3
from typing import Optional

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.nyx_model import NyxModelEntry


logger = logging.getLogger(__name__)

INITIAL_NYX_MODELS = (
    ("CZG201-XXXX", "LPCT-0510-D", ""),
    ("CZG202-XXXX", "LPCT-0520-D", ""),
    ("CZG203-XXXX", "LPCT-0530-D", ""),
    ("CZG204-XXXX", "LPCT-0540-D", ""),
    ("CZG205-XXXX", "LPCT-0550-D", ""),
    ("CZG206-XXXX", "ASS-LPCT-PL-9-1-X", ""),
)


class NyxModelService:
    """【用途】持久保存 NYX 的 Model 與 PN 對照資料。"""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.db_path

    def initialize(self) -> None:
        """【用途】首次建立 NYX 主檔並寫入六筆初始族群規則。"""
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            table_exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'nyx_model'"
            ).fetchone() is not None
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS nyx_model (
                    model TEXT PRIMARY KEY COLLATE NOCASE,
                    pn TEXT NOT NULL,
                    lot TEXT NOT NULL DEFAULT '',
                    updated_at TEXT NOT NULL
                )
                """
            )
            if not table_exists:
                now = self._now_text()
                conn.executemany(
                    """
                    INSERT INTO nyx_model (model, pn, lot, updated_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    [(*record, now) for record in INITIAL_NYX_MODELS],
                )

    def list_entries(self) -> list[NyxModelEntry]:
        """【用途】依 Model 排序回傳全部 NYX 型號主檔。"""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT model, pn, lot, updated_at
                FROM nyx_model
                ORDER BY model COLLATE NOCASE ASC
                """
            ).fetchall()
        return [self._to_entry(row) for row in rows]

    def upsert_entry(
        self,
        *,
        original_model: Optional[str],
        model: str,
        pn: str,
    ) -> NyxModelEntry:
        """【用途】新增 NYX 型號，或依 original_model 更新既有資料。"""
        original = self._normalize_optional(original_model)
        normalized_model = self._normalize_required(model, "Model")
        normalized_pn = self._normalize_required(pn, "PN")
        now = self._now_text()
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            if original and original.casefold() != normalized_model.casefold():
                exists = conn.execute(
                    "SELECT 1 FROM nyx_model WHERE model = ? COLLATE NOCASE",
                    (normalized_model,),
                ).fetchone()
                if exists:
                    raise AppError(
                        f"Model 已存在：{normalized_model}",
                        code="NYX_MODEL_CONFLICT",
                    )
                removed = conn.execute(
                    "DELETE FROM nyx_model WHERE model = ? COLLATE NOCASE",
                    (original,),
                ).rowcount
                if removed == 0:
                    raise AppError(
                        f"找不到要修改的 Model：{original}",
                        code="NYX_MODEL_NOT_FOUND",
                        status_code=404,
                    )
            conn.execute(
                """
                INSERT INTO nyx_model (model, pn, lot, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(model) DO UPDATE SET
                    model = excluded.model,
                    pn = excluded.pn,
                    lot = excluded.lot,
                    updated_at = excluded.updated_at
                """,
                (normalized_model, normalized_pn, "", now),
            )
        log_event(logger, logging.INFO, "nyx_model_updated", model=normalized_model)
        return NyxModelEntry(
            model=normalized_model,
            pn=normalized_pn,
            updated_at=now,
        )

    def delete_entry(self, model: str) -> bool:
        """【用途】刪除指定 NYX Model；不存在時回傳 false。"""
        normalized_model = self._normalize_required(model, "Model")
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            removed = conn.execute(
                "DELETE FROM nyx_model WHERE model = ? COLLATE NOCASE",
                (normalized_model,),
            ).rowcount
        was_removed = removed > 0
        log_event(logger, logging.INFO, "nyx_model_deleted", model=normalized_model, removed=was_removed)
        return was_removed

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _to_entry(row: sqlite3.Row) -> NyxModelEntry:
        return NyxModelEntry(
            model=row["model"],
            pn=row["pn"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _normalize_required(value: str, field_name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise AppError(f"{field_name} 不可為空", code="INVALID_NYX_MODEL")
        return text

    @staticmethod
    def _normalize_optional(value: Optional[str]) -> Optional[str]:
        text = str(value or "").strip()
        return text or None

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
