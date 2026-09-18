# Linux systemd deployment

`sn_generator` writes history, print notices, KOYA/NYX models, and monthly
references to SQLite.  Do not keep that database inside the application
checkout: uploading a release as `root` can replace it with a read-only file and
make Uvicorn fail during startup.

The provided drop-in uses systemd's `StateDirectory` support.  The database is
stored at `/var/lib/sn_generator/sn_generator.db`, and systemd gives the
directory to the `User`/`Group` declared by the existing
`sn_generator.service` unit.

網頁啟動的出貨更新預設將每次總表更新記錄到 `/opt/sn_generator/shipment_merge.log`。請確保 systemd 的服務帳號可寫入該檔案；特殊部署或測試可用 `SHIPMENT_LOG_FILE` 覆寫路徑。

Run the repair after copying this project to the Linux server:

```bash
cd /path/to/Serializing
chmod +x deploy/systemd/repair-sn-generator-db.sh
sudo deploy/systemd/repair-sn-generator-db.sh /path/to/current/sn_generator.db
```

Pass the database currently used by the service so history and maintenance data
are preserved.  To deliberately start with a new database, omit the final path.
If the target database already exists, the script creates a timestamped backup
before replacing it.

Verify both the application and reverse proxy after the script completes:

```bash
systemctl is-active sn_generator
journalctl -u sn_generator -n 100 --no-pager
curl -i http://127.0.0.1:8082/api/health
curl -i http://127.0.0.1:8082/api/monthly-reference/koya
```
