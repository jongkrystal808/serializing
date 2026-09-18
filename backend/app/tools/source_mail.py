"""自訂郵件來源：共用原有抽表器，同主題鍵更新。"""
from contextlib import contextmanager
from email import policy
from email.parser import BytesParser
from io import BytesIO
import re

if __package__:
    from .mail_tables import extract_raw_tables_from_html
else:
    from mail_tables import extract_raw_tables_from_html


def _decode(data, charset=None):
    if isinstance(data, str):
        return data
    for encoding in [charset, "utf-8-sig", "cp950", "gb18030"]:
        if encoding:
            try:
                return data.decode(encoding)
            except (UnicodeError, LookupError):
                pass
    raise ValueError("無法解碼郵件HTML")


def read_message(path):
    if path.suffix.lower() == ".eml":
        message = BytesParser(policy=policy.default).parsebytes(path.read_bytes())
        bodies, attachments = [], []
        for part in message.walk():
            if part.is_multipart():
                continue
            filename = part.get_filename()
            if filename or part.get_content_disposition() == "attachment":
                attachments.append((filename or "attachment", part.get_payload(decode=True) or b"", part.get_content_charset()))
            elif part.get_content_type() == "text/html":
                bodies.append(_decode(part.get_payload(decode=True) or b"", part.get_content_charset()))
        return str(message.get("Subject", "")), bodies, attachments
    import extract_msg
    message = extract_msg.Message(str(path))
    try:
        subject = str(message.subject or "")
        bodies = [_decode(message.htmlBody)] if message.htmlBody else []
        attachments = [(str(attachment.longFilename or attachment.shortFilename or "attachment"), attachment.data, None) for attachment in message.attachments]
        return subject, bodies, attachments
    finally:
        message.close()


def thread_info(path, options):
    subject, bodies, attachments = read_message(path)
    if not subject.strip():
        raise ValueError("郵件缺少主題，無法判斷局部更新範圍")
    pattern = re.compile(r"^\s*(?:" + "|".join(re.escape(value) for value in options["reply_prefixes"]) + r")\s*[:：]\s*", re.IGNORECASE)
    thread = subject.strip()
    reply = False
    while pattern.match(thread):
        thread = pattern.sub("", thread, count=1); reply = True
    if not thread.strip():
        raise ValueError("去除回覆前綴後主題全空")
    return {"subject": subject, "thread": thread.strip().casefold(), "reply": reply}, bodies, attachments


def _tables(html, options):
    tables = extract_raw_tables_from_html(html, strike=options["strike"])
    return [table for table in tables if len(table) > 1 and max(map(len, table)) >= options["min_columns"]]


class TableWorkbook:
    """把HTML原始表格接到既有表頭／別名／規則流程。"""
    sheet_names = ["郵件表格"]

    def __init__(self, rows):
        import pandas as pd
        width = max(map(len, rows))
        self.frame = pd.DataFrame([row + [""] * (width - len(row)) for row in rows])

    def parse(self, sheet, header=None, nrows=None, **kwargs):
        if header is None:
            return self.frame.iloc[:nrows].copy() if nrows is not None else self.frame.copy()
        frame = self.frame.iloc[header + 1:].copy()
        frame.columns = self.frame.iloc[header].tolist()
        frame.index = range(len(frame))
        return frame.iloc[:nrows] if nrows is not None else frame


@contextmanager
def open_source(path, rules):
    import pandas as pd
    if path.suffix.lower() not in (".msg", ".eml"):
        with pd.ExcelFile(path) as workbook:
            yield workbook, {"thread": str(path), "reply": False}
        return
    options = rules["mail"]
    metadata, bodies, attachments = thread_info(path, options)
    tables = []
    location = options["location"]
    if location != "attachment":
        for body in bodies:
            tables.extend(_tables(body, options))
    excel_attachment = None
    if location == "attachment" or (location == "body_or_attachment" and not tables):
        for name, data, charset in attachments:
            if name.lower().endswith((".html", ".htm")):
                tables.extend(_tables(_decode(data, charset), options))
            elif name.lower().endswith((".xls", ".xlsx", ".xlsm")) and excel_attachment is None:
                excel_attachment = (name, data)
    if tables:
        rows = tables[0] if options["table"] == "first" else max(tables, key=lambda value: max(map(len, value)))
        metadata["table_rows"] = len(rows)
        yield TableWorkbook(rows), metadata
    elif excel_attachment:
        name, data = excel_attachment
        metadata["attachment"] = name
        with pd.ExcelFile(BytesIO(data)) as workbook:
            yield workbook, metadata
    else:
        raise ValueError("郵件中找不到符合欄數的HTML表格或Excel附件")


def expand_bases(files, candidates, rules):
    options = rules["mail"]
    if not options["update_keys"]:
        return files
    metadata = {}
    def info(path):
        if path not in metadata:
            metadata[path] = thread_info(path, options)[0]
        return metadata[path]
    expanded = list(files)
    for path in files:
        if path.suffix.lower() not in (".eml", ".msg") or not info(path)["reply"]:
            continue
        originals = []
        for candidate in candidates:
            if candidate.suffix.lower() not in (".eml", ".msg") or candidate.stat().st_mtime > path.stat().st_mtime:
                continue
            try:
                data = info(candidate)
            except Exception:
                continue
            if not data["reply"] and data["thread"] == info(path)["thread"]:
                originals.append(candidate)
        included = [candidate for candidate in originals if candidate in expanded]
        if not included and options["base_search"] and originals:
            original = max(originals, key=lambda value: (value.stat().st_mtime, value.name))
            expanded.append(original)
        elif not included:
            raise ValueError(f"回覆郵件{path.name}沒有同主題原始底稿；請增加最近檔案數或啟用底稿回溯")
    return sorted(expanded, key=lambda value: (value.stat().st_mtime, value.name))


def merge_batches(batches, keys, report=None):
    import pandas as pd
    if not keys:
        return pd.concat([frame for _, frame in batches], ignore_index=True).fillna("")
    threads = {}
    for metadata, frame in batches:
        thread = metadata["thread"]
        if metadata["reply"]:
            if thread not in threads:
                raise ValueError(f"回覆郵件缺少同主題底稿：{metadata['subject']}")
            previous = threads[thread]
            if any(key not in frame or key not in previous for key in keys):
                raise ValueError(f"局部更新鍵欄缺少：{keys}")
            patch = [tuple(str(row[key]).strip() for key in keys) for _, row in frame.iterrows()]
            if any(any(not part for part in key) for key in patch) or len(set(patch)) != len(patch):
                raise ValueError("局部更新鍵含空值或重複，無法安全替換")
            patch_keys = set(patch)
            keep = previous.apply(lambda row: tuple(str(row[key]).strip() for key in keys) not in patch_keys, axis=1)
            threads[thread] = pd.concat([previous.loc[keep], frame], ignore_index=True).fillna("")
            if report is not None:
                report.setdefault("mail_updates", []).append({"subject": metadata["subject"], "replaced": int((~keep).sum()), "added": len(frame)})
        else:
            threads[thread] = pd.concat([threads[thread], frame], ignore_index=True).fillna("") if thread in threads else frame
    return pd.concat(list(threads.values()), ignore_index=True).fillna("")
