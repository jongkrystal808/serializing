from io import BytesIO
import logging
from pathlib import Path
import sys
import unittest
from unittest.mock import patch
from zipfile import ZIP_DEFLATED, ZipFile

from fastapi import FastAPI, UploadFile
from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.core.config import settings  # noqa: E402
from app.core.errors import AppError, register_exception_handlers  # noqa: E402
from app.main import app  # noqa: E402
from app.routers.excel import _read_upload_with_limit  # noqa: E402
from app.routers.export import _sanitize_download_filename, export_excel  # noqa: E402
from app.schemas.export import ExportRequest  # noqa: E402
from app.services.excel_service import ExcelService  # noqa: E402
from app.services.export_service import export_service  # noqa: E402


class P1SecurityRegressionTests(unittest.TestCase):
    def test_unexpected_error_is_logged_but_not_returned(self) -> None:
        """500 Response 不得包含內部例外內容，但 server log 應保留堆疊。"""
        test_app = FastAPI()
        register_exception_handlers(test_app)

        @test_app.get("/boom")
        def boom() -> None:
            raise RuntimeError("SECRET C:/server/private.db serial_history")

        client = TestClient(test_app, raise_server_exceptions=False)
        with self.assertLogs("app.core.errors", level=logging.ERROR) as captured:
            response = client.get("/boom")

        self.assertEqual(response.status_code, 500)
        self.assertEqual(response.json()["error"]["code"], "INTERNAL_ERROR")
        self.assertNotIn("SECRET", response.text)
        self.assertNotIn("private.db", response.text)
        self.assertIn("SECRET", "\n".join(captured.output))

    def test_content_length_over_limit_is_rejected_before_parsing(self) -> None:
        """宣告超限的 request 應由 middleware 直接回覆 413。"""
        client = TestClient(app)
        response = client.post(
            "/api/excel/parse",
            headers={"Content-Length": str(settings.max_excel_request_bytes + 1)},
        )

        self.assertEqual(response.status_code, 413)
        self.assertEqual(response.json()["error"]["code"], "FILE_TOO_LARGE")

    def test_upload_reader_enforces_actual_bytes_without_size_metadata(self) -> None:
        """即使沒有可信 size metadata，實際讀取仍不得超過檔案上限。"""
        upload = UploadFile(filename="large.xlsx", file=BytesIO(b"123456"), size=None)
        with self.assertRaises(AppError) as raised:
            _read_upload_with_limit(upload, max_bytes=5)

        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(raised.exception.code, "FILE_TOO_LARGE")

    def test_xlsx_uncompressed_size_limit_blocks_zip_bomb_shape(self) -> None:
        """壓縮檔很小但解壓內容超限時，必須在 openpyxl 載入前拒絕。"""
        buffer = BytesIO()
        with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
            archive.writestr("xl/worksheets/sheet1.xml", b"A" * 128)

        with self.assertRaises(AppError) as raised:
            ExcelService._validate_xlsx_archive(
                buffer.getvalue(),
                max_uncompressed_bytes=64,
            )

        self.assertEqual(raised.exception.status_code, 413)
        self.assertEqual(raised.exception.code, "EXCEL_ARCHIVE_TOO_LARGE")

    def test_content_disposition_removes_all_control_characters(self) -> None:
        """下載檔名中的 CR/LF/NUL/DEL 不得進入 Content-Disposition。"""
        malicious = "report\r\nX-Evil: injected\x00\x7f.xlsx"
        sanitized = _sanitize_download_filename(malicious)
        self.assertFalse(any(ord(char) < 32 or ord(char) == 127 for char in sanitized))

        with patch.object(
            export_service,
            "export",
            return_value=(malicious, b"content", "application/octet-stream"),
        ):
            response = export_excel(ExportRequest(customer="yingbang"))

        header = response.headers["content-disposition"]
        self.assertNotIn("\r", header)
        self.assertNotIn("\n", header)
        self.assertNotIn("\x00", header)
        self.assertNotIn("\x7f", header)


if __name__ == "__main__":
    unittest.main()
