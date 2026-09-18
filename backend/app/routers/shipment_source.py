from fastapi import APIRouter

from app.core.dependencies import ShipmentSourceServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.tools.source_rules import process_rule_source
from app.core.errors import AppError
from app.schemas.shipment_source import (
    ShipmentSourceCreateRequest,
    ShipmentSourceEntry,
    ShipmentSourceListData,
    ShipmentSourceUpdateRequest,
)


router = APIRouter(prefix="/shipment-sources", tags=["shipment-sources"])


@router.post("/preview")
def preview_shipment_source(payload: ShipmentSourceCreateRequest, service: ShipmentSourceServiceDependency):
    """以未保存設定執行同一讀取器；不修改設定或總表。"""
    if payload.rules is None:
        raise AppError("請先啟用欄位與處理規則，再執行預覽", code="SOURCE_PREVIEW_RULES_REQUIRED")
    report = {"label": payload.label, "error": None}
    try:
        process_rule_source(payload.model_dump(), report, db_path=service.db_path)
    except Exception as error:
        raise AppError(
            "來源預覽失敗，請檢查來源路徑與規則",
            code="SOURCE_PREVIEW_FAILED",
        ) from error
    return ok(report, "預覽完成；未保存設定或更新總表")


@router.post("", response_model=ApiResponse[ShipmentSourceEntry])
def create_shipment_source(
    payload: ShipmentSourceCreateRequest,
    service: ShipmentSourceServiceDependency,
) -> ApiResponse[ShipmentSourceEntry]:
    return ok(service.create_entry(**payload.model_dump()), "資料來源已新增")


@router.get("", response_model=ApiResponse[ShipmentSourceListData])
def list_shipment_sources(
    service: ShipmentSourceServiceDependency,
) -> ApiResponse[ShipmentSourceListData]:
    return ok(ShipmentSourceListData(entries=service.list_entries()), "資料來源設定查詢成功")


@router.put("/{source_key}", response_model=ApiResponse[ShipmentSourceEntry])
def update_shipment_source(
    source_key: str,
    payload: ShipmentSourceUpdateRequest,
    service: ShipmentSourceServiceDependency,
) -> ApiResponse[ShipmentSourceEntry]:
    return ok(
        service.update_entry(
            source_key,
            path=payload.path,
            sheet_rule=payload.sheet_rule,
            file_rule=payload.file_rule,
            recent_files=payload.recent_files,
            **({"rules": payload.rules} if "rules" in payload.model_fields_set else {}),
            **{name: getattr(payload, name) for name in ("search_customer", "work_order_column", "customer_keywords") if name in payload.model_fields_set},
        ),
        "資料來源設定已儲存",
    )


@router.post("/{source_key}/reset", response_model=ApiResponse[ShipmentSourceEntry])
def reset_shipment_source(
    source_key: str,
    service: ShipmentSourceServiceDependency,
) -> ApiResponse[ShipmentSourceEntry]:
    return ok(service.reset_entry(source_key), "資料來源設定已還原預設值")
