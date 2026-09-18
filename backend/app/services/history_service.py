from contextlib import closing
import logging
import os
import sqlite3
from datetime import datetime
from typing import Dict, List, Optional, Union

from app.core.config import settings
from app.core.customers import Customer
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.history import GenerationRecord, HistoryEntry


logger = logging.getLogger(__name__)


class HistoryService:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.db_path
        self.allowed_customers = set(settings.allowed_customers)

    def initialize(self) -> None:
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with closing(self._connect()) as conn, conn:
            journal_mode = conn.execute("PRAGMA journal_mode=WAL").fetchone()[0]
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS serial_history (
                    customer TEXT NOT NULL,
                    history_key TEXT NOT NULL,
                    last_serial INTEGER NOT NULL DEFAULT 0,
                    updated_at TEXT NOT NULL,
                    PRIMARY KEY (customer, history_key)
                )
                """
            )
            conn.execute(
                """
                CREATE TABLE IF NOT EXISTS generation_history (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    customer TEXT NOT NULL,
                    history_key TEXT NOT NULL,
                    record TEXT NOT NULL,
                    created_at TEXT NOT NULL
                )
                """
            )
        log_event(logger, logging.INFO, "history_database_initialized", journal_mode=journal_mode)

    def list_entries(self, customer: str) -> List[HistoryEntry]:
        customer_key = self._normalize_customer(customer)
        with closing(self._connect()) as conn, conn:
            rows = conn.execute(
                """
                SELECT history_key, last_serial
                FROM serial_history
                WHERE customer = ?
                ORDER BY history_key ASC
                """,
                (customer_key,),
            ).fetchall()
        return [HistoryEntry(key=row[0], last_serial=int(row[1])) for row in rows]

    def get_last_serial(self, customer: str, key: str) -> int:
        customer_key = self._normalize_customer(customer)
        history_key = self._normalize_key(key)
        with closing(self._connect()) as conn, conn:
            row = conn.execute(
                """
                SELECT last_serial
                FROM serial_history
                WHERE customer = ? AND history_key = ?
                """,
                (customer_key, history_key),
            ).fetchone()
        if not row:
            return 0
        return int(row[0] or 0)

    def list_generation_records(self, customer: str) -> List[GenerationRecord]:
        customer_key = self._normalize_customer(customer)
        with closing(self._connect()) as conn, conn:
            rows = conn.execute(
                """
                SELECT history_key, record, created_at
                FROM generation_history
                WHERE customer = ?
                ORDER BY id DESC
                LIMIT 200
                """,
                (customer_key,),
            ).fetchall()
        return [
            GenerationRecord(key=row[0], record=row[1], created_at=row[2])
            for row in rows
        ]

    def upsert_entry(
        self,
        customer: str,
        key: str,
        increment: int = 0,
        record: str = "",
    ) -> Dict[str, int]:
        customer_key = self._normalize_customer(customer)
        history_key = self._normalize_key(key)
        if increment < 0:
            raise AppError("increment 不可小於 0", code="INVALID_INCREMENT")

        now = self._now_text()
        record_text = str(record or "").strip()

        with closing(self._connect()) as conn, conn:
            # 先取得 SQLite write lock，確保整段讀寫交易可跨 Worker 序列化。
            conn.execute("BEGIN IMMEDIATE")
            if increment > 0:
                row = conn.execute(
                    """
                    SELECT last_serial
                    FROM serial_history
                    WHERE customer = ? AND history_key = ?
                    """,
                    (customer_key, history_key),
                ).fetchone()
                current = int(row[0]) if row else 0
                next_value = current + increment
                conn.execute(
                    """
                    INSERT INTO serial_history (customer, history_key, last_serial, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(customer, history_key) DO UPDATE SET
                        last_serial = excluded.last_serial,
                        updated_at = excluded.updated_at
                    """,
                    (customer_key, history_key, next_value, now),
                )
            else:
                row = conn.execute(
                    """
                    SELECT last_serial
                    FROM serial_history
                    WHERE customer = ? AND history_key = ?
                    """,
                    (customer_key, history_key),
                ).fetchone()
                current = int(row[0]) if row else 0
                next_value = current

            if record_text:
                conn.execute(
                    """
                    INSERT INTO generation_history (customer, history_key, record, created_at)
                    VALUES (?, ?, ?, ?)
                    """,
                    (customer_key, history_key, record_text, now),
                )

        log_event(
            logger,
            logging.INFO,
            "history_updated",
            customer=customer_key,
            increment=increment,
            record_added=bool(record_text),
        )
        return {"previous": current, "current": next_value}

    def reserve_range(self, customer: str, key: str, count: int, *, start: int, maximum: int) -> Dict[str, int]:
        """Reserve a bounded serial range under one SQLite write transaction."""
        customer_key = self._normalize_customer(customer)
        history_key = self._normalize_key(key)
        if count <= 0:
            raise AppError("數量必須大於 0", code="INVALID_QTY")
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            row = conn.execute(
                "SELECT last_serial FROM serial_history WHERE customer = ? AND history_key = ?",
                (customer_key, history_key),
            ).fetchone()
            previous = int(row[0]) if row else start - 1
            current = previous + count
            if current > maximum:
                raise AppError("序號已超過範圍上限", code="SERIAL_LIMIT_REACHED")
            conn.execute(
                """INSERT INTO serial_history (customer, history_key, last_serial, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(customer, history_key) DO UPDATE SET
                     last_serial = excluded.last_serial, updated_at = excluded.updated_at""",
                (customer_key, history_key, current, self._now_text()),
            )
        return {"previous": previous, "current": current}

    def set_last_serial(self, customer: str, key: str, value: int) -> None:
        customer_key = self._normalize_customer(customer)
        history_key = self._normalize_key(key)
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            conn.execute(
                """INSERT INTO serial_history (customer, history_key, last_serial, updated_at)
                   VALUES (?, ?, ?, ?)
                   ON CONFLICT(customer, history_key) DO UPDATE SET
                     last_serial = excluded.last_serial, updated_at = excluded.updated_at""",
                (customer_key, history_key, value, self._now_text()),
            )

    def reset_entry(self, customer: str, key: str) -> bool:
        customer_key = self._normalize_customer(customer)
        history_key = self._normalize_key(key)
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            serial_removed = conn.execute(
                """
                DELETE FROM serial_history
                WHERE customer = ? AND history_key = ?
                """,
                (customer_key, history_key),
            ).rowcount
            record_removed = conn.execute(
                """
                DELETE FROM generation_history
                WHERE customer = ? AND history_key = ?
                """,
                (customer_key, history_key),
            ).rowcount
            removed = serial_removed > 0 or record_removed > 0
        log_event(logger, logging.INFO, "history_reset", customer=customer_key, removed=removed)
        return removed

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
        conn.execute("PRAGMA busy_timeout=30000")
        conn.row_factory = sqlite3.Row
        return conn

    def _normalize_customer(self, customer: Union[str, Customer]) -> str:
        key = customer.value if isinstance(customer, Customer) else str(customer or "").strip()
        if not key:
            raise AppError("customer 不可為空", code="INVALID_CUSTOMER")
        if key not in self.allowed_customers:
            raise AppError(
                f"不支援的 customer：{key}",
                code="UNSUPPORTED_CUSTOMER",
                details={"allowed_customers": sorted(self.allowed_customers)},
            )
        return key

    @staticmethod
    def _normalize_key(key: str) -> str:
        normalized = str(key or "").strip()
        if not normalized:
            raise AppError("history key 不可為空", code="INVALID_KEY")
        return normalized

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
