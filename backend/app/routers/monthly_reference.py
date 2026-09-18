from fastapi import APIRouter

from app.core.dependencies import MonthlyReferenceServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.monthly_reference import (
    MonthlyReferenceDeleteData,
    MonthlyReferenceDeleteRequest,
    MonthlyReferenceListData,
    MonthlyReferenceUpsertData,
    MonthlyReferenceUpsertRequest,
)


router = APIRouter(prefix="/monthly-reference", tags=["monthly-reference"])


@router.get("/{customer}", response_model=ApiResponse[MonthlyReferenceListData])
def list_monthly_references(
    customer: str,
    monthly_reference_service: MonthlyReferenceServiceDependency,
) -> ApiResponse[MonthlyReferenceListData]:
    return ok(
        MonthlyReferenceListData(
            customer=customer,
            value_label=monthly_reference_service.get_value_label(customer),
            entries=monthly_reference_service.list_entries(customer),
        ),
        "月份對照主檔查詢成功",
    )


@router.post("/{customer}/upsert", response_model=ApiResponse[MonthlyReferenceUpsertData])
def upsert_monthly_reference(
    customer: str,
    payload: MonthlyReferenceUpsertRequest,
    monthly_reference_service: MonthlyReferenceServiceDependency,
) -> ApiResponse[MonthlyReferenceUpsertData]:
    entry = monthly_reference_service.upsert_entry(
        customer=customer,
        original_month=payload.original_month,
        month=payload.month,
        value=payload.value,
    )
    return ok(MonthlyReferenceUpsertData(entry=entry), "月份對照主檔儲存成功")


@router.delete("/{customer}", response_model=ApiResponse[MonthlyReferenceDeleteData])
def delete_monthly_reference(
    customer: str,
    payload: MonthlyReferenceDeleteRequest,
    monthly_reference_service: MonthlyReferenceServiceDependency,
) -> ApiResponse[MonthlyReferenceDeleteData]:
    removed = monthly_reference_service.delete_entry(customer=customer, month=payload.month)
    return ok(
        MonthlyReferenceDeleteData(month=payload.month, removed=removed),
        "月份對照主檔刪除請求已處理",
    )
