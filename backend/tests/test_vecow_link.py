from pathlib import Path
import sys

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from app.core.errors import register_exception_handlers
from app.routers.vecow_link import router
from app.services.vecow_link_service import VecowLinkService


def test_vecow_link_api_persists_and_clears(tmp_path):
    db = str(tmp_path / "links.db")
    service = VecowLinkService(db)
    service.initialize()
    app = FastAPI()
    register_exception_handlers(app)
    app.state.vecow_link_service = service
    app.include_router(router, prefix="/api")
    with TestClient(app) as client:
        assert client.get("/api/vecow-link").json()["data"]["url"] == ""
        url = "https://example.com/VECOW.xlsx?download=1"
        assert client.put("/api/vecow-link", json={"url": f" {url} "}).json()["data"]["url"] == url
        restarted = VecowLinkService(db)
        restarted.initialize()
        assert restarted.get_url() == url
        for unsafe in ["javascript:alert(1)", "file:///mnt/netdisk/list.xlsx", "https://", "https://user:pass@example.com", "https://example.com/\nattack", "https://example.com\\attack"]:
            assert client.put("/api/vecow-link", json={"url": unsafe}).status_code == 400
            assert service.get_url() == url
        assert client.put("/api/vecow-link", json={"url": ""}).status_code == 200
        assert client.get("/api/vecow-link").json()["data"]["url"] == ""
