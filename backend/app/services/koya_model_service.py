from contextlib import closing
from datetime import datetime
import logging
import os
import sqlite3
from typing import Optional

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.koya_model import KoyaModelEntry


logger = logging.getLogger(__name__)

INITIAL_KOYA_MODELS = (
    ("CHG021-XXXX", "S-0060-01(A)", "04-NODE", ""),
    ("CHG022-XXXX", "S-0060-02(A)", "06-NODE", ""),
    ("CHG023-XXXX", "S-0060-03(A)", "08-NODE", ""),
    ("CHG024-XXXX", "S-0060-04(A)", "10-NODE", ""),
    ("CHG025-XXXX", "S-0060-05(A)", "12-NODE", ""),
)

LEGACY_KOYA_MODEL_KEYS = {
    "CHG021-004L": "CHG021-XXXX",
    "CHG022-003N": "CHG022-XXXX",
    "CHG023-003J": "CHG023-XXXX",
    "CHG024-003E": "CHG024-XXXX",
    "CHG025-0039": "CHG025-XXXX",
}


class KoyaModelService:
    """【用途】持久保存原 KOYA_model.xlsx 的型號對照資料。"""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.db_path

    def initialize(self) -> None:
        """【用途】首次建表時寫入使用者提供的五筆初始型號資料。"""
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            table_exists = conn.execute(
                "SELECT 1 FROM sqlite_master WHERE type = 'table' AND name = 'koya_model'"
            ).fetchone() is not None
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS koya_model (
                    model TEXT PRIMARY KEY COLLATE NOCASE,
                    pn TEXT NOT NULL,
                    full_pn TEXT NOT NULL,
                    po TEXT NOT NULL,
                    updated_at TEXT NOT NULL
                )
                """
            )
            if not table_exists:
                now = self._now_text()
                conn.executemany(
                    """
                    INSERT INTO koya_model (model, pn, full_pn, po, updated_at)
                    VALUES (?, ?, ?, ?, ?)
                    """,
                    [(*record, now) for record in INITIAL_KOYA_MODELS],
                )
            else:
                self._migrate_legacy_model_keys(conn)

    def list_entries(self) -> list[KoyaModelEntry]:
        """【用途】依 Model 排序回傳全部 KOYA 型號主檔。"""
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT model, pn, full_pn, po, updated_at
                FROM koya_model
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
        full_pn: str,
    ) -> KoyaModelEntry:
        """【用途】新增型號，或依 original_model 更新既有型號。"""
        original = self._normalize_optional_model(original_model)
        normalized = {
            "model": self._normalize_required(model, "Model"),
            "pn": self._normalize_required(pn, "PN"),
            "full_pn": self._normalize_required(full_pn, "full PN"),
        }
        now = self._now_text()
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            if original and original.casefold() != normalized["model"].casefold():
                exists = conn.execute(
                    "SELECT 1 FROM koya_model WHERE model = ? COLLATE NOCASE",
                    (normalized["model"],),
                ).fetchone()
                if exists:
                    raise AppError(
                        f"Model 已存在：{normalized['model']}",
                        code="KOYA_MODEL_CONFLICT",
                    )
                removed = conn.execute(
                    "DELETE FROM koya_model WHERE model = ? COLLATE NOCASE",
                    (original,),
                ).rowcount
                if removed == 0:
                    raise AppError(
                        f"找不到要修改的 Model：{original}",
                        code="KOYA_MODEL_NOT_FOUND",
                        status_code=404,
                    )
            conn.execute(
                """
                INSERT INTO koya_model (model, pn, full_pn, po, updated_at)
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(model) DO UPDATE SET
                    model = excluded.model,
                    pn = excluded.pn,
                    full_pn = excluded.full_pn,
                    po = excluded.po,
                    updated_at = excluded.updated_at
                """,
                (
                    normalized["model"],
                    normalized["pn"],
                    normalized["full_pn"],
                    "",
                    now,
                ),
            )
        log_event(logger, logging.INFO, "koya_model_updated", model=normalized["model"])
        return KoyaModelEntry(**normalized, updated_at=now)

    def delete_entry(self, model: str) -> bool:
        """【用途】刪除指定 Model；不存在時回傳 false，維持冪等。"""
        normalized_model = self._normalize_required(model, "Model")
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            removed = conn.execute(
                "DELETE FROM koya_model WHERE model = ? COLLATE NOCASE",
                (normalized_model,),
            ).rowcount
        was_removed = removed > 0
        log_event(logger, logging.INFO, "koya_model_deleted", model=normalized_model, removed=was_removed)
        return was_removed

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _migrate_legacy_model_keys(conn: sqlite3.Connection) -> None:
        """【用途】將早期完整 Model 初始鍵改為可匹配同族群的 XXXX 規則。"""
        now = KoyaModelService._now_text()
        for legacy_model, pattern_model in LEGACY_KOYA_MODEL_KEYS.items():
            pattern_exists = conn.execute(
                "SELECT 1 FROM koya_model WHERE model = ? COLLATE NOCASE",
                (pattern_model,),
            ).fetchone()
            if pattern_exists:
                conn.execute(
                    "DELETE FROM koya_model WHERE model = ? COLLATE NOCASE",
                    (legacy_model,),
                )
                continue
            conn.execute(
                """
                UPDATE koya_model
                SET model = ?, updated_at = ?
                WHERE model = ? COLLATE NOCASE
                """,
                (pattern_model, now, legacy_model),
            )

    @staticmethod
    def _to_entry(row: sqlite3.Row) -> KoyaModelEntry:
        return KoyaModelEntry(
            model=row["model"],
            pn=row["pn"],
            full_pn=row["full_pn"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _normalize_required(value: str, field_name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise AppError(f"{field_name} 不可為空", code="INVALID_KOYA_MODEL")
        return text

    @staticmethod
    def _normalize_optional_model(value: Optional[str]) -> Optional[str]:
        text = str(value or "").strip()
        return text or None

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
