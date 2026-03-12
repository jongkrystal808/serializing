from typing import Any, Dict, Optional

from app.schemas.common import ApiResponse, ErrorDetail


def ok(data: Optional[Dict[str, Any]] = None, message: str = "ok") -> ApiResponse:
    return ApiResponse(success=True, message=message, data=data or {}, error=None)


def fail(code: str, message: str, details: Optional[Dict[str, Any]] = None) -> ApiResponse:
    return ApiResponse(
        success=False,
        message=message,
        data={},
        error=ErrorDetail(code=code, message=message, details=details or None),
    )
