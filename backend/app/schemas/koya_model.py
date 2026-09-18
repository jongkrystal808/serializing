from typing import Optional

from pydantic import Field

from app.schemas.common import StrictBaseModel


class KoyaModelUpsertRequest(StrictBaseModel):
    original_model: Optional[str] = Field(default=None, max_length=100)
    model: str = Field(min_length=1, max_length=100)
    pn: str = Field(min_length=1, max_length=100)
    full_pn: str = Field(min_length=1, max_length=100)


class KoyaModelDeleteRequest(StrictBaseModel):
    model: str = Field(min_length=1, max_length=100)


class KoyaModelEntry(StrictBaseModel):
    model: str
    pn: str
    full_pn: str
    updated_at: str


class KoyaModelListData(StrictBaseModel):
    entries: list[KoyaModelEntry]


class KoyaModelUpsertData(StrictBaseModel):
    entry: KoyaModelEntry


class KoyaModelDeleteData(StrictBaseModel):
    model: str
    removed: bool
