import os
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List


BACKEND_ROOT = Path(__file__).resolve().parents[2]


def _default_excel_path() -> str:
    return os.getenv(
        "DEFAULT_EXCEL_PATH",
        "/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx",
    ).strip()


def _shipment_refresh_script_path() -> str:
    configured = os.getenv("SHIPMENT_REFRESH_SCRIPT_PATH", "").strip()
    if configured:
        return configured
    return str((BACKEND_ROOT / "app" / "tools" / "shipment_merge.py").resolve())


def _resolve_db_path() -> str:
    """Resolve the SQLite path independently of the process working directory."""
    configured_path = os.getenv("DB_PATH")
    db_path = Path(configured_path).expanduser() if configured_path else Path("data/sn_generator.db")
    if not db_path.is_absolute():
        db_path = BACKEND_ROOT / db_path
    return str(db_path.resolve())


def _read_positive_int(name: str, default: int) -> int:
    """【用途】讀取必須為正整數的環境設定。"""
    raw_value = os.getenv(name, str(default)).strip()
    try:
        value = int(raw_value)
    except ValueError as error:
        raise ValueError(f"{name} 必須為正整數") from error
    if value <= 0:
        raise ValueError(f"{name} 必須大於 0")
    return value


def _read_cors_allowed_origins() -> tuple[str, ...]:
    """從環境變數讀取明確允許的前端來源。"""
    raw_value = os.getenv(
        "CORS_ALLOWED_ORIGINS",
        "http://localhost:8080,http://127.0.0.1:8080",
    )
    origins = tuple(origin.strip() for origin in raw_value.split(",") if origin.strip())
    if "*" in origins:
        raise ValueError("CORS_ALLOWED_ORIGINS 不可包含 *；請明確列出允許的來源")
    return origins


@dataclass(frozen=True)
class CustomerFileConfig:
    """單一客戶的預設來源檔設定"""
    path: str
    sheet_name: str
    parse_rules: List[str] = field(default_factory=lambda: ["trim"])


@dataclass(frozen=True)
class Settings:
    app_name: str = "SN-GENERATOR API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    db_path: str = field(default_factory=_resolve_db_path)
    allowed_customers: tuple[str, ...] = ("yingbang", "lunfei", "bng", "chg", "hmg", "clg", "deg", "fzg")
    cors_allowed_origins: tuple[str, ...] = field(default_factory=_read_cors_allowed_origins)
    max_excel_upload_bytes: int = field(
        default_factory=lambda: _read_positive_int("MAX_EXCEL_UPLOAD_BYTES", 20 * 1024 * 1024)
    )
    max_excel_uncompressed_bytes: int = field(
        default_factory=lambda: _read_positive_int("MAX_EXCEL_UNCOMPRESSED_BYTES", 100 * 1024 * 1024)
    )
    default_excel_path: str = field(default_factory=_default_excel_path)
    shipment_refresh_script_path: str = field(default_factory=_shipment_refresh_script_path)

    @property
    def max_excel_request_bytes(self) -> int:
        """【用途】允許 multipart metadata 的額外空間，同時限制整體 request body。"""
        return self.max_excel_upload_bytes + 1024 * 1024

    # -------------------------------------------------------------------------
    # 【正式環境】
    # 總表預設位於 /mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx，
    # 需要切換測試檔時使用 DEFAULT_EXCEL_PATH 覆寫。
    # -------------------------------------------------------------------------
    default_excel: Dict[str, CustomerFileConfig] = field(default_factory=lambda: {
        "fzg": CustomerFileConfig(
            path=_default_excel_path(),
            sheet_name="勤誠出貨",
            parse_rules=["trim"],
        ),
        "deg": CustomerFileConfig(
            path=_default_excel_path(),
            sheet_name="DEG",
            parse_rules=["trim"],
        ),
        "yingbang": CustomerFileConfig(
            path=_default_excel_path(),
            sheet_name="營邦出貨",
            parse_rules=["arrow"],
        ),
        "lunfei": CustomerFileConfig(
            path=_default_excel_path(),
            sheet_name="倫飛出貨",
            parse_rules=["arrow"],
        ),
        "bng": CustomerFileConfig(
            path=_default_excel_path(),
            sheet_name="超恩出貨",
            parse_rules=["trim"],
        ),
        "chg": CustomerFileConfig(
            path=_default_excel_path(),
            sheet_name="KOYA出貨",
            parse_rules=["trim"],
        ),
        "clg": CustomerFileConfig(
            path="/mnt/netdisk/@思創出貨計畫(Cubepilot)/各機種貼紙代碼/PCB板階、測試階序號编碼.xls",
            sheet_name="板階序號編碼",
            parse_rules=["none"],
        ),
        "hmg": CustomerFileConfig(
            path="/mnt/netdisk/@思創出貨計畫(Cubepilot)/各機種貼紙代碼/組裝、包裝階序號編碼.xls",
            sheet_name="組測序號編碼",
            parse_rules=["trim"],
        ),
    })


settings = Settings()
