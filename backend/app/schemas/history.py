from app.schemas.common import StrictBaseModel


class HistoryResetRequest(StrictBaseModel):
    customer: str
    key: str


class HistoryUpsertRequest(StrictBaseModel):
    customer: str
    key: str
    increment: int = 0
    record: str = ""


class HistoryEntry(StrictBaseModel):
    key: str
    last_serial: int


class GenerationRecord(StrictBaseModel):
    key: str
    record: str
    created_at: str
