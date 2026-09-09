from fastapi import APIRouter
from fastapi.responses import StreamingResponse
from urllib.parse import quote

from app.schemas.export import ExportRequest
from app.services.export_service import export_service

router = APIRouter(prefix="/export", tags=["export"])


def _sanitize_download_filename(filename: str) -> str:
    """【用途】移除 HTTP header 不允許的控制字元與 quoted-string 危險字元。"""
    return "".join(
        "_" if ord(char) < 32 or ord(char) == 127 or char in {'"', "\\"} else char
        for char in str(filename or "")
    )


@router.post("")
def export_excel(payload: ExportRequest):
    filename, content, mime = export_service.export(payload)
    safe_filename = _sanitize_download_filename(filename).strip() or "download.xls"
    ascii_filename = "".join(char if ord(char) < 128 else "_" for char in safe_filename)
    if not ascii_filename:
        ascii_filename = "download.xls"
    encoded_filename = quote(safe_filename, safe="")
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
