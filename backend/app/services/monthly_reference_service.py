from contextlib import closing
from datetime import datetime
import logging
import os
import sqlite3
from typing import Optional

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.monthly_reference import MonthlyReferenceEntry


logger = logging.getLogger(__name__)
MONTHLY_REFERENCE_LABELS = {"koya": "PO", "nyx": "LOT"}


class MonthlyReferenceService:
    """【用途】保存 KOYA PO 與 NYX LOT 的月份對照資料。"""

    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.db_path

    def initialize(self) -> None:
        """【用途】建立月份對照資料表；未取得使用者數值前不預填。"""
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS monthly_reference (
                    customer TEXT NOT NULL,
                    month TEXT NOT NULL COLLATE NOCASE,
                    value TEXT NOT NULL,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (customer, month)
                )
                """
            )

    def get_value_label(self, customer: str) -> str:
        return MONTHLY_REFERENCE_LABELS[self._normalize_customer(customer)]

    def list_entries(self, customer: str) -> list[MonthlyReferenceEntry]:
        customer_key = self._normalize_customer(customer)
        with closing(self._connect()) as conn:
            rows = conn.execute(
                """
                SELECT month, value, updated_at
                FROM monthly_reference
                WHERE customer = ?
                ORDER BY month COLLATE NOCASE ASC
                """,
                (customer_key,),
            ).fetchall()
        return [self._to_entry(row) for row in rows]

    def upsert_entry(
        self,
        *,
        customer: str,
        original_month: Optional[str],
        month: str,
        value: str,
    ) -> MonthlyReferenceEntry:
        customer_key = self._normalize_customer(customer)
        original = self._normalize_optional(original_month)
        normalized_month = self._normalize_required(month, "月份")
        normalized_value = self._normalize_optional(value) or ""
        now = self._now_text()
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            if original and original.casefold() != normalized_month.casefold():
                exists = conn.execute(
                    """
                    SELECT 1 FROM monthly_reference
                    WHERE customer = ? AND month = ? COLLATE NOCASE
                    """,
                    (customer_key, normalized_month),
                ).fetchone()
                if exists:
                    raise AppError(
                        f"月份已存在：{normalized_month}",
                        code="MONTHLY_REFERENCE_CONFLICT",
                    )
                removed = conn.execute(
                    """
                    DELETE FROM monthly_reference
                    WHERE customer = ? AND month = ? COLLATE NOCASE
                    """,
                    (customer_key, original),
                ).rowcount
                if removed == 0:
                    raise AppError(
                        f"找不到要修改的月份：{original}",
                        code="MONTHLY_REFERENCE_NOT_FOUND",
                        status_code=404,
                    )
            conn.execute(
                """
                INSERT INTO monthly_reference (customer, month, value, updated_at)
                VALUES (?, ?, ?, ?)
                ON CONFLICT(customer, month) DO UPDATE SET
                    month = excluded.month,
                    value = excluded.value,
                    updated_at = excluded.updated_at
                """,
                (customer_key, normalized_month, normalized_value, now),
            )
        log_event(
            logger,
            logging.INFO,
            "monthly_reference_updated",
            customer=customer_key,
            month=normalized_month,
        )
        return MonthlyReferenceEntry(month=normalized_month, value=normalized_value, updated_at=now)

    def delete_entry(self, *, customer: str, month: str) -> bool:
        customer_key = self._normalize_customer(customer)
        normalized_month = self._normalize_required(month, "月份")
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            removed = conn.execute(
                """
                DELETE FROM monthly_reference
                WHERE customer = ? AND month = ? COLLATE NOCASE
                """,
                (customer_key, normalized_month),
            ).rowcount
        was_removed = removed > 0
        log_event(
            logger,
            logging.INFO,
            "monthly_reference_deleted",
            customer=customer_key,
            month=normalized_month,
            removed=was_removed,
        )
        return was_removed

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    @staticmethod
    def _normalize_customer(customer: str) -> str:
        key = str(customer or "").strip().lower()
        if key not in MONTHLY_REFERENCE_LABELS:
            raise AppError(
                f"不支援的月份主檔 customer：{key}",
                code="UNSUPPORTED_MONTHLY_REFERENCE",
            )
        return key

    @staticmethod
    def _normalize_required(value: str, field_name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise AppError(f"{field_name} 不可為空", code="INVALID_MONTHLY_REFERENCE")
        return text

    @staticmethod
    def _normalize_optional(value: Optional[str]) -> Optional[str]:
        text = str(value or "").strip()
        return text or None

    @staticmethod
    def _to_entry(row: sqlite3.Row) -> MonthlyReferenceEntry:
        return MonthlyReferenceEntry(
            month=row["month"],
            value=row["value"],
            updated_at=row["updated_at"],
        )

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
