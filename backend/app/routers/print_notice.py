from fastapi import APIRouter

from app.core.dependencies import PrintNoticeServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.print_notice import (
    PrintNoticeDeleteData,
    PrintNoticeDeleteRequest,
    PrintNoticeListData,
    PrintNoticeUpsertData,
    PrintNoticeUpsertRequest,
)

router = APIRouter(prefix="/print-notice", tags=["print-notice"])


@router.get("", response_model=ApiResponse[PrintNoticeListData])
def list_print_notices(
    print_notice_service: PrintNoticeServiceDependency,
) -> ApiResponse[PrintNoticeListData]:
    entries = print_notice_service.list_entries()
    return ok(
        PrintNoticeListData(entries=entries),
        "已列印公告查詢成功",
    )


@router.post("/upsert", response_model=ApiResponse[PrintNoticeUpsertData])
def upsert_print_notice(
    payload: PrintNoticeUpsertRequest,
    print_notice_service: PrintNoticeServiceDependency,
) -> ApiResponse[PrintNoticeUpsertData]:
    entry = print_notice_service.upsert_entry(
        customer=payload.customer,
        customer_label=payload.customer_label,
        workorder_label=payload.workorder_label,
        workorder_value=payload.workorder_value,
    )
    return ok(
        PrintNoticeUpsertData(entry=entry),
        "已列印公告更新成功",
    )


@router.delete("", response_model=ApiResponse[PrintNoticeDeleteData])
def delete_print_notice(
    payload: PrintNoticeDeleteRequest,
    print_notice_service: PrintNoticeServiceDependency,
) -> ApiResponse[PrintNoticeDeleteData]:
    removed = print_notice_service.delete_entry(
        customer=payload.customer,
        workorder_value=payload.workorder_value,
    )
    return ok(
        PrintNoticeDeleteData(
            customer=payload.customer,
            workorder_value=payload.workorder_value,
            removed=removed,
        ),
        "已列印公告刪除請求已處理",
    )
