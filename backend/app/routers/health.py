from fastapi import APIRouter

from app.core.responses import ok
from app.schemas.common import ApiResponse, HealthData

router = APIRouter(tags=["health"])


@router.get("/health", response_model=ApiResponse[HealthData])
async def health_check() -> ApiResponse[HealthData]:
    return ok(HealthData(status="healthy"), "服務正常")
