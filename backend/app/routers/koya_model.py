from fastapi import APIRouter

from app.core.dependencies import KoyaModelServiceDependency
from app.core.responses import ok
from app.schemas.common import ApiResponse
from app.schemas.koya_model import (
    KoyaModelDeleteData,
    KoyaModelDeleteRequest,
    KoyaModelListData,
    KoyaModelUpsertData,
    KoyaModelUpsertRequest,
)


router = APIRouter(prefix="/koya-model", tags=["koya-model"])


@router.get("", response_model=ApiResponse[KoyaModelListData])
def list_koya_models(
    koya_model_service: KoyaModelServiceDependency,
) -> ApiResponse[KoyaModelListData]:
    return ok(
        KoyaModelListData(entries=koya_model_service.list_entries()),
        "KOYA 型號主檔查詢成功",
    )


@router.post("/upsert", response_model=ApiResponse[KoyaModelUpsertData])
def upsert_koya_model(
    payload: KoyaModelUpsertRequest,
    koya_model_service: KoyaModelServiceDependency,
) -> ApiResponse[KoyaModelUpsertData]:
    entry = koya_model_service.upsert_entry(
        original_model=payload.original_model,
        model=payload.model,
        pn=payload.pn,
        full_pn=payload.full_pn,
    )
    return ok(KoyaModelUpsertData(entry=entry), "KOYA 型號主檔儲存成功")


@router.delete("", response_model=ApiResponse[KoyaModelDeleteData])
def delete_koya_model(
    payload: KoyaModelDeleteRequest,
    koya_model_service: KoyaModelServiceDependency,
) -> ApiResponse[KoyaModelDeleteData]:
    removed = koya_model_service.delete_entry(payload.model)
    return ok(
        KoyaModelDeleteData(model=payload.model, removed=removed),
        "KOYA 型號主檔刪除請求已處理",
    )
