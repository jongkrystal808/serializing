from typing import List

from pydantic import Field

from app.schemas.common import StrictBaseModel


class GenerateSnRequest(StrictBaseModel):
    customer: str
    key: str
    qty: int
    purchase_order: str = ""
    week_key: str = ""
    record: str = ""
    provided_serials: List[str] = Field(default_factory=list)


class GenerateSnResponse(StrictBaseModel):
    customer: str
    key: str
    generated_count: int
    sn_list: List[str]
    previous_serial: int
    current_serial: int
