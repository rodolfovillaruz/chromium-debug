FROM lscr.io/linuxserver/chromium:latest
RUN apt-get update && \
    apt-get install -y --no-install-recommends socat && \
    rm -rf /var/lib/apt/lists/*
COPY cdp-proxy /custom-services.d/cdp-proxy
RUN chmod +x /custom-services.d/cdp-proxy
# Debian's Chromium can't download Widevine itself; ship it as the bundled CDM.
# Populate ./widevine from a Chromium profile's WidevineCdm/<version>/ folder.
COPY widevine/ /usr/lib/chromium/WidevineCdm/
RUN chmod -R a+rX /usr/lib/chromium/WidevineCdm
