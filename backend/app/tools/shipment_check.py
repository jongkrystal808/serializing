"""部署完整性與舊客戶唯讀比較；不啟動更新、不初始化資料庫。"""
import argparse
from contextlib import redirect_stdout, redirect_stderr
import hashlib
from io import StringIO
import json
import os
from pathlib import Path
import re
import sys
from urllib.parse import urljoin, urlsplit
from urllib.request import Request, urlopen

ROOT = Path(__file__).resolve().parents[3]
sys.path.insert(0, str(ROOT / "backend"))

RELEASE_FILES = [
    "backend/app/tools/source_presets.py",
    "js/modules/sourceSearch.js",
    "js/modules/uiPreviewRenderers.js",
    "backend/app/routers/excel.py", "backend/app/services/excel_service.py",
    "backend/app/core/config.py", "js/state.js", "js/modules/homeController.js", "js/modules/deg.js",
    "backend/app/routers/shipment_source.py", "backend/app/routers/shipment_refresh.py",
    "backend/app/schemas/shipment_source.py", "backend/app/schemas/shipment_refresh.py",
    "backend/app/services/shipment_source_service.py", "backend/app/services/shipment_refresh_service.py",
    "backend/app/tools/shipment_merge.py", "backend/app/tools/source_rules.py",
    "backend/app/tools/source_advanced.py", "backend/app/tools/source_mail.py",
    "backend/app/tools/mail_tables.py", "backend/app/tools/source_migration.py",
    "backend/app/tools/shipment_check.py", "js/app.js", "js/modules/api.js",
    "js/modules/sourceRulesEditor.js", "js/modules/sourcePreview.js", "index.html", "styles/main.css",
]


def content_hash(data):
    """Windows／Linux文字檔換行一致化；不忽略其他內容。"""
    return hashlib.sha256(data.replace(b"\r\n", b"\n")).hexdigest()


def asset_paths():
    index = (ROOT / "index.html").read_text(encoding="utf-8")
    queue = [url for url in re.findall(r'(?:src|href)="([^"]+)"', index) if not urlsplit(url).netloc and not urlsplit(url).scheme and urlsplit(url).path.endswith((".js", ".css"))]
    queue.extend(item for item in re.findall(r'from\s*[\'"]([^\'"]+)[\'"]', index) if item.startswith("."))
    found = {}
    while queue:
        url = queue.pop(0)
        if url in found:
            continue
        path = (ROOT / urlsplit(url).path.lstrip("/")).resolve()
        if not path.is_relative_to(ROOT) or not path.is_file():
            raise ValueError(f"前端模組缺失或路徑無效：{url}")
        found[url] = path
        if path.suffix == ".js":
            code = path.read_text(encoding="utf-8")
            imports = re.findall(r'(?:from\s*|import\s*)[\'"]([^\'"]+)[\'"]', code)
            queue.extend(urljoin(url, item) for item in imports if item.startswith("."))
    return found


def check_release(manifest=None, base_url=None):
    errors, files = [], {}
    for name in RELEASE_FILES:
        path = ROOT / name
        if not path.is_file():
            errors.append("部署檔案缺失：" + name)
            continue
        files[name] = content_hash(path.read_bytes())
    if manifest:
        expected = json.loads(Path(manifest).read_text(encoding="utf-8"))["files"]
        if set(expected) != set(RELEASE_FILES):
            errors.append("部署清單與此版本的必要檔案不一致")
        for name in RELEASE_FILES:
            if name in expected and files.get(name) != expected[name]:
                errors.append("部署檔案版本不符：" + name)
    try:
        assets = asset_paths()
        if base_url:
            assets = {"./index.html": ROOT / "index.html", **assets}
            for url, path in assets.items():
                target = urljoin(base_url.rstrip("/") + "/", url)
                try:
                    request = Request(target, headers={"Accept-Encoding": "identity"})
                    with urlopen(request, timeout=10) as response:
                        mime = response.headers.get_content_type()
                        wanted = {".js": ("application/javascript", "text/javascript", "application/ecmascript"), ".css": ("text/css",), ".html": ("text/html",)}[path.suffix]
                        body = response.read(5 * 1024 * 1024 + 1)
                    if mime not in wanted:
                        errors.append(f"前端MIME錯誤：{url} → {mime}")
                    elif content_hash(body) != content_hash(path.read_bytes()):
                        errors.append("伺服器回傳內容與部署檔案不同：" + url)
                except Exception as error:
                    errors.append(f"前端讀取失敗：{url}；{error}")
    except Exception as error:
        errors.append(str(error))
    try:
        from app.main import app
        from app.core.config import settings
        from app.schemas.shipment_refresh import ShipmentSourceResult
        from app.schemas.shipment_source import ShipmentSourceUpdateRequest
        from app.tools.source_rules import validate_rules
        from app.tools.source_migration import migration_keys
        paths = {route.path for route in app.routes}
        if not {"/api/shipment-sources/preview", "/api/shipment-refresh/run", "/api/excel/load-source"}.issubset(paths):
            errors.append("缺少來源預覽／更新API路由")
        if "migration_status" not in ShipmentSourceResult.model_fields or "rules" not in ShipmentSourceUpdateRequest.model_fields:
            errors.append("API結構版本不符")
        validate_rules({"version": 1})
        migration_keys()
        script = Path(settings.shipment_refresh_script_path)
        for name in ("shipment_merge.py", "source_rules.py", "source_advanced.py", "source_mail.py", "mail_tables.py", "source_migration.py", "source_presets.py"):
            deployed = script if name == "shipment_merge.py" else script.parent / name
            expected_hash = files.get("backend/app/tools/" + name)
            if not deployed.is_file() or content_hash(deployed.read_bytes()) != expected_hash:
                errors.append("實際更新腳本／旁邊模組版本不符：" + str(deployed))
    except Exception as error:
        errors.append("後端模組檢查失敗：" + str(error))
    return {"files": files, "errors": errors}


