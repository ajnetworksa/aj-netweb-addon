ARG BUILD_FROM
FROM $BUILD_FROM

# Install Python 3, requests, websocket client, pyyaml, and curl
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-requests \
    py3-websocket-client \
    py3-yaml \
    curl

WORKDIR /app

COPY run.sh /run.sh
COPY dashboard_engine.py /app/dashboard_engine.py
COPY server.py /app/server.py
COPY www /app/www

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
