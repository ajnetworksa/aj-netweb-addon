#!/usr/bin/with-contenv bashio
# shellcheck shell=bash
# =============================================================================
# AJ Netweb Remote Access — Home Assistant add-on agent
#
#   1. Activation: license key + locally generated key pair (CSR) -> client certificate,
#      tunnel credentials and TURN credentials. The private key never leaves /data.
#   2. Runs frpc (mTLS to the hub, pinned to the AJ Netweb root CA) and a tiny local nginx
#      that restores the visitor's real IP for Home Assistant.
#   3. Heartbeat every 60 s over mTLS: subscription status, automatic certificate renewal.
#
# Secrets hygiene: umask 077, no `set -x`, secrets are passed via files/env (never argv),
# responses containing secrets are never printed; only a 4-char license hint is logged.
# =============================================================================
set -o pipefail
umask 077

readonly DATA=/data/ajn
readonly NGX_CONF=/tmp/ajn-nginx.conf
readonly LOCAL_PORT=18123
readonly AGENT_VERSION="${AJN_AGENT_VERSION:-1.0.0}"
mkdir -p "${DATA}" && chmod 700 "${DATA}"
# Never act on a stale cached copy of the options (e.g. right after the license key was changed)
bashio::cache.flush_all 2>/dev/null || rm -rf /tmp/.bashio

LOG_LEVEL="$(bashio::config 'log_level' 'info')"
bashio::log.level "${LOG_LEVEL}"

SERVER="$(bashio::config 'server' "${AJN_SERVER}")"
LICENSE="$(bashio::config 'license_key' '')"
LICENSE="$(printf '%s' "${LICENSE}" | tr -d '[:space:]')"

# -------------------------------------------------------------- helpers
die_soft() {  # keep the add-on running (so the message stays visible) and retry later
    bashio::log.error "$*"
    sleep 300
}

license_fingerprint() {
    printf '%s' "${LICENSE}" | tr '[:lower:]' '[:upper:]' | tr -d '-' | sha256sum | cut -c1-64
}

state() { jq -r "$1" "${DATA}/state.json"; }

