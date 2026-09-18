from typing import Any, Dict, Optional, TypeVar

from app.schemas.common import ApiResponse, ErrorDetail


DataT = TypeVar("DataT")


def ok(data: DataT, message: str = "ok") -> ApiResponse[DataT]:
    return ApiResponse(success=True, message=message, data=data, error=None)


def fail(
    code: str,
    message: str,
    details: Optional[Dict[str, Any]] = None,
) -> ApiResponse[Dict[str, Any]]:
    return ApiResponse(
        success=False,
        message=message,
        data={},
        error=ErrorDetail(code=code, message=message, details=details or None),
    )
