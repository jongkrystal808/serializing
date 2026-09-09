from fastapi import APIRouter, File, Form, Query, UploadFile, status

from app.core.config import settings
from app.core.errors import AppError
from app.core.responses import ok
from app.schemas.excel import ParseExcelRequest
from app.services.excel_service import excel_service

router = APIRouter(prefix="/excel", tags=["excel"])


def _read_upload_with_limit(file: UploadFile, max_bytes: int) -> bytes:
    """【用途】最多讀取上限加一 byte，不能只信任客戶端宣告的檔案大小。"""
    if file.size is not None and file.size > max_bytes:
        raise AppError(
            "上傳檔案過大",
            code="FILE_TOO_LARGE",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            details={"max_file_bytes": max_bytes},
        )
    file_bytes = file.file.read(max_bytes + 1)
    if len(file_bytes) > max_bytes:
        raise AppError(
            "上傳檔案過大",
            code="FILE_TOO_LARGE",
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            details={"max_file_bytes": max_bytes},
        )
    return file_bytes


@router.post("/parse")
def parse_excel(
    customer: str = Form(...),
    sheet_name: str = Form(...),
    parse_rules: str = Form("arrow"),
    file: UploadFile = File(...),
):
    payload = ParseExcelRequest(
        customer=customer,
        sheet_name=sheet_name,
        file_name=file.filename or "upload.xlsx",
        parse_rules=[item.strip() for item in parse_rules.split(",") if item.strip()],
    )
    # 同步讀檔與 Excel 解析交由 FastAPI thread pool 執行，避免阻塞 event loop。
    file_bytes = _read_upload_with_limit(file, settings.max_excel_upload_bytes)
    result = excel_service.parse(payload, file_bytes)
    return ok(result.model_dump(), "Excel 解析請求已接收")


@router.get("/load-default")
def load_default_excel(customer: str = Query(...)):
    """依伺服器設定的固定路徑直接載入 Excel，不需使用者上傳。"""
    result = excel_service.load_from_default_path(customer)
    return ok(result.model_dump(), f"已載入 {customer} 預設 Excel")
