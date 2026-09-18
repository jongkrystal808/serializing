import inspect
import os
from pathlib import Path
import sys
import tempfile
import unittest
from unittest.mock import patch


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402
from app.core.config import BACKEND_ROOT, Settings  # noqa: E402


class P1RegressionTests(unittest.TestCase):
    def test_default_db_path_is_independent_of_current_working_directory(self) -> None:
        """從不同目錄啟動時仍使用 backend/data 下的同一個資料庫。"""
        expected = (BACKEND_ROOT / "data" / "sn_generator.db").resolve()
        original_cwd = Path.cwd()
        with tempfile.TemporaryDirectory() as folder, patch.dict(os.environ, {}, clear=False):
            os.environ.pop("DB_PATH", None)
            try:
                os.chdir(folder)
                actual = Path(Settings().db_path)
            finally:
                os.chdir(original_cwd)

        self.assertTrue(actual.is_absolute())
        self.assertEqual(actual, expected)

    def test_db_path_can_be_overridden_by_environment(self) -> None:
        """DB_PATH 支援絕對路徑，以及相對於 backend/ 的相對路徑。"""
        with tempfile.TemporaryDirectory() as folder:
            absolute_path = Path(folder) / "override.db"
            with patch.dict(os.environ, {"DB_PATH": str(absolute_path)}):
                self.assertEqual(Path(Settings().db_path), absolute_path.resolve())

        with patch.dict(os.environ, {"DB_PATH": "var/custom.db"}):
            self.assertEqual(
                Path(Settings().db_path),
                (BACKEND_ROOT / "var" / "custom.db").resolve(),
            )

    def test_blocking_io_routes_use_fastapi_thread_pool(self) -> None:
        """同步 Excel、SQLite 與匯出工作不得直接在 event loop 執行。"""
        blocking_routes = {
            ("/api/excel/parse", "POST"),
            ("/api/excel/load-default", "GET"),
            ("/api/export", "POST"),
            ("/api/history/{customer}", "GET"),
            ("/api/history/upsert", "POST"),
            ("/api/history/reset", "POST"),
            ("/api/sn/generate", "POST"),
            ("/api/print-notice", "GET"),
            ("/api/print-notice/upsert", "POST"),
            ("/api/print-notice", "DELETE"),
        }
        route_map = {
            (route.path, method): route.endpoint
            for route in app.routes
            for method in getattr(route, "methods", set())
            if (getattr(route, "path", None), method) in blocking_routes
        }

        self.assertEqual(set(route_map), blocking_routes)
        for (path, method), endpoint in route_map.items():
            self.assertFalse(
                inspect.iscoroutinefunction(endpoint),
                f"{method} {path} 仍為 async handler，會在 event loop 執行同步 I/O",
            )

    def test_health_route_remains_async_and_lightweight(self) -> None:
        """純記憶體 health check 保持 async，避免等待繁忙的 worker thread。"""
        endpoint = next(
            route.endpoint
            for route in app.routes
            if getattr(route, "path", None) == "/api/health"
        )
        self.assertTrue(inspect.iscoroutinefunction(endpoint))


if __name__ == "__main__":
    unittest.main()
