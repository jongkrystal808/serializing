from fastapi import APIRouter, File, Form, Query, UploadFile

from app.core.responses import ok
from app.schemas.excel import ParseExcelRequest
from app.services.excel_service import excel_service

router = APIRouter(prefix="/excel", tags=["excel"])


@router.post("/parse")
async def parse_excel(
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
    file_bytes = await file.read()
    result = excel_service.parse(payload, file_bytes)
    return ok(result.model_dump(), "Excel 解析請求已接收")


@router.get("/load-default")
async def load_default_excel(customer: str = Query(...)):
    """依伺服器設定的固定路徑直接載入 Excel，不需使用者上傳。"""
    result = excel_service.load_from_default_path(customer)
    return ok(result.model_dump(), f"已載入 {customer} 預設 Excel")