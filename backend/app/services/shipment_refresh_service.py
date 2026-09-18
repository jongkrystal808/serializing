from __future__ import annotations

from datetime import datetime, timedelta, timezone
import logging
import json
import os
from pathlib import Path
import subprocess
import sys
from threading import RLock, Thread

from app.core.config import settings
from app.core.errors import AppError
from app.core.logging import log_event
from app.schemas.shipment_refresh import ShipmentRefreshJob, ShipmentSourceResult
from app.services.shipment_source_service import ShipmentSourceService


logger = logging.getLogger(__name__)
TAIPEI_TZ = timezone(timedelta(hours=8), name="Asia/Taipei")
PROGRESS_STAGES = (
    ("處理營邦出貨", 10, "正在更新營邦"),
    ("處理倫飛出貨", 24, "正在更新倫飛"),
    ("處理超恩出貨", 38, "正在更新超恩"),
    ("處理 KOYA 出貨", 56, "正在更新 KOYA"),
    ("處理富弘年出貨", 70, "正在更新富弘年"),
    ("處理勤誠出貨", 82, "正在更新勤誠"),
    ("正在儲存到", 92, "正在寫入總表"),
    ("已套用完整樣板", 97, "正在完成 Excel 格式"),
)


class ShipmentRefreshService:
    """在背景執行出貨總表更新，供前端輪詢真實階段進度。"""

    def __init__(
        self,
        script_path: str | None = None,
        output_path: str | None = None,
        source_service: ShipmentSourceService | None = None,
    ) -> None:
        self._lock = RLock()
        self._script_path = Path(script_path or settings.shipment_refresh_script_path)
        self._output_path = Path(output_path or settings.default_excel_path)
        self._source_service = source_service
        self._job = ShipmentRefreshJob(
            status="idle",
            progress=0,
            stage="尚未執行",
            message="按下更新資料後開始重建出貨記錄總表。",
        )

    def initialize(self) -> None:
        """保留與其他應用服務一致的生命週期入口。"""

    def get_status(self) -> ShipmentRefreshJob:
        with self._lock:
            job = self._job.model_copy(deep=True)
            try:
                job.last_updated_at = datetime.fromtimestamp(
                    self._output_path.stat().st_mtime, TAIPEI_TZ
                ).strftime("%Y-%m-%d %H:%M:%S")
            except OSError:
                pass
            return job

    def start(self) -> ShipmentRefreshJob:
        with self._lock:
            if self._job.status == "running":
                raise AppError(
                    "資料更新正在執行，請勿重複啟動",
                    code="SHIPMENT_REFRESH_RUNNING",
                    status_code=409,
                )
            self._job = ShipmentRefreshJob(
                status="running",
                progress=2,
                stage="準備更新",
                message="正在啟動出貨資料更新程式。",
                started_at=self._now_text(),
            )
            Thread(target=self._run_job, name="shipment-refresh-job", daemon=True).start()
            return self.get_status()

    def _run_job(self) -> None:
        script_path = self._script_path
        output_path = self._output_path
        try:
            if not script_path.is_file():
                raise RuntimeError(f"找不到更新程式：{script_path}")
            output_path.parent.mkdir(parents=True, exist_ok=True)
            environment = os.environ.copy()
            environment["SHIPMENT_OUTPUT_FOLDER"] = str(output_path.parent)
            environment["SHIPMENT_LOG_FILE"] = (
                os.getenv("SHIPMENT_LOG_FILE", "").strip()
                or "/opt/sn_generator/shipment_merge.log"
            )
            environment["SHIPMENT_NO_PAUSE"] = "1"
            environment["SHIPMENT_DB_PATH"] = self._source_service.db_path if self._source_service is not None and hasattr(self._source_service, "db_path") else settings.db_path
            environment["PYTHONUNBUFFERED"] = "1"
            if self._source_service is not None:
                environment.update(self._source_service.build_environment())

            process = subprocess.Popen(
                [sys.executable, "-u", str(script_path)],
                cwd=str(script_path.parent),
                env=environment,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
                encoding="utf-8",
                errors="replace",
                bufsize=1,
            )
            recent_lines: list[str] = []
            completed = False
            assert process.stdout is not None
            for raw_line in process.stdout:
                line = raw_line.strip()
                if not line:
                    continue
                recent_lines.append(line)
                recent_lines = recent_lines[-30:]
                if "處理完成" in line:
                    completed = True
                self._apply_progress_line(line)
                log_event(logger, logging.INFO, "shipment_refresh_output", line=line)
            return_code = process.wait()
            if return_code != 0:
                raise RuntimeError(f"更新程式結束碼為 {return_code}")
            if not output_path.is_file() or not completed:
                detail = recent_lines[-1] if recent_lines else "未產生任何輸出"
                raise RuntimeError(f"總表沒有更新：{detail}")
            with self._lock:
                self._job = ShipmentRefreshJob(
                    status="succeeded",
                    progress=100,
                    stage="更新完成",
                    message=f"出貨記錄總表已更新：{output_path.name}",
                    started_at=self._job.started_at,
                    finished_at=self._now_text(),
                    source_results=self._job.source_results,
                )
            log_event(logger, logging.INFO, "shipment_refresh_succeeded")
        except Exception as error:
            logger.exception("出貨資料更新失敗")
            with self._lock:
                self._job = ShipmentRefreshJob(
                    status="failed",
                    progress=self._job.progress,
                    stage="更新失敗",
                    message=str(error),
                    started_at=self._job.started_at,
                    finished_at=self._now_text(),
                    source_results=self._job.source_results,
                )

    def _apply_progress_line(self, line: str) -> None:
        if line.startswith("SHIPMENT_SOURCE_RESULTS "):
            try:
                results = [ShipmentSourceResult.model_validate(item) for item in json.loads(line.split(" ", 1)[1])]
            except (ValueError, TypeError):
                logger.warning("無法解析逐來源更新結果")
                return
            with self._lock:
                self._job.source_results = results
            return
        for marker, progress, stage in PROGRESS_STAGES:
            if marker in line:
                with self._lock:
                    self._job.progress = max(self._job.progress, progress)
                    self._job.stage = stage
                    self._job.message = line
                return

    @staticmethod
    def _now_text() -> str:
        return datetime.now(TAIPEI_TZ).strftime("%Y-%m-%d %H:%M:%S")
