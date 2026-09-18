from html.parser import HTMLParser
import re


def extract_raw_tables_from_html(html_content, strike=None):
    """使用標準函式庫讀取 HTML 表格，不依賴 lxml。"""

    class TableParser(HTMLParser):
        def __init__(self):
            super().__init__(convert_charrefs=True)
            self.tables = []
            self.table_depth = 0
            self.rows = []
            self.row = None
            self.cell = None
            self.deleted_depth = 0
            self.deleted_tags = []

        def handle_starttag(self, tag, attrs):
            tag = tag.lower()
            if tag == "table":
                self.table_depth += 1
                if self.table_depth == 1:
                    self.rows = []
            elif self.table_depth == 1 and tag == "tr":
                self.row = []
            elif self.table_depth == 1 and tag in {"td", "th"}:
                if strike is not None and any(str(dict(attrs).get(name, "1")) != "1" for name in ("colspan", "rowspan")):
                    raise ValueError("郵件HTML表格含合併儲存格，請改用未合併表格或Excel附件")
                self.cell = []
            elif self.cell is not None and tag == "br":
                self.cell.append(" ")
            if self.cell is not None and (tag in {"s", "strike", "del"} or (strike is not None and "line-through" in str(dict(attrs).get("style", "")).lower())):
                self.deleted_depth += 1
                self.deleted_tags.append(tag)

        def handle_data(self, data):
            if self.cell is not None and (strike != "omit" or not self.deleted_depth):
                self.cell.append(data)

        def handle_endtag(self, tag):
            tag = tag.lower()
            if self.cell is not None and tag in self.deleted_tags:
                self.deleted_depth = max(0, self.deleted_depth - 1)
                self.deleted_tags.remove(tag)
                if strike in (None, "mark"):
                    self.cell.append("[已刪除]")
            if self.table_depth == 1 and tag in {"td", "th"} and self.cell is not None:
                self.row.append(re.sub(r"\s+", " ", "".join(self.cell)).strip())
                self.cell = None
            elif self.table_depth == 1 and tag == "tr" and self.row:
                self.rows.append(self.row)
                self.row = None
            elif tag == "table":
                if self.table_depth == 1 and self.rows:
                    self.tables.append(self.rows)
                self.table_depth = max(0, self.table_depth - 1)

    parser = TableParser()
    parser.feed(html_content)
    return parser.tables


