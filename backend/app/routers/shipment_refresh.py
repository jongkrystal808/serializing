from fastapi import APIRouter

from app.core.dependencies import ShipmentRefreshServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.shipment_refresh import ShipmentRefreshJob


router = APIRouter(prefix="/shipment-refresh", tags=["shipment-refresh"])


@router.get("", response_model=ApiResponse[ShipmentRefreshJob])
def get_shipment_refresh_status(
    service: ShipmentRefreshServiceDependency,
) -> ApiResponse[ShipmentRefreshJob]:
    return ok(service.get_status(), "已取得出貨資料更新狀態")


@router.post("/run", response_model=ApiResponse[ShipmentRefreshJob])
def run_shipment_refresh(
    service: ShipmentRefreshServiceDependency,
) -> ApiResponse[ShipmentRefreshJob]:
    return ok(service.start(), "已啟動出貨資料更新")
