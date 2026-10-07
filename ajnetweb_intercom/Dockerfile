ARG BUILD_FROM
FROM $BUILD_FROM

# Install Python 3, requests, and curl
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-requests \
    curl

WORKDIR /app

COPY run.sh /run.sh
COPY server.py /app/server.py
COPY intercom_hikvision.py /app/intercom_hikvision.py
COPY intercom_dahua.py /app/intercom_dahua.py
COPY www /app/www

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
