#!/usr/bin/env bash
##
## entity-manager.sh
##
## CLI tool to add/remove the 'alexa' label on HA entities via the REST API.
## Usage:
##   entity-manager.sh add    light.living_room
##   entity-manager.sh remove light.living_room
##   entity-manager.sh list
##

set -euo pipefail

ACTION="${1:-list}"
ENTITY_ID="${2:-}"
HA_URL="http://${HA_HOST:-homeassistant}:${HA_PORT:-8123}"
TOKEN="${ADDON_TOKEN}"
LABEL="${EXPOSE_LABEL:-alexa}"

call_ha() {
    curl -sf \
        -H "Authorization: Bearer ${TOKEN}" \
        -H "Content-Type: application/json" \
        "$@"
}

case "${ACTION}" in
    list)
        echo "=== Entities exposed to Alexa (label: ${LABEL}) ==="
        call_ha "${HA_URL}/api/states" | \
            jq -r --arg label "${LABEL}" \
            '.[] | select(.attributes.labels? and (.attributes.labels | index($label))) | "\(.entity_id) [\(.state)]"' \
            2>/dev/null || \
            echo "  (none found or labels not indexed in API)"
        ;;
    add)
        if [ -z "${ENTITY_ID}" ]; then
            echo "Usage: entity-manager.sh add <entity_id>"
            exit 1
        fi
        echo "Adding label '${LABEL}' to ${ENTITY_ID}..."
        # Use HA Label Registry API (HA 2024.4+)
        call_ha -X POST \
            "${HA_URL}/api/config/label_registry/add_entity" \
            -d "{\"entity_id\": \"${ENTITY_ID}\", \"label\": \"${LABEL}\"}" && \
            echo "✓ Done. Entity will appear in Alexa within ~30 seconds." || \
            echo "✗ Failed. Check that entity_id is correct."
        ;;
    remove)
        if [ -z "${ENTITY_ID}" ]; then
            echo "Usage: entity-manager.sh remove <entity_id>"
            exit 1
        fi
        echo "Removing label '${LABEL}' from ${ENTITY_ID}..."
        call_ha -X POST \
            "${HA_URL}/api/config/label_registry/remove_entity" \
            -d "{\"entity_id\": \"${ENTITY_ID}\", \"label\": \"${LABEL}\"}" && \
            echo "✓ Done." || \
            echo "✗ Failed."
        ;;
    *)
        echo "Usage: entity-manager.sh [list|add|remove] [entity_id]"
        exit 1
        ;;
esac
