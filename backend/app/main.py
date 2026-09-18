from contextlib import asynccontextmanager
import logging
from time import perf_counter
from typing import AsyncIterator
from uuid import uuid4

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.core.logging import configure_logging, log_event
from app.core.request_limits import ExcelUploadSizeLimitMiddleware
from app.routers import (
    excel_router,
    export_router,
    health_router,
    history_router,
    koya_model_router,
    nyx_model_router,
    monthly_reference_router,
    print_notice_router,
    shipment_refresh_router,
    shipment_source_router,
    sn_router,
)
from app.services.history_service import HistoryService
from app.services.koya_model_service import KoyaModelService
from app.services.nyx_model_service import NyxModelService
from app.services.monthly_reference_service import MonthlyReferenceService
from app.services.print_notice_service import PrintNoticeService
from app.services.sn_service import SnService
from app.services.shipment_refresh_service import ShipmentRefreshService
from app.services.shipment_source_service import ShipmentSourceService
from app.services.vecow_link_service import VecowLinkService
from app.routers.vecow_link import router as vecow_link_router


configure_logging()
logger = logging.getLogger("app.lifecycle")
request_logger = logging.getLogger("app.request")


@asynccontextmanager
async def lifespan(application: FastAPI) -> AsyncIterator[None]:
    history_service = HistoryService()
    print_notice_service = PrintNoticeService()
    koya_model_service = KoyaModelService()
    nyx_model_service = NyxModelService()
    monthly_reference_service = MonthlyReferenceService()
    shipment_source_service = ShipmentSourceService()
    vecow_link_service = VecowLinkService()
    shipment_refresh_service = ShipmentRefreshService(source_service=shipment_source_service)
    try:
        history_service.initialize()
        print_notice_service.initialize()
        koya_model_service.initialize()
        nyx_model_service.initialize()
        monthly_reference_service.initialize()
        shipment_source_service.initialize()
        vecow_link_service.initialize()
        shipment_refresh_service.initialize()
    except Exception:
        logger.exception('{"event":"application_startup_failed"}')
        raise
    application.state.history_service = history_service
    application.state.print_notice_service = print_notice_service
    application.state.koya_model_service = koya_model_service
    application.state.nyx_model_service = nyx_model_service
    application.state.monthly_reference_service = monthly_reference_service
    application.state.sn_service = SnService(history_service)
    application.state.shipment_refresh_service = shipment_refresh_service
    application.state.shipment_source_service = shipment_source_service
    application.state.vecow_link_service = vecow_link_service
    log_event(logger, logging.INFO, "application_started")
    try:
        yield
    finally:
        log_event(logger, logging.INFO, "application_stopped")


app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
    lifespan=lifespan,
)


@app.middleware("http")
async def log_http_request(request: Request, call_next):
    request_id = request.headers.get("x-request-id", "").strip()[:128] or uuid4().hex
    started_at = perf_counter()
    response = await call_next(request)
    duration_ms = round((perf_counter() - started_at) * 1000, 2)
    response.headers["X-Request-ID"] = request_id
    log_event(
        request_logger,
        logging.INFO,
        "http_request_completed",
        request_id=request_id,
        method=request.method,
        path=request.url.path,
        status_code=response.status_code,
        duration_ms=duration_ms,
    )
    return response

app.add_middleware(
    ExcelUploadSizeLimitMiddleware,
    max_body_bytes=settings.max_excel_request_bytes,
)
app.add_middleware(
    CORSMiddleware,
    allow_origins=list(settings.cors_allowed_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_exception_handlers(app)
app.include_router(health_router, prefix=settings.api_prefix)
app.include_router(excel_router, prefix=settings.api_prefix)
app.include_router(sn_router, prefix=settings.api_prefix)
app.include_router(export_router, prefix=settings.api_prefix)
app.include_router(history_router, prefix=settings.api_prefix)
app.include_router(koya_model_router, prefix=settings.api_prefix)
app.include_router(nyx_model_router, prefix=settings.api_prefix)
app.include_router(monthly_reference_router, prefix=settings.api_prefix)
app.include_router(print_notice_router, prefix=settings.api_prefix)
app.include_router(shipment_refresh_router, prefix=settings.api_prefix)
app.include_router(shipment_source_router, prefix=settings.api_prefix)
app.include_router(vecow_link_router, prefix=settings.api_prefix)
