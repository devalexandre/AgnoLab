FROM node:20-bookworm

ENV DEBIAN_FRONTEND=noninteractive \
    PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true \
    PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        ca-certificates \
        chromium \
        fonts-liberation \
        git \
        libasound2 \
        libatk-bridge2.0-0 \
        libatk1.0-0 \
        libdrm2 \
        libgbm1 \
        libgtk-3-0 \
        libnss3 \
        libu2f-udev \
        libx11-xcb1 \
        libxcomposite1 \
        libxdamage1 \
        libxfixes3 \
        libxrandr2 \
        libxshmfence1 \
        libxss1 \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /opt/wppconnect-server

RUN git clone --depth 1 https://github.com/wppconnect-team/wppconnect-server.git . \
    && npm install

COPY entrypoint.sh /usr/local/bin/agnolab-wppconnect-entrypoint.sh
RUN chmod +x /usr/local/bin/agnolab-wppconnect-entrypoint.sh

EXPOSE 21465

VOLUME ["/opt/wppconnect-server/userDataDir"]

ENTRYPOINT ["/usr/local/bin/agnolab-wppconnect-entrypoint.sh"]
