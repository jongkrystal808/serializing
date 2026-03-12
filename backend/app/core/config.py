from dataclasses import dataclass


@dataclass(frozen=True)
class Settings:
    app_name: str = "SN-GENERATOR API"
    app_version: str = "0.1.0"
    api_prefix: str = "/api"
    db_path: str = "backend/data/sn_generator.db"
    allowed_customers: tuple[str, ...] = ("yingbang", "lunfei", "bng", "chg")


settings = Settings()
