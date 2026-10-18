#!/usr/bin/with-contenv bashio
# AJ Netweb Prayer & Adhan
set -e
bashio::log.info "Starting AJ Netweb Prayer & Adhan $(bashio::addon.version)..."
export INGRESS_PORT="8093"
exec python3 /app/server.py
