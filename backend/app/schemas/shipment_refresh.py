from typing import Literal, Optional

from pydantic import Field

from app.schemas.common import StrictBaseModel


class ShipmentSourceResult(StrictBaseModel):
    label: str
    status: Literal["updated", "retained", "skipped", "failed"]
    rows: int = Field(ge=0)
    error: Optional[str] = None
    migration_status: Optional[Literal["matched", "fallback", "blocked"]] = None
    migration_reason: Optional[str] = None


class ShipmentRefreshJob(StrictBaseModel):
    status: Literal["idle", "running", "succeeded", "failed"]
    progress: int = Field(ge=0, le=100)
    stage: str
    message: str
    started_at: Optional[str] = None
    finished_at: Optional[str] = None
    last_updated_at: Optional[str] = None
    source_results: list[ShipmentSourceResult] = Field(default_factory=list)
