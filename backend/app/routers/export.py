from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from urllib.parse import quote

from app.schemas.export import ExportRequest
from app.services.export_service import export_service

router = APIRouter(prefix="/export", tags=["export"])


@router.post("")
def export_excel(payload: ExportRequest):
    filename, content, mime = export_service.export(payload)
    ascii_filename = "".join(char if ord(char) < 128 and char not in {'"', "\\"} else "_" for char in filename)
    if not ascii_filename:
        ascii_filename = "download.xls"
    encoded_filename = quote(filename)
    return StreamingResponse(
        iter([content]),
        media_type=mime,
        headers={
            "Content-Disposition": (
                f'attachment; filename="{ascii_filename}"; '
                f"filename*=UTF-8''{encoded_filename}"
            ),
        },
    )
