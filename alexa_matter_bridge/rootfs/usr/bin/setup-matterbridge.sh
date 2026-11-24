#!/usr/bin/env bash
##
## setup-matterbridge.sh
## Generates Matterbridge & matterbridge-hass configs
##

set -euo pipefail

OPTIONS="/data/options.json"

# Read options
if [ -f "${OPTIONS}" ]; then
    MATTER_PORT=$(jq -r '.matter_port // 5540' "${OPTIONS}")
    LOG_LEVEL=$(jq -r '.log_level // "info"' "${OPTIONS}")
    EXPOSE_LABEL=$(jq -r '.auto_expose_label // ""' "${OPTIONS}")
    HA_URL=$(jq -r '.ha_url // "ws://127.0.0.1:8123"' "${OPTIONS}")
else
    MATTER_PORT=5540
    LOG_LEVEL="info"
    EXPOSE_LABEL=""
    HA_URL="ws://127.0.0.1:8123"
fi

# Ensure HA_URL uses WebSocket protocol (ws:// or wss://)
HA_URL=$(echo "${HA_URL}" | sed -e 's|^http://|ws://|' -e 's|^https://|wss://|')
if [[ ! "${HA_URL}" =~ ^wss?:// ]]; then
    HA_URL="ws://${HA_URL}"
fi

# Resolve Home Assistant Long-Lived Access Token
echo "[setup] Resolving Home Assistant authentication token..."
TOKEN=$(python3 /usr/bin/resolve-ha-token.py 2>/dev/null || echo "")

if [ -n "${TOKEN}" ]; then
    echo "[setup] ✓ Valid Home Assistant Long-Lived Access Token acquired!"
else
    echo "[setup] ⚠ Warning: Could not resolve HA token automatically. Check /config/.storage/auth or set ha_token in add-on options."
fi

# Build unique serial based on host
SERIAL="AMB-$(hostname | md5sum | cut -c1-8 2>/dev/null || echo 'default')"

# Build filter JSON fragment
FILTER_CONFIG=""
if [ -n "${EXPOSE_LABEL}" ] && [ "${EXPOSE_LABEL}" != "null" ]; then
    echo "[setup] Filtering entities by label: ${EXPOSE_LABEL}"
    FILTER_CONFIG="\"filterByLabel\": \"${EXPOSE_LABEL}\","
else
    echo "[setup] No label filter specified — exposing all supported Home Assistant entities to Alexa."
fi

# Target directory: standard Matterbridge storage path ($HOME/.matterbridge)
MB_DIR="/data/.matterbridge"
mkdir -p "${MB_DIR}"

CONFIG_FILE="${MB_DIR}/matterbridge.json"
cat > "${CONFIG_FILE}" << EOF
{
  "name": "Matterbridge",
  "username": "Alexa-HA-Bridge",
  "port": ${MATTER_PORT:-5540},
  "passcode": 20202021,
  "discriminator": 3840,
  "vendorId": 65521,
  "vendorName": "AJ Network Solutions",
  "productId": 32769,
  "productName": "Alexa Matter Bridge",
  "serialNumber": "${SERIAL}",
  "logLevel": "${LOG_LEVEL:-info}",
  "matterLogLevel": "warn",
  "plugins": [
    "matterbridge-hass"
  ]
}
EOF

PLUGIN_CONFIG_FILE="${MB_DIR}/matterbridge-hass.config.json"
cat > "${PLUGIN_CONFIG_FILE}" << EOF
{
  "name": "matterbridge-hass",
  "type": "DynamicPlatform",
  "host": "${HA_URL}",
  "token": "${TOKEN}",
  "reconnectInterval": 30000,
  "requestTimeout": 60000,
  ${FILTER_CONFIG}
  "whiteList": [],
  "blackList": [],
  "deviceEntityBlackList": [],
  "entityBlackList": [
    "automation.*",
    "scene.*",
    "script.*",
    "group.*",
    "device_tracker.*",
    "person.*",
    "zone.*",
    "timer.*",
    "input_boolean.*",
    "input_number.*",
    "input_select.*",
    "input_text.*",
    "input_datetime.*",
    "counter.*"
  ]
}
EOF

echo "[setup] Configuration written to ${MB_DIR} ✓"
