from fastapi import APIRouter

from app.core.dependencies import SnServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.sn import FzgResetRequest, FzgStatus, GenerateSnRequest, GenerateSnResponse
from app.services.fzg_serial_service import fzg_status, reset_fzg

router = APIRouter(prefix="/sn", tags=["sn"])


@router.post("/generate", response_model=ApiResponse[GenerateSnResponse])
def generate_sn(
    payload: GenerateSnRequest,
    sn_service: SnServiceDependency,
) -> ApiResponse[GenerateSnResponse]:
    result = sn_service.generate(payload)
    return ok(result, "SN 生成請求已接收")


@router.get("/fzg/status", response_model=ApiResponse[FzgStatus])
def get_fzg_status(sn_service: SnServiceDependency) -> ApiResponse[FzgStatus]:
    return ok(FzgStatus(**fzg_status(sn_service.history_service)), "勤誠序號狀態查詢成功")


@router.post("/fzg/reset", response_model=ApiResponse[FzgStatus])
def reset_fzg_serial(payload: FzgResetRequest, sn_service: SnServiceDependency) -> ApiResponse[FzgStatus]:
    reset_fzg(sn_service.history_service, payload.kind, payload.start_hex)
    return ok(FzgStatus(**fzg_status(sn_service.history_service)), "勤誠流水號已重置")
