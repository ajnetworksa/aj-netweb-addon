#!/usr/bin/env bash
##
## restore-commissioning.sh
##
## Restores Matterbridge commissioning data from /data/commissioning_backup.tar.gz
## Called automatically on startup if the backup file exists.
## Can also be run manually via HA Terminal or SSH.
##

set -euo pipefail

BACKUP_FILE="/data/commissioning_backup.tar.gz"
RESTORE_DIR="/data/matterbridge"

if [ ! -f "${BACKUP_FILE}" ]; then
    echo "[restore] No backup file found at ${BACKUP_FILE}"
    echo "[restore] If this is a fresh install, pair Alexa from the Web UI"
    exit 0
fi

echo "[restore] Restoring commissioning data from ${BACKUP_FILE}..."

mkdir -p "${RESTORE_DIR}"

# Only restore if the target doesn't already have data
# (prevent overwriting a working setup on normal restarts)
if [ -d "${RESTORE_DIR}/AlexaBridge" ]; then
    echo "[restore] AlexaBridge data already exists — skipping restore"
    echo "[restore] To force restore, delete /data/matterbridge/AlexaBridge and restart"
    exit 0
fi

tar -xzf "${BACKUP_FILE}" -C "${RESTORE_DIR}"

echo "[restore] ✓ Commissioning data restored"
echo "[restore] Alexa devices should reconnect automatically within 30 seconds"
