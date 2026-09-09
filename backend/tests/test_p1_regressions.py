import inspect
from pathlib import Path
import sys
import unittest


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402


class P1RegressionTests(unittest.TestCase):
    def test_blocking_io_routes_use_fastapi_thread_pool(self) -> None:
        """同步 Excel、SQLite 與匯出工作不得直接在 event loop 執行。"""
        blocking_paths = {
            "/api/excel/parse",
            "/api/excel/load-default",
            "/api/export",
            "/api/history/{customer}",
            "/api/history/upsert",
            "/api/history/reset",
            "/api/sn/generate",
            "/api/print-notice",
            "/api/print-notice/upsert",
            "/api/print-notice/delete",
        }
        route_map = {
            route.path: route.endpoint
            for route in app.routes
            if getattr(route, "path", None) in blocking_paths
        }

        self.assertEqual(set(route_map), blocking_paths)
        for path, endpoint in route_map.items():
            self.assertFalse(
                inspect.iscoroutinefunction(endpoint),
                f"{path} 仍為 async handler，會在 event loop 執行同步 I/O",
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
