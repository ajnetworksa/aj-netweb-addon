#!/usr/bin/with-contenv bashio
# ==============================================================================
# AJ Netweb Dashboard Suite Add-on
# Automated Room-Aware Lovelace Dashboard Generator & Card Suite
# ==============================================================================

set -e

bashio::log.info "Starting AJ Netweb Dashboard Suite..."

export DEFAULT_THEME="$(bashio::config 'default_theme' 'cyber_luxury')"
export DASHBOARD_URL="$(bashio::config 'dashboard_url' 'ajnetweb')"
export DASHBOARD_TITLE="$(bashio::config 'dashboard_title' 'AJ Netweb Smart Home')"
export AUTO_REGISTER_RESOURCES="$(bashio::config 'auto_register_resources' 'true')"
export INGRESS_PORT="8099"

bashio::log.info "Launching Dashboard Studio on Ingress port 8099..."

exec python3 /app/server.py
