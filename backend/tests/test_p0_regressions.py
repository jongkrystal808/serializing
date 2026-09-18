from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from tempfile import TemporaryDirectory
import sys
import unittest
from unittest.mock import patch

from fastapi.testclient import TestClient


BACKEND_ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_ROOT))

from app.main import app  # noqa: E402
from app.core.config import _read_cors_allowed_origins  # noqa: E402
from app.services.history_service import HistoryService  # noqa: E402


class P0RegressionTests(unittest.TestCase):
    def _make_history_service(self, db_path: str) -> HistoryService:
        """建立無共享記憶體、但共用同一 SQLite 檔的測試服務。"""
        service = HistoryService(db_path=db_path)
        service.allowed_customers = {"yingbang"}
        service.initialize()
        return service

    def test_atomic_ranges_do_not_overlap_across_service_instances(self) -> None:
        """模擬不同 Worker 並行保留流水號時，所有區間都必須唯一。"""
        with TemporaryDirectory() as folder:
            db_path = str(Path(folder) / "serials.db")
            services = [self._make_history_service(db_path) for _ in range(4)]

            def reserve(index: int) -> set[int]:
                result = services[index % len(services)].upsert_entry(
                    customer="yingbang",
                    key="WO-CONCURRENT",
                    increment=5,
                )
                return set(range(result["previous"] + 1, result["current"] + 1))

            with ThreadPoolExecutor(max_workers=16) as executor:
                ranges = list(executor.map(reserve, range(40)))

            allocated = set().union(*ranges)
            self.assertEqual(len(allocated), 200)
            self.assertEqual(allocated, set(range(1, 201)))

    def test_cors_rejects_unlisted_origin_and_allows_configured_origin(self) -> None:
        """確認攜帶憑證時不會向任意 Origin 開放跨來源讀取。"""
        client = TestClient(app)
        rejected = client.get("/api/health", headers={"Origin": "https://evil.example"})
        allowed = client.get("/api/health", headers={"Origin": "http://localhost:8080"})

        self.assertNotIn("access-control-allow-origin", rejected.headers)
        self.assertEqual(
            allowed.headers.get("access-control-allow-origin"),
            "http://localhost:8080",
        )

    def test_cors_configuration_rejects_wildcard(self) -> None:
        """避免部署時重新引入 credentials 搭配萬用來源的危險設定。"""
        with patch.dict("os.environ", {"CORS_ALLOWED_ORIGINS": "*"}):
            with self.assertRaises(ValueError):
                _read_cors_allowed_origins()


if __name__ == "__main__":
    unittest.main()
