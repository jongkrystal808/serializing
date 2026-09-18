from typing import Optional

from pydantic import Field

from app.schemas.common import StrictBaseModel


class NyxModelUpsertRequest(StrictBaseModel):
    original_model: Optional[str] = Field(default=None, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    pn: str = Field(min_length=1, max_length=100)


class NyxModelDeleteRequest(StrictBaseModel):
    model: str = Field(min_length=1, max_length=100)


class NyxModelEntry(StrictBaseModel):
    model: str
    pn: str
    updated_at: str


class NyxModelListData(StrictBaseModel):
    entries: list[NyxModelEntry]


class NyxModelUpsertData(StrictBaseModel):
    entry: NyxModelEntry


class NyxModelDeleteData(StrictBaseModel):
    model: str
    removed: bool
