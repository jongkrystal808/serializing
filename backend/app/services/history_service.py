import os
import sqlite3
from datetime import datetime
from threading import Lock
from typing import Dict, List

from app.core.config import settings
from app.core.errors import AppError
from app.schemas.history import GenerationRecord, HistoryEntry


class HistoryService:
    def __init__(self) -> None:
        self.db_path = settings.db_path
        self.allowed_customers = set(settings.allowed_customers)
        self._lock = Lock()
        self.initialize()

    def initialize(self) -> None:
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with self._connect() as conn:
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
            conn.commit()

    def list_entries(self, customer: str) -> List[HistoryEntry]:
        customer_key = self._normalize_customer(customer)
        with self._connect() as conn:
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
        with self._connect() as conn:
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
        with self._connect() as conn:
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

        with self._lock, self._connect() as conn:
            # 流水號的建立、遞增與回讀必須由同一個 SQL 原子完成，才能涵蓋多 Worker。
            if increment > 0:
                row = conn.execute(
                    """
                    INSERT INTO serial_history (customer, history_key, last_serial, updated_at)
                    VALUES (?, ?, ?, ?)
                    ON CONFLICT(customer, history_key) DO UPDATE SET
                        last_serial = serial_history.last_serial + excluded.last_serial,
                        updated_at = excluded.updated_at
                    RETURNING last_serial
                    """,
                    (customer_key, history_key, increment, now),
                ).fetchone()
                next_value = int(row[0])
                current = next_value - increment
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
            conn.commit()

        return {"previous": current, "current": next_value}

    def reset_entry(self, customer: str, key: str) -> bool:
        customer_key = self._normalize_customer(customer)
        history_key = self._normalize_key(key)
        with self._lock, self._connect() as conn:
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
            if serial_removed <= 0 and record_removed <= 0:
                return False
            conn.commit()
            return True

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, check_same_thread=False)
        conn.row_factory = sqlite3.Row
        return conn

    def _normalize_customer(self, customer: str) -> str:
        key = str(customer or "").strip()
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


history_service = HistoryService()
