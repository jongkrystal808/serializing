from datetime import date
from typing import List

from app.core.errors import AppError
from app.schemas.sn import GenerateSnRequest, GenerateSnResponse
from app.services.history_service import history_service


class SnService:
    def generate(self, payload: GenerateSnRequest) -> GenerateSnResponse:
        customer = payload.customer.strip()
        key = payload.key.strip()
        qty = int(payload.qty)
        if not key:
            raise AppError("key 不可為空", code="INVALID_KEY")
        if qty <= 0:
            raise AppError("qty 必須大於 0", code="INVALID_QTY")

        if customer == "yingbang":
            sn_list, previous, current = self._generate_yingbang(
                key=key,
                qty=qty,
                purchase_order=payload.purchase_order,
            )
        elif customer == "lunfei":
            sn_list, previous, current = self._generate_lunfei(
                key=key,
                qty=qty,
                week_key=payload.week_key,
            )
        elif customer in {"bng", "chg", "hmg", "clg"}:
            sn_list, previous, current = self._accept_external_serials(
                customer=customer,
                key=key,
                qty=qty,
                provided_serials=payload.provided_serials,
            )
        else:
            raise AppError(
                f"不支援的 customer：{customer}",
                code="UNSUPPORTED_CUSTOMER",
            )

        if payload.record.strip():
            history_service.upsert_entry(
                customer=customer,
                key=key,
                increment=0,
                record=payload.record,
            )

        return GenerateSnResponse(
            customer=customer,
            key=key,
            generated_count=len(sn_list),
            sn_list=sn_list,
            previous_serial=previous,
            current_serial=current,
        )

    def _generate_yingbang(self, key: str, qty: int, purchase_order: str) -> tuple[List[str], int, int]:
        po = str(purchase_order or "").strip()
        if not po:
            raise AppError("營邦規則需要 purchase_order", code="MISSING_PURCHASE_ORDER")

        previous = history_service.get_last_serial("yingbang", key)
        sn_list = [
            f"{po}1{str(previous + index + 1).zfill(4)}"
            for index in range(qty)
        ]
        result = history_service.upsert_entry(
            customer="yingbang",
            key=key,
            increment=qty,
        )
        return sn_list, previous, result["current"]

    def _generate_lunfei(self, key: str, qty: int, week_key: str) -> tuple[List[str], int, int]:
        normalized_week_key = self._resolve_week_key(week_key)
        previous = history_service.get_last_serial("lunfei", normalized_week_key)
        week_num = normalized_week_key.split("-W")[-1]
        sn_list = [
            f"106{week_num}62{str(previous + index + 1).zfill(5)}"
            for index in range(qty)
        ]
        result = history_service.upsert_entry(
            customer="lunfei",
            key=normalized_week_key,
            increment=qty,
        )
        return sn_list, previous, result["current"]

    def _accept_external_serials(
        self,
        customer: str,
        key: str,
        qty: int,
        provided_serials: List[str],
    ) -> tuple[List[str], int, int]:
        serials = [str(item).strip() for item in provided_serials if str(item).strip()]
        if len(serials) != qty:
            raise AppError(
                f"{customer} 需提供與 qty 相同數量的 provided_serials",
                code="INVALID_PROVIDED_SERIALS",
                details={"expected": qty, "actual": len(serials)},
            )
        previous = history_service.get_last_serial(customer, key)
        result = history_service.upsert_entry(
            customer=customer,
            key=key,
            increment=qty,
        )
        return serials, previous, result["current"]

    @staticmethod
    def _resolve_week_key(week_key: str) -> str:
        normalized = str(week_key or "").strip()
        if normalized:
            return normalized
        iso = date.today().isocalendar()
        return f"{iso.year}-W{str(iso.week).zfill(2)}"


sn_service = SnService()
