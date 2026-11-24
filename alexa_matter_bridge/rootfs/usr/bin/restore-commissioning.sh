#!/usr/bin/env bash
##
## restore-commissioning.sh
## On a fresh install (no Matter storage yet) restore the pairing from /share.
## Never overwrites an existing pairing unless called with --force.
##
set -euo pipefail

MB_DIR="/data/.matterbridge"
BACKUP_FILE="/share/alexa_bridge/commissioning_backup.tar.gz"

if [ ! -f "${BACKUP_FILE}" ]; then
    [ "${1:-}" = "--force" ] && { echo "[restore] no backup found"; exit 1; }
    exit 0
fi
if ! tar -tzf "${BACKUP_FILE}" 2>/dev/null | grep -q '^.matterbridge/matterstorage'; then
    echo "[restore] backup has no pairing data - ignored"
    exit 0
fi
if [ -d "${MB_DIR}/matterstorage" ] && [ "${1:-}" != "--force" ]; then
    exit 0
fi
if [ "${1:-}" = "--force" ]; then
    rm -rf "${MB_DIR}/matterstorage" "${MB_DIR}/storage"
fi
mkdir -p /data
tar -xzf "${BACKUP_FILE}" -C /data
echo "[restore] pairing restored from ${BACKUP_FILE}"
