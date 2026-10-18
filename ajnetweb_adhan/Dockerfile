ARG BUILD_FROM
FROM $BUILD_FROM

RUN apk add --no-cache python3 py3-pip py3-requests py3-websocket-client py3-cryptography \
 && pip3 install --no-cache-dir --break-system-packages hijridate==2.5.0 mutagen==1.47.0

WORKDIR /app
COPY run.sh /run.sh
COPY *.py /app/
COPY www /app/www
RUN chmod a+x /run.sh

CMD [ "/run.sh" ]