api_post() {  # api_post <path> <json-file> <out-file> [mtls]  -> prints HTTP status
    local path=$1 body=$2 out=$3 mtls=${4:-}
    local target="${SERVER}"
    local scheme="https"
    local insecure=""
    if [[ "${target}" =~ ^https?:// ]]; then
        scheme="${target%%://*}"
        target="${target#*://}"
    fi
    target="${target%/}"
    local host_only="${target%%:*}"
    # If connecting to an IP address or if HTTPS check fails on LAN, allow -k
    if [[ "${host_only}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        insecure="-k"
    fi
    local args=(-sS ${insecure} --max-time 30 --retry 2 --retry-delay 3 -o "${out}" -w '%{http_code}'
                -H 'Content-Type: application/json' --data "@${body}")
    if [[ -n "${mtls}" ]]; then
        args+=(--cert "${DATA}/client.crt" --key "${DATA}/client.key")
    fi
    local err_tmp="/tmp/ajn_curl_err"
    local raw_code
    raw_code="$(curl "${args[@]}" "${scheme}://${target}${path}" 2>"${err_tmp}" || true)"
    local code
    code="$(printf '%s' "${raw_code}" | tr -dc '0-9' | tail -c 3)"
    [[ -n "${code}" ]] || code="000"
    if [[ "${code}" == "000" ]]; then
        CURL_LAST_ERR="$(head -n 2 "${err_tmp}" 2>/dev/null | tr '\n' ' ')"
    fi
    rm -f "${err_tmp}"
    printf '%s' "${code}"
}


new_keypair_and_csr() {  # -> ${DATA}/client.key.new  ${DATA}/client.csr
    openssl ecparam -name prime256v1 -genkey -noout -out "${DATA}/client.key.new" 2>/dev/null
    openssl req -new -key "${DATA}/client.key.new" -subj "/CN=${INSTALL_ID}" -out "${DATA}/client.csr" 2>/dev/null
}

# -------------------------------------------------------------- identity of this HA instance
if [[ -r /homeassistant/.storage/core.uuid ]]; then
    INSTALL_ID="$(jq -r '.data.uuid // empty' /homeassistant/.storage/core.uuid 2>/dev/null)"
fi
[[ "${INSTALL_ID:-}" =~ ^[A-Za-z0-9-]{8,64}$ ]] || INSTALL_ID=""
if [[ -z "${INSTALL_ID:-}" ]]; then
    [[ -s "${DATA}/install_id" ]] || cat /proc/sys/kernel/random/uuid > "${DATA}/install_id"
    INSTALL_ID="$(cat "${DATA}/install_id")"
fi
HA_VERSION="$(bashio::core.version 2>/dev/null || echo unknown)"
HA_PORT="$(bashio::core.port 2>/dev/null || echo 8123)"
[[ "${HA_PORT}" =~ ^[0-9]+$ ]] || HA_PORT=8123
if [[ "$(bashio::core.ssl 2>/dev/null)" == "true" ]]; then HA_SCHEME=https; else HA_SCHEME=http; fi

# -------------------------------------------------------------- activation
enroll() {
    if [[ -z "${LICENSE}" ]]; then
        die_soft "No license key configured. Open the add-on Configuration tab, enter your AJ Netweb license key and restart."
        return 1
    fi
    bashio::log.info "Activating with license …${LICENSE: -4} (Home Assistant ${HA_VERSION})"
    new_keypair_and_csr

    LK="${LICENSE}" IID="${INSTALL_ID}" AV="${AGENT_VERSION}" HV="${HA_VERSION}" \
        jq -n --rawfile csr "${DATA}/client.csr" \
        '{license_key: env.LK, install_id: env.IID, csr_pem: $csr, agent_version: env.AV, ha_version: env.HV}' \
        > "${DATA}/enroll.req"
    local code
    code="$(api_post /api/v1/agent/enroll "${DATA}/enroll.req" "${DATA}/enroll.resp")"
    rm -f "${DATA}/enroll.req" "${DATA}/client.csr"

    case "${code}" in
        200) ;;
        402) rm -f "${DATA}/enroll.resp"; die_soft "Subscription inactive. Please contact AJ Netweb support."; return 1 ;;
        403) rm -f "${DATA}/enroll.resp"; die_soft "License key was rejected (invalid or revoked). Check the key and restart the add-on."; return 1 ;;
        409) rm -f "${DATA}/enroll.resp"; die_soft "This license is already bound to another Home Assistant. Ask AJ Netweb support to reset the binding."; return 1 ;;
        429) rm -f "${DATA}/enroll.resp"; bashio::log.warning "Too many activation attempts; retrying in 10 minutes"; sleep 600; return 1 ;;
        000) rm -f "${DATA}/enroll.resp"; bashio::log.warning "Cannot reach ${SERVER}${CURL_LAST_ERR:+: ${CURL_LAST_ERR}}; retrying in 60 s"; sleep 60; return 1 ;;
        *)   bashio::log.warning "Activation failed (HTTP ${code}): $(jq -r '.detail // "unknown error"' "${DATA}/enroll.resp" 2>/dev/null)"
             rm -f "${DATA}/enroll.resp"; sleep 60; return 1 ;;
    esac

    local r="${DATA}/enroll.resp"
    jq -r '.client_cert_pem' "${r}" > "${DATA}/client.crt"
    jq -r '.ca_pem' "${r}" > "${DATA}/ca.crt"
    mv -f "${DATA}/client.key.new" "${DATA}/client.key"
    # state.json keeps tunnel + TURN credentials (0600, never logged)
    jq '{tenant_id, instance_uid, site_name, subdomain, public_url, cert_not_after, tunnel, turn, heartbeat_interval}' "${r}" > "${DATA}/state.json"
    rm -f "${r}"
    license_fingerprint > "${DATA}/license.sha256"
    bashio::log.info "Activated. Instance ID: $(state .instance_uid)  Remote address: $(state .public_url)"
    return 0
}

