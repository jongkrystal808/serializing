from io import BytesIO
from typing import Dict, List

from openpyxl import load_workbook

from app.core.config import settings
from app.core.errors import AppError
from app.schemas.excel import ParseExcelRequest, ParseExcelResponse

ARROW_PATTERN = ("->", "→", ">")

COLUMN_ALIASES: Dict[str, Dict[str, List[str]]] = {
    "yingbang": {
        "WORK_ORDER": ["工單號", "工單", "MO", "mo", "製令", "工單編號"],
        "PURCHASE_ORDER": ["採單號碼", "採單", "採購單號", "PO", "PO#"],
        "DDC_PART_NO": ["DDC料號", "DDC 料號", "DDC PN"],
        "PRODUCT_NAME": ["品名", "產品名稱", "MODEL", "Model", "型號"],
        "PN": ["料號", "P/N", "PN", "part number"],
        "QTY": ["數量", "Q'ty", "QTY", "Qty"],
    },
    "lunfei": {
        "MO": ["MO", "mo"],
        "MODEL": ["Model", "MODEL", "model"],
        "WORK_ORDER": ["工單", "工單號", "工單編號"],
        "PN": ["P/N", "PN", "料號"],
        "PROCESS_WO": ["加工WO#", "加工WO", "加工工單"],
        "PCBA": ["對應PCBA", "PCBA", "對應板號"],
        "QTY": ["Q'ty", "QTY", "Qty", "數量"],
    },
    "bng": {
        "MO": ["MO", "mo"],
        "DATE": ["日期", "Date"],
        "WORK_ORDER": ["工單", "工單號"],
        "MODEL": ["機種名稱", "Model", "MODEL"],
        "PART_NO": ["機種料號", "料號", "P/N", "PN"],
        "QTY": ["生產數量", "數量", "QTY", "Qty"],
        "MAC_RANGE": ["MAC  Address", "MAC Address", "MAC區間"],
        "MAC_QTY": ["MAC數量"],
        "MAC_BOARD_QTY": ["MAC板子用量數量", "MAC板用量數量"],
        "SN_RANGE": ["序號區間", "SN區間"],
        "UUID_RANGE": ["UUID區間", "UUID"],
        "BIOS": ["新版BIOS(以此為主)", "新版BIOS", "BIOS"],
        "FW": ["IGN FW版本", "FW", "FW版本"],
    },
    "chg": {
        "WORK_ORDER": ["工單", "工單號"],
        "QTY": ["小張貼紙", "QTY", "Qty", "數量"],
        "MODEL": ["機種", "Model", "MODEL"],
        "PN": ["PN", "P/N", "料號"],
        "BATCH": ["批量"],
        "PO": ["PO", "PO#"],
        "BOX_QTY": ["滿箱數量", "QTY", "Qty"],
        "DEMAND": ["需求"],
        "TAIL_QTY": ["尾數數量"],
        "FULL_PN": ["full PN", "FULL PN", "Full PN"],
    },
}


class ExcelService:
    def parse(self, payload: ParseExcelRequest, file_bytes: bytes) -> ParseExcelResponse:
        customer = payload.customer.strip()
        if customer not in settings.allowed_customers:
            raise AppError(
                f"不支援的 customer：{customer}",
                code="UNSUPPORTED_CUSTOMER",
                details={"allowed_customers": list(settings.allowed_customers)},
            )
        if not file_bytes:
            raise AppError("上傳檔案內容為空", code="EMPTY_FILE")

        workbook = load_workbook(
            filename=BytesIO(file_bytes),
            data_only=True,
            read_only=True,
        )
        if payload.sheet_name not in workbook.sheetnames:
            raise AppError(
                f"找不到工作表：{payload.sheet_name}",
                code="SHEET_NOT_FOUND",
                details={"available_sheets": workbook.sheetnames},
            )

        sheet = workbook[payload.sheet_name]
        rows_iter = sheet.iter_rows(values_only=True)
        headers = self._read_headers(rows_iter)
        if not headers:
            raise AppError("Excel 表頭為空，無法解析", code="EMPTY_HEADER")

        parsed_rows = self._read_rows(rows_iter, headers, payload.parse_rules)
        resolved_columns = self._resolve_columns(customer, headers)
        return ParseExcelResponse(
            customer=customer,
            sheet_name=payload.sheet_name,
            file_name=payload.file_name,
            rows_count=len(parsed_rows),
            rows=parsed_rows,
            resolved_columns=resolved_columns,
        )

    @staticmethod
    def _read_headers(rows_iter) -> List[str]:
        for row in rows_iter:
            candidates = [str(cell or "").strip() for cell in row]
            if any(candidates):
                return candidates
        return []

    def _read_rows(self, rows_iter, headers: List[str], parse_rules: List[str]) -> List[Dict[str, str]]:
        rows: List[Dict[str, str]] = []
        for row in rows_iter:
            parsed = {}
            is_empty = True
            for index, header in enumerate(headers):
                header_text = str(header or "").strip()
                if not header_text:
                    continue
                raw_value = row[index] if index < len(row) else ""
                value = self._apply_parse_rules(raw_value, parse_rules)
                parsed[header_text] = value
                if value:
                    is_empty = False
            if not is_empty:
                rows.append(parsed)
        return rows

    def _apply_parse_rules(self, value, parse_rules: List[str]) -> str:
        text = str(value or "").strip()
        active_rules = parse_rules or ["arrow"]
        for rule in active_rules:
            if rule == "trim":
                text = text.strip()
            if rule == "arrow":
                text = self._parse_arrow(text)
        return text

    @staticmethod
    def _parse_arrow(text: str) -> str:
        value = str(text or "").strip()
        if not value:
            return ""
        for marker in ARROW_PATTERN:
            if marker in value:
                parts = [segment.strip() for segment in value.split(marker) if segment.strip()]
                if parts:
                    value = parts[-1]
        return value

    def _resolve_columns(self, customer: str, headers: List[str]) -> Dict[str, str]:
        aliases = COLUMN_ALIASES.get(customer, {})
        resolved: Dict[str, str] = {}
        for code, candidates in aliases.items():
            resolved_header = self._find_header(headers, candidates)
            if resolved_header:
                resolved[code] = resolved_header
        return resolved

    @staticmethod
    def _find_header(headers: List[str], candidates: List[str]) -> str:
        normalized_headers = {ExcelService._normalize(header): header for header in headers if header}
        for candidate in candidates:
            found = normalized_headers.get(ExcelService._normalize(candidate))
            if found:
                return found
        return ""

    @staticmethod
    def _normalize(text: str) -> str:
        return str(text or "").strip().replace(" ", "").lower()


excel_service = ExcelService()
