from fastapi import APIRouter

from app.core.responses import ok
from app.schemas.print_notice import (
    PrintNoticeDeleteRequest,
    PrintNoticeUpsertRequest,
)
from app.services.print_notice_service import print_notice_service

router = APIRouter(prefix="/print-notice", tags=["print-notice"])


@router.get("")
def list_print_notices():
    entries = print_notice_service.list_entries()
    return ok(
        {
            "entries": [item.model_dump() for item in entries],
        },
        "已列印公告查詢成功",
    )


@router.post("/upsert")
def upsert_print_notice(payload: PrintNoticeUpsertRequest):
    entry = print_notice_service.upsert_entry(
        customer=payload.customer,
        customer_label=payload.customer_label,
        workorder_label=payload.workorder_label,
        workorder_value=payload.workorder_value,
    )
    return ok(
        {
            "entry": entry.model_dump(),
        },
        "已列印公告更新成功",
    )


@router.post("/delete")
def delete_print_notice(payload: PrintNoticeDeleteRequest):
    removed = print_notice_service.delete_entry(
        customer=payload.customer,
        workorder_value=payload.workorder_value,
    )
    return ok(
        {
            "customer": payload.customer,
            "workorder_value": payload.workorder_value,
            "removed": removed,
        },
        "已列印公告刪除請求已處理",
    )
