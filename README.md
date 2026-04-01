# MUDKAT NOC Kiosk

Self-hosted network operations center dashboard for Raspberry Pi 5 with a 7-inch DSI touchscreen (800x480).

A single Electron app that replaces a typical Chromium kiosk + Python HTTP server + nginx + evdev navigation script setup.

## Screenshots

![MUDKAT NOC home screen](assets/screenshot.png)

## Features

- **Home screen** with three service tiles showing live status indicators (green/yellow/red)
- **Embedded service views** via BrowserView with a top bar overlay (HOME button + service name + clock)
- **Touch scrolling** via pointer-event injection (works with Pi DSI touchscreen + disabled GPU)
- **On-screen keyboard** injected into service pages for text input fields
- **Pi-hole auto-login** using credentials from config file
- **Idle carousel** -- after 60s idle on home, auto-cycles through services every 30s
- **Auto-return** -- after 120s idle on a service view, returns to home screen
- **Service health pinging** -- HTTP HEAD every 30s with response time classification

## Services Monitored

| Service     | Default URL               | Zoom |
|-------------|---------------------------|------|
| Grafana     | http://localhost:3000      | 50%  |
| Uptime Kuma | http://localhost:3001      | 50%  |
| Pi-hole     | http://localhost:80/admin  | 80%  |

Service URLs can be customized in `config.json`.

## Hardware Requirements

- Raspberry Pi 5 (or Pi 4 with 4GB+ RAM)
- 7-inch DSI touchscreen (800x480)
- 64-bit Raspberry Pi OS (Bookworm or later)
- X11 display server (not Wayland)

## Software Dependencies

- Node.js 18+ and npm
- Electron 33+ (installed via npm, ships arm64 binaries)
- System libraries for Electron:
  ```bash
  sudo apt install -y libgtk-3-0 libnotify4 libnss3 libxss1 libxtst6 xdg-utils libatspi2.0-0 libsecret-1-0
  ```

If Raspberry Pi OS defaults to Wayland, switch to X11:
```bash
sudo raspi-config   # Advanced Options > Wayland > X11
```

## Installation

```bash
git clone <repo-url> mudkat-kiosk
cd mudkat-kiosk
npm install
```

## Configuration

Copy the example config and edit it for your environment:

```bash
cp config.json.example config.json
```

Edit `config.json`:
```json
{
  "pihole_password": "YOUR_PIHOLE_PASSWORD_HERE",

  "grafana_url": "http://localhost:3000/d/YOUR_DASHBOARD_ID/your-dashboard?orgId=1&refresh=5s&kiosk",
  "uptime_url": "http://localhost:3001/status/default",
  "pihole_url": "http://localhost:80/admin",

  "display_ip": "192.168.x.x",
  "display_gateway": "192.168.x.x"
}
```

| Key | Description |
|-----|-------------|
| `pihole_password` | Pi-hole admin password for auto-login |
| `grafana_url` | Full Grafana dashboard URL (including dashboard ID and query params) |
| `uptime_url` | Uptime Kuma status page URL |
| `pihole_url` | Pi-hole admin panel URL |
| `display_ip` | Pi IP address shown on the home screen status bar |
| `display_gateway` | Gateway IP shown on the home screen status bar |

`config.json` is gitignored and will not be committed.

## Run (Development)

```bash
npm start
```

The app launches in fullscreen kiosk mode. Press `Ctrl+C` to quit.

## Deploy as a Service

See [setup/README.md](setup/README.md) for systemd service and desktop autostart instructions.

Quick start (replace `<user>` placeholders in the service file first):
```bash
sudo cp setup/mudkat-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now mudkat-kiosk.service
```

## File Structure

```
mudkat-kiosk/
  main.js              # Electron main process
  preload.js           # Context bridge for IPC
  config.json          # Local config + secrets (gitignored)
  config.json.example  # Template for config
  renderer/
    dashboard.html     # Home screen
    dashboard.js       # Home screen logic
  setup/
    mudkat-kiosk.service   # systemd unit file (edit <user> before use)
    mudkat-kiosk.desktop   # XDG autostart file (edit <user> before use)
    README.md              # Setup instructions
```

## How It Works

1. **Main process** (`main.js`) creates a fullscreen BrowserWindow showing the dashboard
2. **Tapping a tile** sends an IPC message; main process creates a BrowserView loaded with the service URL, positioned below a 48px top bar
3. **did-finish-load** injects three scripts into each BrowserView:
   - **Pointer-event scroll handler** -- converts pointer drag gestures into `scrollTop` changes (needed because Pi DSI + `--disable-gpu` delivers input as pointer events, not touch events)
   - **On-screen keyboard** -- shows a virtual keyboard when text inputs are focused
   - **Pi-hole auto-login** -- fills password and submits the login form (pihole only)
4. **Idle tracking** -- the preload script reports pointer/key activity; the main process checks every 5s to trigger carousel or auto-return
