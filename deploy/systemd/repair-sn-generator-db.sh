#!/usr/bin/env bash
set -euo pipefail

service_name="sn_generator.service"
state_dir="/var/lib/sn_generator"
target_db="${state_dir}/sn_generator.db"
source_db="${1:-}"
script_dir="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
drop_in_source="${script_dir}/database.conf"
drop_in_dir="/etc/systemd/system/${service_name}.d"

if [[ "${EUID}" -ne 0 ]]; then
  echo "請以 root 執行：sudo $0 [現有 sn_generator.db 路徑]" >&2
  exit 1
fi

if ! systemctl cat "${service_name}" >/dev/null 2>&1; then
  echo "找不到 ${service_name}，未修改系統。" >&2
  exit 1
fi

service_user="$(systemctl show "${service_name}" --property=User --value)"
service_group="$(systemctl show "${service_name}" --property=Group --value)"
service_user="${service_user:-root}"
service_group="${service_group:-${service_user}}"

if [[ -n "${source_db}" && ! -f "${source_db}" ]]; then
  echo "找不到現有資料庫：${source_db}" >&2
  exit 1
fi

systemctl stop "${service_name}"
install -d -m 0750 -o "${service_user}" -g "${service_group}" "${state_dir}"

if [[ -n "${source_db}" ]]; then
  if [[ -e "${target_db}" && ! "${source_db}" -ef "${target_db}" ]]; then
    backup_path="${target_db}.bak.$(date +%Y%m%d%H%M%S)"
    cp --preserve=mode,timestamps -- "${target_db}" "${backup_path}"
    chown "${service_user}:${service_group}" "${backup_path}"
    echo "已備份原目標資料庫：${backup_path}"
  fi
  if [[ ! "${source_db}" -ef "${target_db}" ]]; then
    install -m 0640 -o "${service_user}" -g "${service_group}" "${source_db}" "${target_db}"
  fi
elif [[ ! -e "${target_db}" ]]; then
  install -m 0640 -o "${service_user}" -g "${service_group}" /dev/null "${target_db}"
fi

chown "${service_user}:${service_group}" "${target_db}"
chmod 0640 "${target_db}"
install -d -m 0755 "${drop_in_dir}"
install -m 0644 "${drop_in_source}" "${drop_in_dir}/database.conf"

systemctl daemon-reload
systemctl reset-failed "${service_name}"
systemctl start "${service_name}"

echo "SQLite 已設為 ${target_db}（${service_user}:${service_group}）。"
systemctl --no-pager --full status "${service_name}"

