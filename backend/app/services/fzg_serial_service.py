"""勤誠序號規則，移植自 fzg_serial_generator.py。"""

import re
from datetime import date
from typing import Optional

from app.core.errors import AppError
from app.services.history_service import HistoryService

MAC_START = 0x200000
MAC_MAX = 0x2FFFFF
CUSTOMER_MAX = 99999


def parse_category_code(part_number: str) -> str:
    part = str(part_number or "").strip().replace(" ", "")
    match = re.search(r"[A-Z0-9]*?(\d{8})[A-Z0-9]*$", part, re.IGNORECASE)
    if match:
        return match.group(1)
    pieces = part.split("-")
    if len(pieces) >= 3:
        third = pieces[2]
        code = (third[0] + third[2:5]) if len(third) > 2 else (third[:1] or "0")
        return (pieces[1] + code.ljust(3, "0")[:3]).ljust(8, "0")[:8]
    raise AppError(f"無法解析勤誠料號：{part}", code="INVALID_FZG_PART_NUMBER")


def week_key(on_date: Optional[date] = None) -> tuple[str, str]:
    current = on_date or date.today()
    week = current.isocalendar().week
    year_week = f"{current.year % 100:02d}{week:02d}"
    return f"{current.year % 100:02d}-W{week:02d}", year_week


def generate_fzg(history: HistoryService, kind: str, part_number: str, count: int,
                 on_date: Optional[date] = None) -> tuple[list[str], str, int, int]:
    if kind == "mac":
        key = "MAC"
        range_values = history.reserve_range("fzg", key, count, start=MAC_START, maximum=MAC_MAX)
        serials = [f"5001C450 {value:06X}BF" for value in range(range_values["previous"] + 1, range_values["current"] + 1)]
    elif kind == "customer":
        category = parse_category_code(part_number)
        key, year_week = week_key(on_date)
        range_values = history.reserve_range("fzg", key, count, start=1, maximum=CUSTOMER_MAX)
        serials = [f"{year_week}{category}{value:05d}" for value in range(range_values["previous"] + 1, range_values["current"] + 1)]
    else:
        raise AppError("勤誠序號類型必須為 mac 或 customer", code="INVALID_FZG_KIND")
    return serials, key, range_values["previous"], range_values["current"]


def fzg_status(history: HistoryService) -> dict:
    key, _ = week_key()
    mac_last = history.get_last_serial("fzg", "MAC") or MAC_START - 1
    customer_last = history.get_last_serial("fzg", key)
    return {
        "week_key": key,
        "mac_next": f"{mac_last + 1:06X}" if mac_last < MAC_MAX else None,
        "mac_remaining": MAC_MAX - mac_last,
        "customer_next": customer_last + 1 if customer_last < CUSTOMER_MAX else None,
        "customer_remaining": CUSTOMER_MAX - customer_last,
    }


def reset_fzg(history: HistoryService, kind: str, start_hex: str = "") -> None:
    if kind == "customer":
        key, _ = week_key()
        history.reset_entry("fzg", key)
    elif kind == "mac":
        try:
            start = int(start_hex.strip() or "200000", 16)
        except ValueError as error:
            raise AppError("MAC 起始流水號必須是 16 進位數字", code="INVALID_FZG_MAC_START") from error
        if not MAC_START <= start <= MAC_MAX:
            raise AppError("MAC 起始流水號必須在 200000～2FFFFF", code="INVALID_FZG_MAC_START")
        history.set_last_serial("fzg", "MAC", start - 1)
    else:
        raise AppError("勤誠序號類型必須為 mac 或 customer", code="INVALID_FZG_KIND")
