from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.core.config import settings
from app.core.errors import register_exception_handlers
from app.routers import (
    excel_router,
    export_router,
    health_router,
    history_router,
    print_notice_router,
    sn_router,
)

app = FastAPI(
    title=settings.app_name,
    version=settings.app_version,
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
app.include_router(print_notice_router, prefix=settings.api_prefix)
