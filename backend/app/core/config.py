import os
from dataclasses import dataclass, field
from typing import Dict, List


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
    db_path: str = "backend/data/sn_generator.db"
    allowed_customers: tuple[str, ...] = ("yingbang", "lunfei", "bng", "chg", "hmg", "clg")
    cors_allowed_origins: tuple[str, ...] = field(default_factory=_read_cors_allowed_origins)

    default_excel: Dict[str, CustomerFileConfig] = field(default_factory=lambda: {
        "yingbang": CustomerFileConfig(
            path="/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx",
            sheet_name="營邦出貨",
            parse_rules=["arrow"],
        ),
        "lunfei": CustomerFileConfig(
            path="/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx",
            sheet_name="倫飛出貨",
            parse_rules=["arrow"],
        ),
        "bng": CustomerFileConfig(
            path="/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx",
            sheet_name="超恩出貨",
            parse_rules=["trim"],
        ),
        "chg": CustomerFileConfig(
            path="/mnt/netdisk/TE/個人資料/To Claire/出貨記錄總表.xlsx",
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


#     default_excel: Dict[str, CustomerFileConfig] = field(default_factory=lambda: {
#         "yingbang": CustomerFileConfig(
#             path=r"H:\TE\個人資料\To Claire\出貨記錄總表.xlsx",
#             sheet_name="營邦出貨",
#             parse_rules=["arrow"],
#         ),
#         "lunfei": CustomerFileConfig(
#             path=r"H:\TE\個人資料\To Claire\出貨記錄總表.xlsx",
#             sheet_name="倫飛出貨",
#             parse_rules=["arrow"],
#         ),
#         "bng": CustomerFileConfig(
#             path=r"H:\TE\個人資料\To Claire\出貨記錄總表.xlsx",
#             sheet_name="超恩出貨",
#             parse_rules=["trim"],
#         ),
#         "chg": CustomerFileConfig(
#             path=r"H:\TE\個人資料\To Claire\出貨記錄總表.xlsx",
#             sheet_name="KOYA出貨",
#             parse_rules=["trim"],
#         ),
#         "clg": CustomerFileConfig(
#             path=r"H:\@思創出貨計畫(Cubepilot)\各機種貼紙代碼\組裝、包裝階序號編碼.xls",
#             sheet_name="Sheet1",
#             parse_rules=["trim"],
#         ),
#         "hmg": CustomerFileConfig(
#             path=r"H:\@思創出貨計畫(Cubepilot)\各機種貼紙代碼\PCB板階、測試階序號编碼.xls",
#             sheet_name="Sheet1",
#             parse_rules=["none"],
#         ),
#     })
#
#
# settings = Settings()
