#!/usr/bin/env bash
##
## backup-commissioning.sh
## Saves the Matter pairing (fabrics, node ids, keys) and plugin config to
## /share/alexa_bridge/ so a re-installed add-on can rejoin Alexa without re-pairing.
## (HA backups already include /data; /share survives uninstalling the add-on.)
##
set -euo pipefail

MB_DIR="/data/.matterbridge"
OUT_DIR="/share/alexa_bridge"
BACKUP_FILE="${OUT_DIR}/commissioning_backup.tar.gz"
META_FILE="${OUT_DIR}/commissioning_backup.json"

if [ ! -d "${MB_DIR}/matterstorage" ]; then
    echo "[backup] nothing to back up yet (bridge never started)"
    exit 0
fi

mkdir -p "${OUT_DIR}"
ITEMS=(.matterbridge/matterstorage .matterbridge/storage)
[ -f "${MB_DIR}/matterbridge-hass.config.json" ] && ITEMS+=(.matterbridge/matterbridge-hass.config.json)
TMP="${BACKUP_FILE}.tmp"
tar -czf "${TMP}" -C /data "${ITEMS[@]}"
mv "${TMP}" "${BACKUP_FILE}"
chmod 600 "${BACKUP_FILE}"
jq -n --arg t "$(date -u +%Y-%m-%dT%H:%M:%SZ)" --arg f "${BACKUP_FILE}" \
    --argjson s "$(stat -c %s "${BACKUP_FILE}")" \
    '{created_at: $t, file: $f, size: $s}' > "${META_FILE}"
echo "[backup] saved ${BACKUP_FILE}"
