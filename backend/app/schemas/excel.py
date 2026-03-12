from typing import Dict, List

from app.schemas.common import StrictBaseModel


class ParseExcelRequest(StrictBaseModel):
    customer: str
    sheet_name: str
    file_name: str
    parse_rules: List[str]


class ParseExcelResponse(StrictBaseModel):
    customer: str
    sheet_name: str
    file_name: str
    rows_count: int
    rows: List[Dict[str, str]]
    resolved_columns: Dict[str, str]