# Every server-supplied value that ends up in frpc.toml / web_rtc.yaml must match a strict pattern, so even a
# compromised or impersonated API could not inject extra frpc proxies or YAML (defence in depth).
state_valid() {
    jq -e '
      def s(re): type == "string" and test(re);
      (.subdomain | s("^[a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?$")) and
      (.public_url | s("^https://[a-z0-9.-]+(:[0-9]{1,5})?/?$")) and
      (.tunnel.server_addr | s("^[A-Za-z0-9.-]{1,253}$")) and
      (.tunnel.server_name | s("^[A-Za-z0-9.-]{1,253}$")) and
      ((.tunnel.server_port | tostring) | test("^[0-9]{1,5}$")) and
      (.tunnel.user | s("^[A-Za-z0-9_.-]{1,64}$")) and
      (.tunnel.token | s("^[A-Za-z0-9_+/=.-]{8,256}$")) and
      (.tunnel.platform_token | s("^[A-Za-z0-9_+/=.-]{8,256}$")) and
      ((.turn // null) == null or (
        (.turn.username | s("^[A-Za-z0-9_.:@-]{1,128}$")) and
        (.turn.credential | s("^[A-Za-z0-9_+/=.-]{8,256}$")) and
        ((.turn.urls // []) | all(s("^turns?:[A-Za-z0-9.-]+(:[0-9]{1,5})?([?]transport=(udp|tcp))?$")))))
    ' "${DATA}/state.json" >/dev/null 2>&1
}

enrolled() {
    [[ -s "${DATA}/client.crt" && -s "${DATA}/client.key" && -s "${DATA}/state.json" ]] || return 1
    if ! state_valid; then
        bashio::log.error "Received tunnel settings failed validation - discarding them and re-activating"
        rm -f "${DATA}/state.json" "${DATA}/client.crt"
        sleep 60
        return 1
    fi
    # A different key in the config means the customer wants to re-activate.
    if [[ -n "${LICENSE}" && -s "${DATA}/license.sha256" && "$(license_fingerprint)" != "$(cat "${DATA}/license.sha256")" ]]; then
        bashio::log.info "License key changed - re-activating"
        return 1
    fi
    openssl x509 -checkend 3600 -noout -in "${DATA}/client.crt" >/dev/null 2>&1 || {
        bashio::log.warning "Client certificate expired - re-activating"; return 1; }
    return 0
}

# -------------------------------------------------------------- config rendering
render_frpc() {
    local f="${DATA}/frpc.toml"
    local addr port sni user token ptoken sub
    addr="$(state .tunnel.server_addr)"; port="$(state .tunnel.server_port)"; sni="$(state .tunnel.server_name)"
    user="$(state .tunnel.user)"; token="$(state .tunnel.token)"; ptoken="$(state .tunnel.platform_token)"
    sub="$(state .subdomain)"

    # If SERVER was configured as a direct LAN IP, route the tunnel TCP connection directly to it
    local target="${SERVER}"
    if [[ "${target}" =~ ^https?:// ]]; then
        target="${target#*://}"
    fi
    local host_only="${target%%:*}"
    if [[ "${host_only}" =~ ^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$ ]]; then
        bashio::log.info "Routing tunnel directly to LAN server IP: ${host_only}"
        addr="${host_only}"
    fi

    cat > "${f}" <<EOF
serverAddr = "${addr}"
serverPort = ${port}
user = "${user}"
loginFailExit = false

auth.method = "token"
auth.token = "${ptoken}"
metadatas.token = "${token}"
metadatas.install_id = "${INSTALL_ID}"

transport.protocol = "tcp"
transport.tcpMux = true
transport.poolCount = 2
transport.heartbeatInterval = 30
transport.heartbeatTimeout = 90
transport.dialServerTimeout = 10
transport.tls.enable = true
transport.tls.certFile = "${DATA}/client.crt"
transport.tls.keyFile = "${DATA}/client.key"
transport.tls.trustedCaFile = "${DATA}/ca.crt"
transport.tls.serverName = "${sni}"

log.to = "console"
log.level = "$( [[ "${LOG_LEVEL}" == debug ]] && echo debug || echo info )"
log.disablePrintColor = true

[[proxies]]
name = "home-assistant"
type = "http"
localIP = "127.0.0.1"
localPort = ${LOCAL_PORT}
subdomain = "${sub}"
EOF
    chmod 600 "${f}"
}

render_nginx() {
    local upstream="${HA_SCHEME}://homeassistant:${HA_PORT}"
    local ssl_opts=""
    [[ "${HA_SCHEME}" == https ]] && ssl_opts="proxy_ssl_verify off; proxy_ssl_server_name off;"
    cat > "${NGX_CONF}" <<EOF
worker_processes 1;
pid /tmp/ajn-nginx.pid;
error_log stderr warn;
daemon off;
events { worker_connections 1000; }
http {
    access_log off;
    server_tokens off;
    client_body_temp_path /tmp/ngx_body;
    proxy_temp_path /tmp/ngx_proxy;
    client_max_body_size 0;
    proxy_request_buffering off;
    map \$http_upgrade \$connection_upgrade { default upgrade; '' close; }
    # Sidebar page (Home Assistant ingress). Only the Supervisor's ingress proxy may connect.
    server {
        listen 8099;
        allow 172.30.32.2;
        deny all;
        root /usr/share/ajn/www;
        location = /status.json { alias /tmp/ajn-www/status.json; add_header Cache-Control "no-store"; }
        location / { try_files \$uri /index.html; }
    }
    server {
        listen 127.0.0.1:${LOCAL_PORT};
        location / {
            proxy_pass ${upstream};
            ${ssl_opts}
            proxy_http_version 1.1;
            proxy_set_header Host \$host;
            proxy_set_header Upgrade \$http_upgrade;
            proxy_set_header Connection \$connection_upgrade;
            # The hub overwrote X-Real-IP with the true client address; frps appended itself to
            # X-Forwarded-For, so rebuild a clean single-hop header for Home Assistant.
            proxy_set_header X-Forwarded-For \$http_x_real_ip;
            proxy_set_header X-Forwarded-Proto https;
            proxy_set_header X-Forwarded-Host \$host;
            proxy_set_header X-Real-IP "";
            proxy_set_header X-Request-ID "";
            proxy_buffering off;
            proxy_read_timeout 86400s;
            proxy_send_timeout 86400s;
        }
    }
}
EOF
}

write_webrtc_config() {
    bashio::config.true 'manage_webrtc_config' || return 0
    [[ -s "${DATA}/state.json" ]] || return 0
    [[ -d /homeassistant ]] || return 0
    mkdir -p /homeassistant/ajnetweb
    local f=/homeassistant/ajnetweb/web_rtc.yaml tmp
    tmp="$(mktemp)"
    {
        echo "# Managed by the AJ Netweb add-on - do not edit (rewritten on activation)."
        echo "# Enable in configuration.yaml with:   web_rtc: !include ajnetweb/web_rtc.yaml"
        echo "ice_servers:"
        echo "  - url:"
        jq -r '.turn.urls[] | select(startswith("turn:")) | sub("^turn:"; "stun:") | sub("\\?.*$"; "")' "${DATA}/state.json" \
            | sort -u | sed 's/^/      - "/; s/$/"/'
        echo "  - url:"
        jq -r '.turn.urls[]' "${DATA}/state.json" | sed 's/^/      - "/; s/$/"/'
        echo "    username: \"$(state .turn.username)\""
        echo "    credential: \"$(state .turn.credential)\""
    } > "${tmp}"
    if ! cmp -s "${tmp}" "${f}"; then
        install -m 0600 "${tmp}" "${f}"
        bashio::log.info "WebRTC relay settings written to ajnetweb/web_rtc.yaml"
    fi
    rm -f "${tmp}"
    if [[ -z "${WEBRTC_WARNED:-}" ]] && ! grep -qs "ajnetweb/web_rtc.yaml" /homeassistant/configuration.yaml; then
        WEBRTC_WARNED=1
        bashio::log.warning "Add this line to configuration.yaml and restart Home Assistant so cameras/intercom work on mobile data:"
        bashio::log.warning "    web_rtc: !include ajnetweb/web_rtc.yaml"
    fi
}

check_reverse_proxy_config() {
    # HA answers 400 when it receives X-Forwarded-For from a proxy it does not trust.
    local code
    code="$(curl -sk -o /dev/null -w '%{http_code}' --max-time 10 -H 'X-Forwarded-For: 198.51.100.7' \
            "${HA_SCHEME}://homeassistant:${HA_PORT}/manifest.json" 2>/dev/null || echo 000)"
    if [[ "${code}" == "400" ]]; then
        bashio::log.warning "Home Assistant is not configured to trust this add-on as a reverse proxy."
        bashio::log.warning "Add to configuration.yaml and restart Home Assistant:"
        bashio::log.warning "  http:"
        bashio::log.warning "    use_x_forwarded_for: true"
        bashio::log.warning "    trusted_proxies:"
        bashio::log.warning "      - 172.30.33.0/24"
    elif [[ "${code}" == "200" ]]; then
        bashio::log.info "Home Assistant reverse-proxy settings OK (real visitor IPs will be shown)"
    fi
}

# -------------------------------------------------------------- certificate renewal
renew_cert() {
    bashio::log.info "Renewing client certificate"
    new_keypair_and_csr
    IID="${INSTALL_ID}" jq -n --rawfile csr "${DATA}/client.csr" '{install_id: env.IID, csr_pem: $csr}' > "${DATA}/renew.req"
    local code
    code="$(api_post /api/v1/agent/renew "${DATA}/renew.req" "${DATA}/renew.resp" mtls)"
    rm -f "${DATA}/renew.req" "${DATA}/client.csr"
    if [[ "${code}" == "200" ]]; then
        jq -r '.client_cert_pem' "${DATA}/renew.resp" > "${DATA}/client.crt.new"
        mv -f "${DATA}/client.key.new" "${DATA}/client.key"
        mv -f "${DATA}/client.crt.new" "${DATA}/client.crt"
        local tmp; tmp="$(mktemp)"; jq --arg na "$(jq -r .cert_not_after "${DATA}/renew.resp")" '.cert_not_after=$na' "${DATA}/state.json" > "${tmp}" \
            && mv -f "${tmp}" "${DATA}/state.json"
        bashio::log.info "Certificate renewed; reconnecting tunnel"
        pkill -x frpc || true
    else
        rm -f "${DATA}/client.key.new"
        bashio::log.warning "Certificate renewal failed (HTTP ${code}); will retry"
    fi
    rm -f "${DATA}/renew.resp"
}

# -------------------------------------------------------------- identity from the server
sync_identity() {  # keep instance id / site name in state.json in sync with the server
    local src=$1 uid name tmp
    uid="$(jq -r '.instance_uid // empty' "${src}")"
    name="$(jq -r '.site_name // empty' "${src}")"
    [[ -n "${uid}" ]] || return 0
    if [[ "${uid}" != "$(state '.instance_uid // empty')" || "${name}" != "$(state '.site_name // empty')" ]]; then
        tmp="$(mktemp)"
        jq --arg u "${uid}" --arg n "${name}" '.instance_uid=$u | .site_name=$n' "${DATA}/state.json" > "${tmp}" \
            && mv -f "${tmp}" "${DATA}/state.json"
        bashio::log.info "AJ Netweb instance ID: ${uid}"
    fi
}

# -------------------------------------------------------------- heartbeat
heartbeat_loop() {
    local interval started now code status up
    interval="$(state '.heartbeat_interval // 60')"
    started="$(date +%s)"
    while true; do
        sleep "${interval}"
        [[ -s "${DATA}/client.crt" ]] || continue
        now="$(date +%s)"
        up=false
        pgrep -x frpc >/dev/null && up=true
        IID="${INSTALL_ID}" AV="${AGENT_VERSION}" HV="${HA_VERSION}" UP="${up}" UT="$((now - started))" \
            jq -n '{install_id: env.IID, tunnel_up: (env.UP == "true"), agent_version: env.AV,
                    ha_version: env.HV, uptime: (env.UT | tonumber)}' > "${DATA}/hb.req"
        code="$(api_post /api/v1/agent/heartbeat "${DATA}/hb.req" "${DATA}/hb.resp" mtls)"
        case "${code}" in
            200)
                jq --arg at "$(date -u +%Y-%m-%dT%H:%M:%SZ)" '. + {_at: $at}' "${DATA}/hb.resp" > "${DATA}/last_heartbeat.json"
                sync_identity "${DATA}/hb.resp"
                status="$(jq -r .status "${DATA}/hb.resp")"
                if [[ "${status}" != "active" ]]; then
                    bashio::log.warning "AJ Netweb: $(jq -r .message "${DATA}/hb.resp")"
                fi
                if [[ "$(jq -r .renew "${DATA}/hb.resp")" == "true" ]]; then
                    renew_cert
                fi
                ;;
            401)
                bashio::log.warning "Server no longer accepts this device certificate - re-activating"
                rm -f "${DATA}/client.crt"
                pkill -x frpc || true
                ;;
            000) bashio::log.debug "heartbeat: server unreachable" ;;
            *)   bashio::log.debug "heartbeat: HTTP ${code}" ;;
        esac
        rm -f "${DATA}/hb.req" "${DATA}/hb.resp"
    done
}

# -------------------------------------------------------------- main
PIDS=()
shutdown() {
    bashio::log.info "Stopping AJ Netweb agent"
    pkill -x frpc 2>/dev/null || true
    for p in "${PIDS[@]}"; do kill "${p}" 2>/dev/null || true; done
    exit 0
}
trap shutdown SIGTERM SIGINT

bashio::log.info "AJ Netweb Remote Access agent ${AGENT_VERSION} (server ${SERVER})"
until enrolled || enroll; do :; done
[[ -n "$(state '.instance_uid // empty')" ]] && bashio::log.info "AJ Netweb instance ID: $(state .instance_uid)"

check_reverse_proxy_config
write_webrtc_config
render_nginx
nginx -c "${NGX_CONF}" &
PIDS+=($!)
heartbeat_loop &
PIDS+=($!)
# management agent: telemetry, installer commands (allow-listed), status page
AJN_SERVER_RESOLVED="${SERVER}" AJN_INSTALL_ID="${INSTALL_ID}" AJN_AGENT_VERSION="${AGENT_VERSION}" \
    python3 -u /usr/lib/ajn/agent.py &
PIDS+=($!)
if bashio::config.true 'allow_installer_management'; then
    bashio::log.info "Installer management: ENABLED (every action is listed on the AJ Netweb sidebar page)"
else
    bashio::log.info "Installer management: disabled - status reporting only"
fi

# frpc supervisor: restarts after renewals, re-activations and network loss
while true; do
    until enrolled || enroll; do :; done
    render_frpc
    write_webrtc_config          # credentials change after a re-activation
    bashio::log.info "Connecting secure tunnel to $(state .tunnel.server_addr) for $(state .public_url)"
    frpc -c "${DATA}/frpc.toml" &
    FRPC_PID=$!
    wait "${FRPC_PID}" || true
    # local nginx must stay up; if it died, exit so the Supervisor watchdog restarts us cleanly
    kill -0 "${PIDS[0]}" 2>/dev/null || { bashio::log.error "local proxy stopped"; exit 1; }
    sleep 3
done
