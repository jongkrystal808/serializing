from typing import Annotated, List, Optional

from pydantic import Field

from app.schemas.common import StrictBaseModel
from app.core.customers import Customer


MAX_SN_QTY = 100_000
SerialText = Annotated[str, Field(max_length=500)]


class DegOptions(StrictBaseModel):
    spec: str = Field(min_length=1, max_length=32)
    product: str = Field(default="", max_length=100)
    date_code: str = Field(default="", max_length=16)
    year_last: str = Field(default="", max_length=8)
    week: str = Field(default="", max_length=2)
    weekday: str = Field(default="", max_length=1)
    start_serial: int = Field(default=1, ge=1, le=99999)


class GenerateSnRequest(StrictBaseModel):
    customer: Customer
    key: str = Field(min_length=1, max_length=200)
    qty: int = Field(gt=0, le=MAX_SN_QTY)
    purchase_order: str = Field(default="", max_length=200)
    week_key: str = Field(default="", max_length=32)
    record: str = Field(default="", max_length=2_000)
    deg: Optional[DegOptions] = None
    provided_serials: List[SerialText] = Field(default_factory=list, max_length=MAX_SN_QTY)
    fzg_kind: str = Field(default="customer", max_length=20)


class GenerateSnResponse(StrictBaseModel):
    customer: Customer
    key: str
    generated_count: int
    sn_list: List[str]
    previous_serial: int
    current_serial: int


class FzgStatus(StrictBaseModel):
    week_key: str
    mac_next: Optional[str]
    mac_remaining: int
    customer_next: Optional[int]
    customer_remaining: int


class FzgResetRequest(StrictBaseModel):
    kind: str = Field(min_length=1, max_length=20)
    start_hex: str = Field(default="", max_length=6)
