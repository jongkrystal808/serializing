from typing import Annotated

from fastapi import Depends, Request

from app.services.history_service import HistoryService
from app.services.koya_model_service import KoyaModelService
from app.services.nyx_model_service import NyxModelService
from app.services.monthly_reference_service import MonthlyReferenceService
from app.services.print_notice_service import PrintNoticeService
from app.services.sn_service import SnService
from app.services.shipment_refresh_service import ShipmentRefreshService
from app.services.shipment_source_service import ShipmentSourceService


def get_history_service(request: Request) -> HistoryService:
    return request.app.state.history_service


def get_print_notice_service(request: Request) -> PrintNoticeService:
    return request.app.state.print_notice_service


def get_koya_model_service(request: Request) -> KoyaModelService:
    return request.app.state.koya_model_service


def get_nyx_model_service(request: Request) -> NyxModelService:
    return request.app.state.nyx_model_service


def get_monthly_reference_service(request: Request) -> MonthlyReferenceService:
    return request.app.state.monthly_reference_service


def get_sn_service(request: Request) -> SnService:
    return request.app.state.sn_service


def get_shipment_refresh_service(request: Request) -> ShipmentRefreshService:
    return request.app.state.shipment_refresh_service


def get_shipment_source_service(request: Request) -> ShipmentSourceService:
    return request.app.state.shipment_source_service


HistoryServiceDependency = Annotated[HistoryService, Depends(get_history_service)]
PrintNoticeServiceDependency = Annotated[PrintNoticeService, Depends(get_print_notice_service)]
KoyaModelServiceDependency = Annotated[KoyaModelService, Depends(get_koya_model_service)]
NyxModelServiceDependency = Annotated[NyxModelService, Depends(get_nyx_model_service)]
MonthlyReferenceServiceDependency = Annotated[
    MonthlyReferenceService,
    Depends(get_monthly_reference_service),
]
SnServiceDependency = Annotated[SnService, Depends(get_sn_service)]
ShipmentRefreshServiceDependency = Annotated[
    ShipmentRefreshService,
    Depends(get_shipment_refresh_service),
]
ShipmentSourceServiceDependency = Annotated[
    ShipmentSourceService,
    Depends(get_shipment_source_service),
]
