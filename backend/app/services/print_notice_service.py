import os
import sqlite3
from datetime import datetime
from threading import Lock
from typing import List

from app.core.config import settings
from app.core.errors import AppError
from app.schemas.print_notice import PrintNoticeEntry


class PrintNoticeService:
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
                CREATE TABLE IF NOT EXISTS print_notice (
                    customer TEXT NOT NULL,
                    customer_label TEXT NOT NULL,
                    workorder_label TEXT NOT NULL,
                    workorder_value TEXT NOT NULL,
                    created_at TEXT NOT NULL,
                    PRIMARY KEY (customer, workorder_value)
                )
                """
            )
            conn.commit()

    def list_entries(self) -> List[PrintNoticeEntry]:
        with self._connect() as conn:
            rows = conn.execute(
                """
                SELECT customer, customer_label, workorder_label, workorder_value, created_at
                FROM print_notice
                ORDER BY datetime(created_at) DESC, customer ASC, workorder_value ASC
                LIMIT 200
                """
            ).fetchall()
        return [
            PrintNoticeEntry(
                customer=row[0],
                customer_label=row[1],
                workorder_label=row[2],
                workorder_value=row[3],
                created_at=row[4],
            )
            for row in rows
        ]

    def upsert_entry(
        self,
        customer: str,
        customer_label: str,
        workorder_label: str,
        workorder_value: str,
    ) -> PrintNoticeEntry:
        customer_key = self._normalize_customer(customer)
        customer_label_text = self._normalize_text(customer_label, "customer_label")
        workorder_label_text = self._normalize_text(workorder_label, "workorder_label")
        workorder_value_text = self._normalize_text(workorder_value, "workorder_value")
        now = self._now_text()

        with self._lock, self._connect() as conn:
            conn.execute(
                """
                INSERT INTO print_notice (
                    customer, customer_label, workorder_label, workorder_value, created_at
                )
                VALUES (?, ?, ?, ?, ?)
                ON CONFLICT(customer, workorder_value) DO UPDATE SET
                    customer_label = excluded.customer_label,
                    workorder_label = excluded.workorder_label,
                    created_at = excluded.created_at
                """,
                (
                    customer_key,
                    customer_label_text,
                    workorder_label_text,
                    workorder_value_text,
                    now,
                ),
            )
            conn.commit()

        return PrintNoticeEntry(
            customer=customer_key,
            customer_label=customer_label_text,
            workorder_label=workorder_label_text,
            workorder_value=workorder_value_text,
            created_at=now,
        )

    def delete_entry(self, customer: str, workorder_value: str) -> bool:
        customer_key = self._normalize_customer(customer)
        workorder_value_text = self._normalize_text(workorder_value, "workorder_value")
        with self._lock, self._connect() as conn:
            removed = conn.execute(
                """
                DELETE FROM print_notice
                WHERE customer = ? AND workorder_value = ?
                """,
                (customer_key, workorder_value_text),
            ).rowcount
            conn.commit()
        return removed > 0

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
    def _normalize_text(value: str, field_name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise AppError(f"{field_name} 不可為空", code="INVALID_PRINT_NOTICE")
        return text

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")


print_notice_service = PrintNoticeService()
