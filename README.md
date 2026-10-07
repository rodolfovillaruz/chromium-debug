# Chromium debug setup

Chromium runs with the Chrome DevTools Protocol (CDP) on port 9222 and is
driven by `cdp.mjs` (screenshots, clicks, keys, JS eval).

## Launch commands

Headless (current mode):

```bash
chromium --headless \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/rodolfo/Desktop/chromium-debug/profile \
  --no-first-run --no-default-browser-check \
  --window-size=1280,900 \
  about:blank > /home/rodolfo/Desktop/chromium-debug/chromium.log 2>&1 &
```

Visible window, forced onto X11 (XWayland):

```bash
chromium --ozone-platform=x11 \
  --remote-debugging-port=9222 \
  --user-data-dir=/home/rodolfo/Desktop/chromium-debug/profile \
  --no-first-run --no-default-browser-check \
  --window-size=1280,900 \
  about:blank > /home/rodolfo/Desktop/chromium-debug/chromium.log 2>&1 &
```

Visible window, native Wayland: same as above without `--ozone-platform=x11`.

## Parameters

| Parameter | Purpose |
|---|---|
| `--remote-debugging-port=9222` | Opens the CDP endpoint at `http://127.0.0.1:9222`. `cdp.mjs` connects here. |
| `--user-data-dir=.../profile` | Separate profile in this folder, so the normal Chromium profile (`~/.config/chromium`) is never touched. Keeps cookies and logins (e.g. Netflix) between restarts. CDP requires a non-default profile directory. |
| `--no-first-run` | Skips the first-run welcome page. |
| `--no-default-browser-check` | Suppresses the "make Chromium your default browser" prompt. |
| `--window-size=1280,900` | Window size. Headless page area comes out 1280×813; the windowed page area comes out about 1248×771 (browser UI takes the rest). |
| `--headless` | No window at all; the browser identifies itself as `HeadlessChrome`. Overrides any `--ozone-platform` setting. |
| `--ozone-platform=x11` | Runs the window through X11/XWayland instead of native Wayland. Only meaningful with a visible window. |
| `about:blank` | Starting page. |
| `> chromium.log 2>&1` | Browser output goes to `chromium.log`. GCM `DEPRECATED_ENDPOINT`, GLib `g_main_context_pop_thread_default` and `MESA-LOADER` lines in it are harmless. |

## Checking that it is up

```bash
curl -s http://127.0.0.1:9222/json/version
node cdp.mjs tabs
```

## Stopping it

`/usr/bin/chromium` is a launcher script. Killing the launcher's PID leaves the
real browser (`/usr/lib/chromium/chromium`) running. Kill the browser process
itself, and avoid `pkill -f` with the profile path, since that also matches the
shell running the command:

```bash
PID=$(ps -eo pid,args | awk '/[u]sr\/lib\/chromium\/chromium/ && /chromium-debug\/profile/ && !/--type=/ {print $1}')
kill "$PID"
```

## Driving it with cdp.mjs

All commands act on the first open tab. Coordinates are CSS pixels and match
screenshot pixels 1:1.

```
node cdp.mjs goto <url>            navigate and wait for load
node cdp.mjs screenshot out.png    capture the visible page
node cdp.mjs click <x> <y>         mouse click at page coordinates
node cdp.mjs clicksel "<css>"      click an element by CSS selector
node cdp.mjs type "text"           type into the focused field
node cdp.mjs key Enter             Enter, Tab, Escape, arrows, or a single character
node cdp.mjs scroll 500            mouse-wheel scroll
node cdp.mjs eval "<js>"           run JavaScript in the page
node cdp.mjs raw <Method> '{json}' any other CDP command
node cdp.mjs tabs                  list open tabs
```

Example, pressing Space (play/pause in video players):

```bash
node cdp.mjs raw Input.dispatchKeyEvent '{"type":"keyDown","key":" ","code":"Space","windowsVirtualKeyCode":32,"text":" "}'
node cdp.mjs raw Input.dispatchKeyEvent '{"type":"keyUp","key":" ","code":"Space","windowsVirtualKeyCode":32}'
```

## Notes

- **Widevine / Netflix (error M7701-1003).** Chromium downloads the Widevine
  DRM module into `profile/WidevineCdm/` on first use, but only loads it at
  startup. If a fresh profile shows M7701-1003, restart Chromium once. Check
  support from an https page (the API does not exist on `about:blank`):

  ```bash
  node cdp.mjs eval "navigator.requestMediaKeySystemAccess('com.widevine.alpha',[{initDataTypes:['cenc'],videoCapabilities:[{contentType:'video/mp4;codecs=\"avc1.42E01E\"'}]}]).then(()=>'widevine OK').catch(e=>'widevine FAIL: '+e.message)"
  ```

- **Screenshots of DRM video.** On native Wayland the video area comes out
  black (subtitles still show). With `--ozone-platform=x11` and in headless
  mode the video frame is captured.
