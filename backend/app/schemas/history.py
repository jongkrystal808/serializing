from pydantic import Field

from app.schemas.common import StrictBaseModel


MAX_HISTORY_INCREMENT = 100_000


class HistoryResetRequest(StrictBaseModel):
    customer: str = Field(min_length=1, max_length=50)
    key: str = Field(min_length=1, max_length=200)


class HistoryUpsertRequest(StrictBaseModel):
    customer: str = Field(min_length=1, max_length=50)
    key: str = Field(min_length=1, max_length=200)
    increment: int = Field(default=0, ge=0, le=MAX_HISTORY_INCREMENT)
    record: str = Field(default="", max_length=2_000)


class HistoryEntry(StrictBaseModel):
    key: str
    last_serial: int


class GenerationRecord(StrictBaseModel):
    key: str
    record: str
    created_at: str


class HistoryData(StrictBaseModel):
    customer: str
    entries: list[HistoryEntry]
    records: list[GenerationRecord]


class HistoryUpsertData(StrictBaseModel):
    customer: str
    key: str
    previous: int
    current: int
    record_added: bool


class HistoryResetData(StrictBaseModel):
    customer: str
    key: str
    removed: bool
