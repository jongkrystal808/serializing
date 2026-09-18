from datetime import date
import logging
from typing import List

from app.core.customers import Customer, EXTERNAL_SERIAL_CUSTOMERS
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.sn import GenerateSnRequest, GenerateSnResponse
from app.services.history_service import HistoryService
from app.services.deg_service import build_deg_serials
from app.services.fzg_serial_service import generate_fzg


logger = logging.getLogger(__name__)


class SnService:
    def __init__(self, history_service: HistoryService) -> None:
        self.history_service = history_service

    def generate(self, payload: GenerateSnRequest) -> GenerateSnResponse:
        customer = payload.customer
        key = payload.key.strip()
        qty = int(payload.qty)
        history_key = key
        if not key:
            raise AppError("key 不可為空", code="INVALID_KEY")
        if qty <= 0:
            raise AppError("qty 必須大於 0", code="INVALID_QTY")

        if customer is Customer.YINGBANG:
            sn_list, previous, current = self._generate_yingbang(
                key=key,
                qty=qty,
                purchase_order=payload.purchase_order,
            )
        elif customer is Customer.LUNFEI:
            history_key = self._resolve_week_key(payload.week_key)
            sn_list, previous, current = self._generate_lunfei(
                qty=qty,
                week_key=history_key,
            )
        elif customer is Customer.DEG:
            sn_list, history_key = build_deg_serials(payload.deg, qty)
            result = self.history_service.upsert_entry(
                customer=customer, key=history_key, increment=qty,
                record=f"{sn_list[0]} ~ {sn_list[-1]}（{qty} 筆）",
            )
            previous, current = result["previous"], result["current"]
        elif customer is Customer.FZG:
            sn_list, history_key, previous, current = generate_fzg(
                self.history_service, payload.fzg_kind, key, qty
            )
        elif customer in EXTERNAL_SERIAL_CUSTOMERS:
            sn_list, previous, current = self._accept_external_serials(
                customer=customer,
                key=history_key,
                qty=qty,
                provided_serials=payload.provided_serials,
            )
        else:
            raise AppError(
                f"不支援的 customer：{customer}",
                code="UNSUPPORTED_CUSTOMER",
            )

        if payload.record.strip():
            self.history_service.upsert_entry(
                customer=customer,
                key=history_key,
                increment=0,
                record=payload.record,
            )

        response = GenerateSnResponse(
            customer=customer,
            key=key,
            generated_count=len(sn_list),
            sn_list=sn_list,
            previous_serial=previous,
            current_serial=current,
        )
        log_event(
            logger,
            logging.INFO,
            "serials_generated",
            customer=customer.value,
            generated_count=response.generated_count,
        )
        return response

    def _generate_yingbang(self, key: str, qty: int, purchase_order: str) -> tuple[List[str], int, int]:
        po = str(purchase_order or "").strip()
        if not po:
            raise AppError("營邦規則需要 purchase_order", code="MISSING_PURCHASE_ORDER")

        result = self.history_service.upsert_entry(
            customer=Customer.YINGBANG,
            key=key,
            increment=qty,
        )
        previous = result["previous"]
        sn_list = [
            f"{po}1{str(previous + index + 1).zfill(4)}"
            for index in range(qty)
        ]
        return sn_list, previous, result["current"]

    def _generate_lunfei(self, qty: int, week_key: str) -> tuple[List[str], int, int]:
        result = self.history_service.upsert_entry(
            customer=Customer.LUNFEI,
            key=week_key,
            increment=qty,
        )
        previous = result["previous"]
        week_num = week_key.split("-W")[-1]
        sn_list = [
            f"106{week_num}62{str(previous + index + 1).zfill(5)}"
            for index in range(qty)
        ]
        return sn_list, previous, result["current"]

    def _accept_external_serials(
        self,
        customer: Customer,
        key: str,
        qty: int,
        provided_serials: List[str],
    ) -> tuple[List[str], int, int]:
        serials = [str(item).strip() for item in provided_serials if str(item).strip()]
        if len(serials) != qty:
            raise AppError(
                f"{customer.value} 需提供與 qty 相同數量的 provided_serials",
                code="INVALID_PROVIDED_SERIALS",
                details={"expected": qty, "actual": len(serials)},
            )
        result = self.history_service.upsert_entry(
            customer=customer,
            key=key,
            increment=qty,
        )
        previous = result["previous"]
        return serials, previous, result["current"]

    @staticmethod
    def _resolve_week_key(week_key: str) -> str:
        normalized = str(week_key or "").strip()
        if normalized:
            return normalized
        iso = date.today().isocalendar()
        return f"{iso.year}-W{str(iso.week).zfill(2)}"
