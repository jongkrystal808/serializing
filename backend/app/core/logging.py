import json
import logging
import os
import sys
from typing import Any


def configure_logging() -> None:
    """設定 app.* 共用輸出，避免部署環境未處理自訂 logger。"""
    level_name = os.getenv("LOG_LEVEL", "INFO").strip().upper()
    level = getattr(logging, level_name, logging.INFO)
    app_logger = logging.getLogger("app")
    app_logger.setLevel(level)
    if not app_logger.handlers:
        handler = logging.StreamHandler(sys.stdout)
        handler.setFormatter(logging.Formatter("%(message)s"))
        app_logger.addHandler(handler)
    app_logger.propagate = False


def log_event(logger: logging.Logger, level: int, event: str, **fields: Any) -> None:
    """以單行 JSON 記錄可供搜尋與彙整的結構化事件。"""
    payload = {"event": event, **fields}
    logger.log(level, json.dumps(payload, ensure_ascii=False, separators=(",", ":")))
