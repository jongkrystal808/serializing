from fastapi import APIRouter

from app.core.dependencies import HistoryServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.history import (
    HistoryData,
    HistoryResetData,
    HistoryResetRequest,
    HistoryUpsertData,
    HistoryUpsertRequest,
)

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/{customer}", response_model=ApiResponse[HistoryData])
def get_history(
    customer: str,
    history_service: HistoryServiceDependency,
) -> ApiResponse[HistoryData]:
    entries = history_service.list_entries(customer)
    records = history_service.list_generation_records(customer)
    return ok(
        HistoryData(customer=customer, entries=entries, records=records),
        "歷史查詢成功",
    )


@router.post("/upsert", response_model=ApiResponse[HistoryUpsertData])
def upsert_history(
    payload: HistoryUpsertRequest,
    history_service: HistoryServiceDependency,
) -> ApiResponse[HistoryUpsertData]:
    result = history_service.upsert_entry(
        customer=payload.customer,
        key=payload.key,
        increment=payload.increment,
        record=payload.record,
    )
    return ok(
        HistoryUpsertData(
            customer=payload.customer,
            key=payload.key,
            previous=result["previous"],
            current=result["current"],
            record_added=bool(str(payload.record or "").strip()),
        ),
        "歷史更新成功",
    )


@router.post("/reset", response_model=ApiResponse[HistoryResetData])
def reset_history(
    payload: HistoryResetRequest,
    history_service: HistoryServiceDependency,
) -> ApiResponse[HistoryResetData]:
    removed = history_service.reset_entry(payload.customer, payload.key)
    return ok(
        HistoryResetData(
            customer=payload.customer,
            key=payload.key,
            removed=removed,
        ),
        "歷史重置請求已處理",
    )
