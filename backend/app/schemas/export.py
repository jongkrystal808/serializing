from typing import Dict, List

from pydantic import Field

from app.schemas.common import StrictBaseModel


class ExportRequest(StrictBaseModel):
    customer: str
    sn_rows: List[Dict[str, str]] = Field(default_factory=list)
    box_row: Dict[str, str] = Field(default_factory=dict)
    file_name: str = ""


class ExportResponse(StrictBaseModel):
    customer: str
    filename: str
