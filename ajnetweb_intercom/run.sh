#!/usr/bin/with-contenv bashio
# ==============================================================================
# AJ Netweb Intercom & Door Station Studio Add-on
# Starts the door controller, live listener, and Ingress interface
# ==============================================================================

set -e

bashio::log.info "Starting AJ Netweb Intercom & Door Station Studio..."

export INTERCOM_BRAND="$(bashio::config 'brand' 'auto')"
export INTERCOM_HOST="$(bashio::config 'host' '')"
export INTERCOM_HTTP_PORT="$(bashio::config 'http_port' '80')"
export INTERCOM_RTSP_PORT="$(bashio::config 'rtsp_port' '554')"
export INTERCOM_USERNAME="$(bashio::config 'username' 'admin')"
export INTERCOM_PASSWORD="$(bashio::config 'password' '')"
export DOOR_1_NAME="$(bashio::config 'door_1_name' 'Main Gate')"
export DOOR_2_NAME="$(bashio::config 'door_2_name' 'Pedestrian Door')"
export UNLOCK_DURATION="$(bashio::config 'unlock_duration_sec' '3')"
export AUTO_SNAPSHOT="$(bashio::config 'auto_snapshot_on_ring' 'true')"
export HA_NOTIFY="$(bashio::config 'ha_notify_on_ring' 'true')"
export PUSH_NOTIFY_MODE="$(bashio::config 'push_notify_mode' 'all_mobile_devices')"
export CRITICAL_PUSH_SOUND="$(bashio::config 'critical_push_sound' 'true')"
export LOG_LEVEL="$(bashio::config 'log_level' 'info')"
export INGRESS_PORT="8097"

bashio::log.info "Target Door Station: ${INTERCOM_HOST:-'(Not configured yet - open Web UI to connect)'}"
bashio::log.info "Brand: ${INTERCOM_BRAND}, Door 1: ${DOOR_1_NAME}, Door 2: ${DOOR_2_NAME}"

exec python3 /app/server.py
