# Setup Files

Before using these files, replace `<user>` in `mudkat-kiosk.service` and `mudkat-kiosk.desktop` with the kiosk user account name.

## Systemd Service (recommended)

```bash
sudo cp setup/mudkat-kiosk.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable mudkat-kiosk.service
sudo systemctl start mudkat-kiosk.service
```

Check status:
```bash
sudo systemctl status mudkat-kiosk.service
journalctl -u mudkat-kiosk.service -f
```

## Desktop Autostart (alternative)

If you prefer autostart via the desktop session instead of systemd:

```bash
mkdir -p ~/.config/autostart
cp setup/mudkat-kiosk.desktop ~/.config/autostart/
```

## Disable Old Services

If migrating from a previous Chromium kiosk setup:

```bash
sudo systemctl stop kiosk-nav.service
sudo systemctl disable kiosk-nav.service
sudo systemctl stop dashboard-server.service
sudo systemctl disable dashboard-server.service
mv ~/.config/autostart/kiosk.desktop ~/.config/autostart/kiosk.desktop.bak
```
