#!/usr/bin/env bash
##
## backup-commissioning.sh
##
## Backs up Matterbridge commissioning data to /data/commissioning_backup.tar.gz
## Commissioning data = the cryptographic pairing with Alexa.
## If HA is re-installed without this backup, you must re-pair Alexa from scratch.
##

set -euo pipefail

PROFILE_DIR="/data/matterbridge/AlexaBridge"
BACKUP_FILE="/data/commissioning_backup.tar.gz"
BACKUP_META="/data/commissioning_backup.json"
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

# Check if there's anything to back up
if [ ! -d "${PROFILE_DIR}" ]; then
    echo "[backup] No commissioning data yet — nothing to back up"
    exit 0
fi

# Create the backup
echo "[backup] Backing up commissioning data at ${TIMESTAMP}..."
tar -czf "${BACKUP_FILE}" \
    -C "/data/matterbridge" \
    "AlexaBridge" \
    2>/dev/null

# Write metadata
cat > "${BACKUP_META}" << EOF
{
  "created_at": "${TIMESTAMP}",
  "backup_file": "${BACKUP_FILE}",
  "description": "Matterbridge AlexaBridge commissioning data",
  "restore_instructions": "Run restore-commissioning.sh or restart the add-on with the backup in place"
}
EOF

echo "[backup] ✓ Commissioning backup complete → ${BACKUP_FILE}"
