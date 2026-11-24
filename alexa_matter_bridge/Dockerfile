ARG BUILD_FROM
FROM ${BUILD_FROM}

# Pinned, stable releases. Bump both together after testing.
ARG MATTERBRIDGE_VERSION=3.10.14
ARG MATTERBRIDGE_HASS_VERSION=1.5.0

RUN apk add --no-cache \
    nodejs \
    npm \
    python3 \
    py3-websocket-client \
    tzdata \
    curl \
    jq \
    bash

# Global install (the layout Matterbridge documents): the plugin resolves
# `matterbridge` as a sibling package, so there is only one copy of the core.
RUN npm install -g --omit=dev --no-fund --no-audit \
        "matterbridge@${MATTERBRIDGE_VERSION}" \
        "matterbridge-hass@${MATTERBRIDGE_HASS_VERSION}" \
    && npm cache clean --force

COPY rootfs/ /
COPY run.sh /run.sh

# Apply compatibility patches at build time; --strict fails the build if the
# upstream code changed, instead of shipping a silently broken bridge.
RUN chmod +x /run.sh /usr/bin/*.sh /usr/bin/patch-matterbridge.js \
    && node /usr/bin/patch-matterbridge.js --strict

CMD ["/run.sh"]
