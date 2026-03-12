from fastapi import APIRouter

from app.core.responses import ok

router = APIRouter(tags=["health"])


@router.get("/health")
async def health_check():
    return ok({"status": "healthy"}, "服務正常")
