from __future__ import annotations

from typing import Any, Awaitable, Callable, Dict

from fastapi.responses import JSONResponse
from starlette import status

from app.core.responses import fail


class RequestBodyTooLarge(Exception):
    """請求內容超過伺服器允許上限。"""


class ExcelUploadSizeLimitMiddleware:
    """【用途】在 multipart parser 前限制 Excel upload request body 大小。"""

    def __init__(self, app: Callable[..., Awaitable[Any]], max_body_bytes: int) -> None:
        self.app = app
        self.max_body_bytes = max_body_bytes

    async def __call__(
        self,
        scope: Dict[str, Any],
        receive: Callable[[], Awaitable[Dict[str, Any]]],
        send: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> None:
        if scope.get("type") != "http" or scope.get("path") != "/api/excel/parse":
            await self.app(scope, receive, send)
            return

        headers = dict(scope.get("headers") or [])
        content_length = self._parse_content_length(headers.get(b"content-length", b""))
        if content_length is not None and content_length > self.max_body_bytes:
            await self._send_too_large(scope, receive, send)
            return

        received_bytes = 0

        async def limited_receive() -> Dict[str, Any]:
            nonlocal received_bytes
            message = await receive()
            if message.get("type") == "http.request":
                received_bytes += len(message.get("body", b""))
                if received_bytes > self.max_body_bytes:
                    raise RequestBodyTooLarge
            return message

        try:
            await self.app(scope, limited_receive, send)
        except RequestBodyTooLarge:
            await self._send_too_large(scope, receive, send)

    @staticmethod
    def _parse_content_length(raw_value: bytes) -> int | None:
        """【用途】解析 Content-Length；缺失或非法時交由實際串流計數保護。"""
        try:
            value = int(raw_value.decode("ascii"))
        except (UnicodeDecodeError, ValueError):
            return None
        return value if value >= 0 else None

    async def _send_too_large(
        self,
        scope: Dict[str, Any],
        receive: Callable[[], Awaitable[Dict[str, Any]]],
        send: Callable[[Dict[str, Any]], Awaitable[None]],
    ) -> None:
        """【用途】回傳與其他 API 一致的 413 JSON Response。"""
        response = JSONResponse(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            content=fail(
                "FILE_TOO_LARGE",
                "上傳檔案過大",
                {"max_request_bytes": self.max_body_bytes},
            ).model_dump(),
        )
        await response(scope, receive, send)
