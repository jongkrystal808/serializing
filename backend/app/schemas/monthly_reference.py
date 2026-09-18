from typing import Optional

from pydantic import Field

from app.schemas.common import StrictBaseModel


class MonthlyReferenceUpsertRequest(StrictBaseModel):
    original_month: Optional[str] = Field(default=None, max_length=30)
    month: str = Field(min_length=1, max_length=30)
    value: str = Field(default="", max_length=100)


class MonthlyReferenceDeleteRequest(StrictBaseModel):
    month: str = Field(min_length=1, max_length=30)


class MonthlyReferenceEntry(StrictBaseModel):
    month: str
    value: str
    updated_at: str


class MonthlyReferenceListData(StrictBaseModel):
    customer: str
    value_label: str
    entries: list[MonthlyReferenceEntry]


class MonthlyReferenceUpsertData(StrictBaseModel):
    entry: MonthlyReferenceEntry


class MonthlyReferenceDeleteData(StrictBaseModel):
    month: str
    removed: bool
