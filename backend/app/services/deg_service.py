import re
from datetime import datetime
from typing import Optional

from app.core.errors import AppError
from app.schemas.sn import DegOptions


def build_deg_serials(options: Optional[DegOptions], qty: int) -> tuple[list[str], str]:
    """泉影原程式的三種規格；起始號由操作員指定，超過碼寬即拒絕。"""
    def invalid(message: str) -> None:
        raise AppError(message, code="INVALID_DEG_OPTIONS")

    if options is None:
        invalid("泉影 DEG 需要編碼設定")
    product = options.product.strip()
    date_code = options.date_code.strip()
    week = options.week.strip()
    start = options.start_serial
    width = 5
    if options.spec == "hl":
        if not re.fullmatch(r"[A-Za-z0-9]{3}", product):
            invalid("HL 產品碼需為 3 位英數字")
        if not re.fullmatch(r"[0-9]{4}", date_code) or not 1 <= int(date_code[2:]) <= 53:
            invalid("HL 日期碼需為 YYWW，週數介於 01~53")
        prefix = f"HLDD{product}{date_code}"
    elif options.spec == "pizza_box":
        if not product or len(product) > 100 or not re.fullmatch(r"[A-Za-z0-9._/-]+", product):
            invalid("Pizza Box 料號需為英數字或 . _ / -，最多 100 字")
        if not re.fullmatch(r"[0-9]", options.year_last.strip()):
            invalid("年份最後一位需為 1 位數字")
        if not re.fullmatch(r"[1-7]", options.weekday.strip()):
            invalid("當週第幾天需為 1~7（週一為 1）")
        prefix = f"{product}DD{options.year_last.strip()}{week}{options.weekday.strip()}000"
    elif options.spec == "pizza_carton":
        if not re.fullmatch(r"[0-9]{6}", date_code):
            invalid("Pizza Carton 日期碼需為 YYMMDD")
        try:
            datetime.strptime("20" + date_code, "%Y%m%d")
        except ValueError:
            invalid("Pizza Carton 日期不存在")
        prefix = f"CO{date_code}{week}P"
        width = 3
    else:
        invalid("不支援的泉影 DEG 規格")
    if options.spec != "hl" and (
        not re.fullmatch(r"[0-9]{2}", week) or not 1 <= int(week) <= 53
    ):
        invalid("週數需為 01~53")
    if start + qty - 1 > 10**width - 1:
        invalid(f"起始流水號加數量超過 {10**width - 1}")
    return [f"{prefix}{value:0{width}d}" for value in range(start, start + qty)], f"{options.spec}:{prefix}"
