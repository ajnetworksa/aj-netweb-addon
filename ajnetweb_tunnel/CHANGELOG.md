# Changelog

## 1.2.2
- Fix sidebar ingress status page loading (`Permission denied` and empty fields).
- Add live Server Ping / Latency metric badge in the UI and telemetry.
- Hardware binding: report hardware MAC address and machine ID during enrollment and heartbeats.
- Automatic add-on update engine option in configuration.
- Immediate status pre-seeding on container startup.
- Fix activation HTTP status parsing (`000000` error code bug).
- Support direct LAN IP server addresses with automatic TLS trust and LAN tunnel routing.
- Improved connectivity error reporting during activation and heartbeats.
- Configurable server address with direct LAN IP routing support.

## 1.2.0
- Safe Home Assistant updates: a backup is taken first and the update is rolled back
  automatically if Home Assistant does not come back healthy.
- Encrypted cloud backup to AJ Netweb (nightly if enabled) and one-click restore.
- Device inventory, network diagnostics (latency and speed to the AJ Netweb hub).
- Configuration templates applied by your installer (with automatic rollback on error).
- Temporary installer logins that delete themselves (shown on the AJ Netweb page).
- The owner can switch off installer access from the customer portal.

## 1.1.0
- Server-assigned Instance ID shown in the log and on a new AJ Netweb sidebar page.
- System health reporting (versions, add-ons, uptime, disk, backups, cameras).
- Optional remote maintenance by your installer (restart, updates, backups, logs) with an
  owner switch and a visible action log.

## 1.0.0
- First release: license activation, mTLS tunnel (frp 0.71.0), real-IP forwarding,
  WebRTC relay (TURN) settings, heartbeat and automatic certificate renewal.
