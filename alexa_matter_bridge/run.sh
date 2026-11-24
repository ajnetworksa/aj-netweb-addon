#!/usr/bin/env bash
##
## run.sh - Alexa Matter Bridge entrypoint
##
## Layout (all persistent, inside the add-on /data volume):
##   /data/.matterbridge/                         Matterbridge storage + pairing (fabrics)
##   /data/.matterbridge/matterbridge-hass.config.json   plugin config (written here)
##   /data/Matterbridge/                          Matterbridge plugin folder
##

set -euo pipefail

export HOME="/data"
MB_DIR="/data/.matterbridge"
PLUGIN_CONFIG="${MB_DIR}/matterbridge-hass.config.json"
mkdir -p "${MB_DIR}" /data/Matterbridge

OPTIONS="/data/options.json"
opt() { jq -r "$1" "${OPTIONS}" 2>/dev/null || echo "$2"; }

MATTER_PORT="$(opt '.matter_port // 5540' 5540)"
LOG_LEVEL="$(opt '.log_level // "info"' info)"
EXPOSE_LABEL="$(opt '.auto_expose_label // "alexa"' alexa)"
BACKUP_ENABLED="$(opt '.backup_commissioning // true' true)"
# "automation." -> "automation" (plugin expects domain names). The untouched pre-1.2 default list also
# blocked scripts, scenes and input helpers; only labelled entities are exposed anyway, and voice commands
# (house modes, scenes, adhan) need them, so that exact list no longer blocks them (voice.py does the same).
BLACKLIST_JSON="$(jq -c '
  [(.excluded_entity_prefixes // [])[] | rtrimstr(".")] as $b
  | if ($b | sort) == (["automation","scene","script","group","device_tracker","person","zone","timer",
                        "input_boolean","input_number","input_select","input_text","input_datetime","counter"] | sort)
    then $b - ["script","scene","input_boolean","input_button"] else $b end' "${OPTIONS}" 2>/dev/null || echo '[]')"

if [ -z "${SUPERVISOR_TOKEN:-}" ]; then
    echo "[fatal] SUPERVISOR_TOKEN is missing - homeassistant_api must be enabled"
    exit 1
fi

echo "========================================"
echo "  Alexa Matter Bridge"
echo "  Matterbridge $(jq -r .version "$(npm root -g)/matterbridge/package.json")"
echo "  matterbridge-hass $(jq -r .version "$(npm root -g)/matterbridge-hass/package.json")"
echo "  Matter port : ${MATTER_PORT}   Label : ${EXPOSE_LABEL}"
echo "========================================"

export MATTER_PORT LOG_LEVEL EXPOSE_LABEL MB_DIR

# ── Restore pairing after a reinstall (backup lives in /share) ────────────────
/usr/bin/restore-commissioning.sh || echo "[restore] failed - pair Alexa again if needed"

# ── Plugin config: keep installer edits from the Matterbridge UI, force the
#    connection + filter settings this add-on manages ──────────────────────────
BASE='{"name":"matterbridge-hass","type":"DynamicPlatform","splitNameStrategy":"Entity name","controllerStrategy":"Merge","reconnectTimeout":60,"reconnectRetries":100000,"discardHiddenEntities":true,"whiteList":[],"blackList":[],"splitEntities":[],"deviceEntityBlackList":{},"entityWhiteList":[]}'
CURRENT="$(cat "${PLUGIN_CONFIG}" 2>/dev/null || echo '{}')"
echo "${CURRENT}" | jq -e . >/dev/null 2>&1 || CURRENT='{}'
jq -n \
    --argjson base "${BASE}" \
    --argjson cur "${CURRENT}" \
    --arg token "${SUPERVISOR_TOKEN}" \
    --arg label "${EXPOSE_LABEL}" \
    --argjson black "${BLACKLIST_JSON}" \
    '$base + $cur + {
        host: "ws://supervisor/core",
        token: $token,
        rejectUnauthorized: true,
        filterByLabel: $label,
        entityBlackList: $black
     }' > "${PLUGIN_CONFIG}.tmp"
mv "${PLUGIN_CONFIG}.tmp" "${PLUGIN_CONFIG}"
chmod 600 "${PLUGIN_CONFIG}"
echo "[setup] plugin config written -> ${PLUGIN_CONFIG}"

# ── Register the plugin once (idempotent) ─────────────────────────────────────
echo "[setup] registering matterbridge-hass plugin (no-op when already registered)"
matterbridge -add matterbridge-hass -homedir /data >/dev/null 2>&1 || true

# ── Periodic pairing backup ───────────────────────────────────────────────────
if [ "${BACKUP_ENABLED}" = "true" ]; then
    ( sleep 300; while true; do /usr/bin/backup-commissioning.sh >/dev/null 2>&1 || true; sleep 21600; done ) &
fi

# ── Status UI (ingress only) ──────────────────────────────────────────────────
python3 /usr/share/alexa-bridge-ui/server.py --port 8285 --label "${EXPOSE_LABEL}" &

# ── Matterbridge (foreground). -filelogger lets the UI show pairing codes. ────
echo "[start] Matterbridge bridge mode, frontend on :8283"
exec matterbridge \
    -bridge \
    -homedir /data \
    -port "${MATTER_PORT}" \
    -logger "${LOG_LEVEL}" \
    -filelogger \
    -frontend 8283
