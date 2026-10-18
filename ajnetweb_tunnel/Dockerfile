ARG BUILD_FROM

# ---------------------------------------------------------------- stage 1: agent code
# AJN_COMPILE=true (release images, see docs/remote-access-closed-source.md) compiles the Python agent
# to native extension modules with Nuitka, so the image ships no readable source for it. Default false
# keeps local Supervisor builds fast (no compiler needed on a Raspberry Pi).
FROM $BUILD_FROM AS agent
ARG AJN_COMPILE=false
ARG NUITKA_VERSION=4.2.2
COPY agent.py features.py attest.py /src/
RUN mkdir -p /out \
 && if [ "${AJN_COMPILE}" = "true" ]; then \
      apk add --no-cache python3 python3-dev py3-pip gcc musl-dev patchelf \
   && pip3 install --no-cache-dir --break-system-packages "nuitka==${NUITKA_VERSION}" \
   && cd /src \
   && for m in features attest agent; do \
        python3 -m nuitka --module --no-pyi-file --remove-output --python-flag=no_docstrings,no_asserts --output-dir=/out "${m}.py" || exit 1; \
      done \
   && ls -la /out; \
    else cp /src/*.py /out/; fi

# ---------------------------------------------------------------- stage 2: add-on image
FROM $BUILD_FROM

ARG BUILD_ARCH
ARG FRP_VERSION=0.71.1
ARG AJN_SERVER=""
ARG AJN_AGENT_VERSION=1.3.0

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
COPY --from=agent /out/ /usr/lib/ajn/
COPY www/ /usr/share/ajn/www/
RUN chmod 0755 /run.sh
CMD ["/run.sh"]

LABEL io.hass.type="addon" \
      io.hass.name="AJ Netweb Remote Access" \
      io.hass.arch="aarch64|amd64" \
      io.hass.version="${AJN_AGENT_VERSION}"