def _writable(path, label, errors):
    if path.exists() and not os.access(path, os.W_OK):
        errors.append(f"{label}不可寫入：{path}")
    parent = path.parent
    while not parent.exists() and parent != parent.parent:
        parent = parent.parent
    if not os.access(parent, os.W_OK | os.X_OK):
        errors.append(f"{label}父目錄不可寫入／進入：{parent}")


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--check", action="store_true", help="檢查模組、資產、設定與服務使用者權限")
    parser.add_argument("--compare", nargs="?", const="all", help="唯讀比較客戶，例如lunfei,fzg，或all")
    parser.add_argument("--manifest", help="核對同批部署的SHA256清單")
    parser.add_argument("--base-url", help="檢查正式網頁JS/CSS的MIME及內容，例如https://host/sn/")
    parser.add_argument("--env-only", action="store_true", help="使用環境來源設定，跳過SQLite與寫入權限檢查；不是正式驗收")
    args = parser.parse_args(argv)
    report = check_release(args.manifest, args.base_url)
    report["comparisons"] = []
    from app.core.config import settings
    if not args.env_only:
        try:
            from app.services.shipment_source_service import ShipmentSourceService
            service = ShipmentSourceService(settings.db_path)
            environment = service.build_environment(readonly=True)
            from app.tools.source_rules import validate_rules
            for source in json.loads(environment["SHIPMENT_CUSTOM_SOURCES"]):
                validate_rules(source["rules"])
            os.environ.update(environment)
            _writable(Path(settings.db_path), "SQLite資料庫", report["errors"])
            _writable(Path(settings.default_excel_path), "總表", report["errors"])
            log = Path(os.getenv("SHIPMENT_LOG_FILE", "").strip() or "/opt/sn_generator/shipment_merge.log")
            _writable(log, "更新日誌", report["errors"])
        except Exception as error:
            report["errors"].append("來源設定／資料庫檢查失敗：" + str(error))
    if args.compare and not report["errors"]:
        from app.tools import shipment_merge as merge
        from app.tools.source_migration import CUSTOMERS, migration_keys, compare_customer
        keys = migration_keys(",".join(CUSTOMERS) if args.compare == "all" else args.compare)
        original_log = merge.write_log
        merge.write_log = lambda message: None
        try:
            for key in CUSTOMERS:
                if key not in keys:
                    continue
                name, function = CUSTOMERS[key]
                output = StringIO()
                try:
                    with redirect_stdout(output), redirect_stderr(output):
                        _, result = compare_customer(key, getattr(merge, function), merge.CUSTOMER_CONFIGS[name], settings.db_path)
                except Exception as error:
                    result = {"customer": key, "migration_status": "fallback", "matched": False, "reason": "舊流程失敗：" + str(error)}
                if not result["matched"]:
                    result["diagnostics"] = output.getvalue()[-5000:]
                report["comparisons"].append(result)
        finally:
            merge.write_log = original_log
    print(json.dumps(report, ensure_ascii=False, indent=2))
    if report["errors"]:
        return 1
    return 2 if any(not item["matched"] for item in report["comparisons"]) else 0


if __name__ == "__main__":
    if hasattr(sys.stdout, "reconfigure"):
        sys.stdout.reconfigure(encoding="utf-8")
    try:
        sys.exit(main())
    except Exception as error:
        print(json.dumps({"errors": [str(error)]}, ensure_ascii=False))
        sys.exit(1)
