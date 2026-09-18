from typing import Any, Dict, Literal, Optional

from pydantic import Field

from app.schemas.common import StrictBaseModel


class ShipmentSourceUpdateRequest(StrictBaseModel):
    customer_keywords: str = Field(default="", max_length=1000)
    search_customer: Literal["", "deg"] = ""
    work_order_column: str = Field(default="", max_length=1000)
    path: str = Field(min_length=1, max_length=1000)
    sheet_rule: str = Field(default="", max_length=1000)
    file_rule: str = Field(default="", max_length=300)
    recent_files: Optional[int] = Field(default=None, ge=1, le=50)
    rules: Optional[Dict[str, Any]] = None


class ShipmentSourceCreateRequest(ShipmentSourceUpdateRequest):
    label: str = Field(min_length=1, max_length=31)
    path_kind: Literal["folder", "file"] = "folder"


class ShipmentSourceEntry(StrictBaseModel):
    rule_template: Optional[Dict[str, Any]] = None
    rule_summary: str = ""
    rule_editable: bool = False
    customer_keywords: str = ""
    search_customer: Literal["", "deg"] = ""
    work_order_column: str = ""
    rules: Optional[Dict[str, Any]] = None
    is_custom: bool = False
    key: str
    label: str
    path_kind: Literal["folder", "file"]
    path: str
    sheet_rule: str
    sheet_rule_label: str
    file_rule: str
    file_rule_label: str
    recent_files: Optional[int]
    recent_files_label: str
    updated_at: str


class ShipmentSourceListData(StrictBaseModel):
    entries: list[ShipmentSourceEntry]
