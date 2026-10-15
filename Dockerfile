FROM lscr.io/linuxserver/chromium:latest
RUN apt-get update && \
    apt-get install -y --no-install-recommends socat && \
    rm -rf /var/lib/apt/lists/*
# Google Chrome, for sites that reject Debian's Chromium. It ships its own Widevine.
RUN curl -fsSL -o /tmp/chrome.deb https://dl.google.com/linux/direct/google-chrome-stable_current_amd64.deb && \
    apt-get update && \
    apt-get install -y --no-install-recommends /tmp/chrome.deb && \
    rm -rf /tmp/chrome.deb /var/lib/apt/lists/*
COPY wrapped-chrome /usr/bin/wrapped-chrome
RUN chmod +x /usr/bin/wrapped-chrome && \
    printf '#!/bin/bash\nwrapped-chrome ${CHROME_CLI}\n' > /defaults/autostart
COPY cdp-proxy /custom-services.d/cdp-proxy
RUN chmod +x /custom-services.d/cdp-proxy
# Debian's Chromium can't download Widevine itself; ship it as the bundled CDM.
# Populate ./widevine from a Chromium profile's WidevineCdm/<version>/ folder.
COPY widevine/ /usr/lib/chromium/WidevineCdm/
RUN chmod -R a+rX /usr/lib/chromium/WidevineCdm
