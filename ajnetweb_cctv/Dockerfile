ARG BUILD_FROM
FROM $BUILD_FROM

# Install Python 3, requests, ffmpeg (for RTSP snapshotting & HLS streaming), and curl
RUN apk add --no-cache \
    python3 \
    py3-pip \
    py3-requests \
    py3-cryptography \
    ffmpeg \
    curl

WORKDIR /app

COPY run.sh /run.sh
COPY *.py /app/
COPY www /app/www

RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
