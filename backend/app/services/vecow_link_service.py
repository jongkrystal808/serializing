from contextlib import closing
from pathlib import Path
import sqlite3
from urllib.parse import urlsplit

from app.core.config import settings
from app.core.errors import AppError


class VecowLinkService:
    """【用途】持久保存超恩 BIOS/FW 一覽表的瀏覽器連結。"""

    def __init__(self, db_path=None):
        self.db_path = db_path or settings.db_path

    def initialize(self):
        """【用途】建立連結設定表，不預填未知網址。"""
        Path(self.db_path).parent.mkdir(parents=True, exist_ok=True)
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute("CREATE TABLE IF NOT EXISTS vecow_link (id INTEGER PRIMARY KEY CHECK (id = 1), url TEXT NOT NULL)")

    def get_url(self):
        """【用途】讀取共用連結，尚未設定時回傳空白。"""
        with closing(sqlite3.connect(self.db_path)) as conn:
            row = conn.execute("SELECT url FROM vecow_link WHERE id = 1").fetchone()
        return row[0] if row else ""

    def save_url(self, url):
        """【用途】驗證 HTTP(S) 網址並儲存；空白表示移除連結。"""
        value = url.strip()
        try:
            parsed = urlsplit(value)
            valid = parsed.scheme.lower() in ("http", "https") and bool(parsed.hostname) and not parsed.username and not parsed.password
        except ValueError:
            valid = False
        if value and (not valid or any(char.isspace() or ord(char) < 32 or ord(char) == 127 for char in value) or "\\" in value):
            raise AppError("請輸入有效的 http:// 或 https:// 連結；空白可移除連結。", code="INVALID_VECOW_LINK")
        with closing(sqlite3.connect(self.db_path)) as conn, conn:
            conn.execute("INSERT INTO vecow_link (id, url) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET url = excluded.url", (value,))
        return value
