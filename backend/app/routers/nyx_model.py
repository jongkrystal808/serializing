from fastapi import APIRouter

from app.core.dependencies import NyxModelServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.nyx_model import (
    NyxModelDeleteData,
    NyxModelDeleteRequest,
    NyxModelListData,
    NyxModelUpsertData,
    NyxModelUpsertRequest,
)


router = APIRouter(prefix="/nyx-model", tags=["nyx-model"])


@router.get("", response_model=ApiResponse[NyxModelListData])
def list_nyx_models(
    nyx_model_service: NyxModelServiceDependency,
) -> ApiResponse[NyxModelListData]:
    return ok(
        NyxModelListData(entries=nyx_model_service.list_entries()),
        "NYX 型號主檔查詢成功",
    )


@router.post("/upsert", response_model=ApiResponse[NyxModelUpsertData])
def upsert_nyx_model(
    payload: NyxModelUpsertRequest,
    nyx_model_service: NyxModelServiceDependency,
) -> ApiResponse[NyxModelUpsertData]:
    entry = nyx_model_service.upsert_entry(
        original_model=payload.original_model,
        model=payload.model,
        pn=payload.pn,
    )
    return ok(NyxModelUpsertData(entry=entry), "NYX 型號主檔儲存成功")


@router.delete("", response_model=ApiResponse[NyxModelDeleteData])
def delete_nyx_model(
    payload: NyxModelDeleteRequest,
    nyx_model_service: NyxModelServiceDependency,
) -> ApiResponse[NyxModelDeleteData]:
    removed = nyx_model_service.delete_entry(payload.model)
    return ok(
        NyxModelDeleteData(model=payload.model, removed=removed),
        "NYX 型號主檔刪除請求已處理",
    )
