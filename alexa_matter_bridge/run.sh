#!/usr/bin/env bash
##
## run.sh — Alexa Matter Bridge entrypoint
##

# Ensure sudo is available for child processes
if ! command -v sudo >/dev/null 2>&1; then
    printf '#!/bin/sh\nexec "$@"\n' > /usr/bin/sudo 2>/dev/null || true
    chmod +x /usr/bin/sudo 2>/dev/null || true
    ln -sf /usr/bin/sudo /bin/sudo 2>/dev/null || true
fi

export HOME="/data"
mkdir -p /data/.matterbridge
rm -rf /data/Matterbridge 2>/dev/null || true

echo "========================================"
echo "  Alexa Matter Bridge v1.1.1 Starting"
echo "  Storage Path: /data/.matterbridge"
echo "========================================"

OPTIONS="/data/options.json"

if [ -f "${OPTIONS}" ]; then
    MATTER_PORT=$(jq -r '.matter_port // 5540'             "${OPTIONS}")
    LOG_LEVEL=$(jq   -r '.log_level // "info"'             "${OPTIONS}")
    EXPOSE_LABEL=$(jq -r '.auto_expose_label // ""'        "${OPTIONS}")
    BACKUP_ENABLED=$(jq -r '.backup_commissioning // true' "${OPTIONS}")
else
    MATTER_PORT=5540
    LOG_LEVEL="info"
    EXPOSE_LABEL=""
    BACKUP_ENABLED=true
fi

echo "Matter port  : ${MATTER_PORT}"
echo "Log level    : ${LOG_LEVEL}"
echo "Expose label : ${EXPOSE_LABEL:-'(all supported entities)'}"
echo "Backup       : ${BACKUP_ENABLED}"

# Ensure scripts have execute permissions
chmod +x /usr/bin/*.sh /usr/bin/*.py /usr/bin/sudo 2>/dev/null || true

# Start dbus & avahi mDNS daemon for Matter discovery
echo "Starting dbus & avahi mDNS daemon..."
mkdir -p /var/run/dbus /run/dbus /var/run/avahi-daemon
dbus-uuidgen --ensure 2>/dev/null || true
dbus-daemon --system --fork 2>/dev/null || true
sleep 1
avahi-daemon --daemonize --no-chroot 2>/dev/null && \
    echo "avahi mDNS started ✓" || \
    echo "avahi notice: proceeding with standard IPv6/IPv4 Matter discovery"

# Restore commissioning backup if available and not present
if [ -f /data/commissioning_backup.tar.gz ] && \
   [ ! -d /data/.matterbridge/matterstorage ]; then
    echo "Restoring commissioning backup..."
    /usr/bin/restore-commissioning.sh && \
        echo "Commissioning restored ✓" || \
        echo "Restore skipped — starting fresh commissioning"
fi

# Generate Matterbridge configurations with auto-resolved HA token
echo "Generating Matterbridge configuration..."
/usr/bin/setup-matterbridge.sh

# Auto-backup loop
if [ "${BACKUP_ENABLED}" = "true" ]; then
    echo "Commissioning auto-backup scheduled (every 6h)"
    (
        while true; do
            sleep 21600
            /usr/bin/backup-commissioning.sh 2>/dev/null || true
        done
    ) &
fi

# Detect active physical network interface for Matter mDNS
MDNS_ARGS=""
for iface in end0 eth0 wlan0; do
    if ip link show "${iface}" >/dev/null 2>&1; then
        echo "Detected primary network interface: ${iface}"
        MDNS_ARGS="--mdnsinterface ${iface}"
        break
    fi
done

echo ""
echo "========================================"
echo "  Starting Matterbridge with Frontend..."
echo "  Matter port : ${MATTER_PORT}"
echo "  Frontend    : http://192.168.8.5:8283"
echo "========================================"

exec matterbridge \
    -bridge \
    -port "${MATTER_PORT}" \
    -logger "${LOG_LEVEL}" \
    --frontend 8283 \
    ${MDNS_ARGS}
