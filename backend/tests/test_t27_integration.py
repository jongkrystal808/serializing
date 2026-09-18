from pathlib import Path

from t27_integration_runner import main


def test_t27_full_integration_flow(tmp_path: Path) -> None:
    """讓 pytest/CI 正式收集並執行既有 T27 七項整合情境。"""
    assert main(tmp_path / "t27.db") == 0
