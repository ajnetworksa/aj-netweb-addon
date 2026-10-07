ARG BUILD_FROM
FROM $BUILD_FROM

ARG BUILD_ARCH
ARG FRP_VERSION=0.71.0
ARG AJN_SERVER=""
ARG AJN_AGENT_VERSION=1.2.3

# nginx: local header adapter in front of HA   openssl: key + CSR generation (key never leaves /data)
RUN apk add --no-cache nginx openssl python3 \
 && case "${BUILD_ARCH}" in \
      amd64)   A=amd64 ;; \
      aarch64) A=arm64 ;; \
      *) echo "unsupported arch ${BUILD_ARCH}"; exit 1 ;; \
    esac \
 && F="frp_${FRP_VERSION}_linux_${A}.tar.gz" \
 && cd /tmp \
 && curl -fsSLO "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/${F}" \
 && curl -fsSLO "https://github.com/fatedier/frp/releases/download/v${FRP_VERSION}/frp_sha256_checksums.txt" \
 && grep " ${F}\$" frp_sha256_checksums.txt | sha256sum -c - \
 && tar xzf "${F}" \
 && install -m 0755 "frp_${FRP_VERSION}_linux_${A}/frpc" /usr/local/bin/frpc \
 && rm -rf /tmp/frp* \
 && rm -f /etc/nginx/http.d/default.conf

ENV AJN_SERVER=${AJN_SERVER} \
    AJN_AGENT_VERSION=${AJN_AGENT_VERSION}

COPY run.sh /run.sh
COPY agent.py features.py /usr/lib/ajn/
COPY www/ /usr/share/ajn/www/
RUN chmod 0755 /run.sh /usr/lib/ajn/agent.py
CMD ["/run.sh"]

LABEL io.hass.type="addon" \
      io.hass.name="AJ Netweb Remote Access" \
      io.hass.arch="aarch64|amd64" \
      io.hass.version="${AJN_AGENT_VERSION}"
