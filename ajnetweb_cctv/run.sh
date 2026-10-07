#!/usr/bin/with-contenv bashio
# ==============================================================================
# AJ Netweb CCTV & NVR Studio Add-on
# Starts the camera streamer, PTZ controller, and NVR playback engine
# ==============================================================================

set -e

bashio::log.info "Starting AJ Netweb CCTV & NVR Studio..."

# Export configuration options for the Python server
export NVR_BRAND="$(bashio::config 'nvr_brand' 'auto')"
export NVR_HOST="$(bashio::config 'host' '')"
export NVR_HTTP_PORT="$(bashio::config 'http_port' '80')"
export NVR_RTSP_PORT="$(bashio::config 'rtsp_port' '554')"
export NVR_USERNAME="$(bashio::config 'username' 'admin')"
export NVR_PASSWORD="$(bashio::config 'password' '')"
export STREAM_QUALITY="$(bashio::config 'stream_quality' 'sub')"
export REFRESH_INTERVAL="$(bashio::config 'refresh_interval_sec' '2')"
export LOG_LEVEL="$(bashio::config 'log_level' 'info')"
export INGRESS_PORT="8098"

bashio::log.info "Target NVR Host: ${NVR_HOST:-'(Not configured yet - configure via UI or Add-on Options)'}"
bashio::log.info "Brand: ${NVR_BRAND}, Stream Quality: ${STREAM_QUALITY}"

exec python3 /app/server.py
