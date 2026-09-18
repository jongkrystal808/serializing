from fastapi import APIRouter, Request
from pydantic import Field

from app.core.responses import ok
from app.schemas.common import ApiResponse, StrictBaseModel


class VecowLinkData(StrictBaseModel):
    url: str = Field(default="", max_length=2000)


router = APIRouter(prefix="/vecow-link", tags=["vecow-link"])


@router.get("", response_model=ApiResponse[VecowLinkData])
def get_vecow_link(request: Request):
    """【用途】取得超恩一覽表連結。"""
    return ok(VecowLinkData(url=request.app.state.vecow_link_service.get_url()), "連結查詢成功")


@router.put("", response_model=ApiResponse[VecowLinkData])
def save_vecow_link(payload: VecowLinkData, request: Request):
    """【用途】維護超恩一覽表連結。"""
    return ok(VecowLinkData(url=request.app.state.vecow_link_service.save_url(payload.url)), "連結已儲存")
