ARG BUILD_FROM
FROM $BUILD_FROM

# Install Python 3, requests, ffmpeg (for RTSP snapshotting & HLS streaming), and curl
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-requests \
    ffmpeg \
    curl

WORKDIR /app

COPY run.sh /run.sh
COPY server.py /app/server.py
COPY nvr_hikvision.py /app/nvr_hikvision.py
COPY nvr_dahua.py /app/nvr_dahua.py
COPY www /app/www

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
