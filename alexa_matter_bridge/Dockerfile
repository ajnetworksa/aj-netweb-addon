##
## alexa-matter-bridge/Dockerfile
##
## Builds on the official HA base image (Alpine 3.21 with Node.js 22 LTS).
## Installs Matterbridge and matterbridge-hass globally, avahi for mDNS Matter discovery,
## and Python3 for automatic auth token reconstruction.
##

ARG BUILD_FROM="ghcr.io/home-assistant/aarch64-base:3.21"
FROM ghcr.io/home-assistant/aarch64-base:3.21

# System dependencies
RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    avahi \
    avahi-compat-libdns_sd \
    dbus \
    tzdata \
    curl \
    jq \
    bash \
    sudo

# Sudo wrapper for container environment
RUN printf '#!/bin/sh\nexec "$@"\n' > /usr/bin/sudo && \
    chmod +x /usr/bin/sudo

# Install Matterbridge + Home Assistant plugin globally without duplicate @matter packages
RUN npm install -g --omit=dev matterbridge@3.10.12 matterbridge-hass@1.5.0 && \
    npm cache clean --force

# Copy add-on files
COPY run.sh /run.sh
COPY rootfs/ /

RUN chmod +x /run.sh && \
    chmod +x /usr/bin/setup-matterbridge.sh && \
    chmod +x /usr/bin/resolve-ha-token.py && \
    chmod +x /usr/bin/backup-commissioning.sh && \
    chmod +x /usr/bin/restore-commissioning.sh && \
    chmod +x /usr/bin/entity-manager.sh

# Expose Matter & Web UI ports
EXPOSE 5540/tcp
EXPOSE 5540/udp
EXPOSE 8283/tcp

CMD ["/run.sh"]
