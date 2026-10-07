#!/usr/bin/with-contenv bashio
# ==============================================================================
# AJ Netweb Room & Guest Pass Studio Add-on
# Starts the room permission engine, guest pass token manager, and Ingress interface
# ==============================================================================

set -e

bashio::log.info "Starting AJ Netweb Room & Guest Pass Studio..."

export DEFAULT_PASS_HOURS="$(bashio::config 'default_pass_hours' '24')"
export ALLOW_GUEST_CLIMATE="$(bashio::config 'allow_guest_climate' 'true')"
export ALLOW_GUEST_LIGHTS="$(bashio::config 'allow_guest_lights' 'true')"
export ALLOW_GUEST_COVERS="$(bashio::config 'allow_guest_covers' 'true')"
export ALLOW_GUEST_LOCKS="$(bashio::config 'allow_guest_locks' 'false')"
export AUTO_PRUNE="$(bashio::config 'auto_prune_expired' 'true')"
export LOG_LEVEL="$(bashio::config 'log_level' 'info')"
export INGRESS_PORT="8096"

bashio::log.info "Starting Room & Guest Pass Studio on Ingress port 8096..."

exec python3 /app/server.py
