# Changelog - AJ Netweb Room & Guest Pass Studio

## 1.2.1
- Licence page: only asks for something when something is needed. With licensing not switched on, or when
  licensed through AJ Netweb Remote Access, it just shows the status (no licence key box or Activate button).

## 1.2.0
- **AJ Netweb licence:** this add-on now needs this Home Assistant to be licensed by AJ Netweb, normally
  through **AJ Netweb Remote Access** (no key to enter), or with an offline licence key (see `licensing/README.md`). Existing installations keep
  working for 14 days after updating; the add-on page shows the Install ID and an Activate box.
  Developer builds without a public key are not affected.

## 1.1.0
- **Fixed guest links.** Links pointed to the ingress URL, which needs a Home Assistant login, so guests
  could never open them. Guests now use a dedicated port (**8097**) that serves only the guest page and the
  token-checked guest API. The link uses the host's LAN address, or set `guest_base_url`
  (e.g. a remote-access URL).
- **Fixed freeze.** The first guest action deadlocked the add-on (a lock was taken twice); every later
  request hung until restart.
- **Security:** the guest PIN was stored but never checked. It is now required, with a 15-minute lockout
  after 5 wrong attempts.
- **Security:** guests could call any service on any device in their rooms, and `allow_guest_*` options
  were not enforced. Services are now allow-listed per domain, the domain comes from the entity itself, and
  the add-on options cap what a pass can include (locks stay off unless `allow_guest_locks` is on).
- **Security:** the admin studio only answers Home Assistant ingress; wildcard CORS removed.
- Fixed dashboard sync: views were hidden from admins and matched rooms by substring ("bed" matched
  "bedroom-2"). Admins now always keep access, matching is exact (including Dashboard Suite `room-<area>`
  pages), all storage dashboards are covered, and a backup is saved first to `/share/ajnetweb/sharing_backups`.
- Admin flag now detected correctly; Supervisor/system users hidden from the user list.

## 1.0.0
- Initial release of AJ Netweb Room & Guest Pass Studio for Home Assistant.
- Instant QR Code & Guest Link generator for temporary visitors, Airbnb, cleaners, and guests (zero app, zero account, zero YAML).
- Visual Home Assistant User Room Permission Matrix with 1-click automated Lovelace dashboard view sync.
- Real-time scoped security engine with device category filters (Lights, Climate/AC, Curtains, Switches, Locks) and auto-expiration countdowns.
- Standalone mobile-responsive PWA Guest Controller (`guest.html`) for direct room control from any phone browser.
- Printable "Welcome Guest" room smart cards with QR code.
- Live security audit log tracking all guest and user actions.
- Cyber theme engine with custom color picker and pure OLED black mode.
