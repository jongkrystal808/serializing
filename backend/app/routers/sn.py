from fastapi import APIRouter

from app.core.responses import ok
from app.schemas.sn import GenerateSnRequest
from app.services.sn_service import sn_service

router = APIRouter(prefix="/sn", tags=["sn"])


@router.post("/generate")
def generate_sn(payload: GenerateSnRequest):
    result = sn_service.generate(payload)
    return ok(result.model_dump(), "SN 生成請求已接收")
