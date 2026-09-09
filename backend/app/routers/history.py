from fastapi import APIRouter

from app.core.responses import ok
from app.schemas.history import HistoryResetRequest, HistoryUpsertRequest
from app.services.history_service import history_service

router = APIRouter(prefix="/history", tags=["history"])


@router.get("/{customer}")
def get_history(customer: str):
    entries = history_service.list_entries(customer)
    records = history_service.list_generation_records(customer)
    return ok(
        {
            "customer": customer,
            "entries": [item.model_dump() for item in entries],
            "records": [item.model_dump() for item in records],
        },
        "歷史查詢成功",
    )


@router.post("/upsert")
def upsert_history(payload: HistoryUpsertRequest):
    result = history_service.upsert_entry(
        customer=payload.customer,
        key=payload.key,
        increment=payload.increment,
        record=payload.record,
    )
    return ok(
        {
            "customer": payload.customer,
            "key": payload.key,
            "previous": result["previous"],
            "current": result["current"],
            "record_added": bool(str(payload.record or "").strip()),
        },
        "歷史更新成功",
    )


@router.post("/reset")
def reset_history(payload: HistoryResetRequest):
    removed = history_service.reset_entry(payload.customer, payload.key)
    return ok(
        {
            "customer": payload.customer,
            "key": payload.key,
            "removed": removed,
        },
        "歷史重置請求已處理",
    )
