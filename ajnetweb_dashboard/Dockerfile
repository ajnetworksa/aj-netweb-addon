ARG BUILD_FROM
FROM $BUILD_FROM

# Install Python 3, requests, websocket client, pyyaml, and curl
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-requests \
    py3-cryptography \
    py3-websocket-client \
    py3-yaml \
    curl

# QR codes for the Studio "Wall panels" tab (pure Python)
RUN pip3 install --no-cache-dir --break-system-packages segno==1.6.6

WORKDIR /app

COPY run.sh /run.sh
COPY *.py /app/
COPY blueprints /app/blueprints
COPY www /app/www

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
