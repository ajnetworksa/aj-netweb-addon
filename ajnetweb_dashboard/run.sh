#!/usr/bin/with-contenv bashio
# ==============================================================================
# AJ Netweb Dashboard Suite Add-on
# Automated Room-Aware Lovelace Dashboard Generator & Card Suite
# ==============================================================================

set -e

bashio::log.info "Starting AJ Netweb Dashboard Suite..."

export DEFAULT_THEME="$(bashio::config 'default_theme' 'apple_frosted_glass')"
export DASHBOARD_URL="$(bashio::config 'dashboard_url' 'ajnetweb-home')"
export DASHBOARD_TITLE="$(bashio::config 'dashboard_title' 'Smart Home')"
export AUTO_REGISTER_RESOURCES="$(bashio::config 'auto_register_resources' 'true')"
export INGRESS_PORT="8099"
export ADDON_VERSION="$(bashio::addon.version)"

bashio::log.info "Launching Dashboard Studio ${ADDON_VERSION} on ingress port 8099..."

exec python3 /app/server.py
