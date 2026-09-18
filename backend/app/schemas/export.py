from typing import Annotated, Dict, List

from pydantic import Field

from app.schemas.common import StrictBaseModel


MAX_EXPORT_ROWS = 100_000
ExportText = Annotated[str, Field(max_length=500)]
ExportRow = Annotated[
    Dict[Annotated[str, Field(min_length=1, max_length=100)], ExportText],
    Field(max_length=32),
]


class ExportRequest(StrictBaseModel):
    customer: str = Field(min_length=1, max_length=50)
    sn_rows: List[ExportRow] = Field(default_factory=list, max_length=MAX_EXPORT_ROWS)
    box_row: ExportRow = Field(default_factory=dict)
    file_name: str = Field(default="", max_length=255)


class ExportResponse(StrictBaseModel):
    customer: str
    filename: str
