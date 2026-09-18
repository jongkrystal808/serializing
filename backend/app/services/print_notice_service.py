from contextlib import closing
import logging
import os
import sqlite3
from datetime import datetime
from typing import List, Optional, Union

from app.core.config import settings
from app.core.customers import Customer
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.print_notice import PrintNoticeEntry


logger = logging.getLogger(__name__)


class PrintNoticeService:
    def __init__(self, db_path: Optional[str] = None) -> None:
        self.db_path = db_path or settings.db_path
        self.allowed_customers = set(settings.allowed_customers)

    def initialize(self) -> None:
        folder = os.path.dirname(self.db_path)
        if folder:
            os.makedirs(folder, exist_ok=True)
        with closing(self._connect()) as conn, conn:
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

    def list_entries(self) -> List[PrintNoticeEntry]:
        with closing(self._connect()) as conn, conn:
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

        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
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

        log_event(logger, logging.INFO, "print_notice_updated", customer=customer_key)
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
        with closing(self._connect()) as conn, conn:
            conn.execute("BEGIN IMMEDIATE")
            removed = conn.execute(
                """
                DELETE FROM print_notice
                WHERE customer = ? AND workorder_value = ?
                """,
                (customer_key, workorder_value_text),
            ).rowcount
        was_removed = removed > 0
        log_event(logger, logging.INFO, "print_notice_deleted", customer=customer_key, removed=was_removed)
        return was_removed

    def _connect(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self.db_path, timeout=30, check_same_thread=False)
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
    def _normalize_text(value: str, field_name: str) -> str:
        text = str(value or "").strip()
        if not text:
            raise AppError(f"{field_name} 不可為空", code="INVALID_PRINT_NOTICE")
        return text

    @staticmethod
    def _now_text() -> str:
        return datetime.now().strftime("%Y-%m-%d %H:%M:%S")
