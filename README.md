# AJ Netweb — Home Assistant apps

Add this repository in Home Assistant (Settings → Add-ons → Add-on store → ⋮ → Repositories):
`https://github.com/ajnetworksa/aj-netweb-addon`

| Add-on | What it does |
|---|---|
| [Dashboard Suite](ajnetweb_dashboard/) | Installer studio for the premium, self-building dashboard (uses the UI kit below) |
| [Intercom & Door Station](ajnetweb_intercom/) | Hikvision/Dahua door stations: calls, unlock, notifications, live talk |
| [CCTV & NVR Studio](ajnetweb_cctv/) | Hikvision/Dahua NVRs and cameras: live wall, PTZ, playback |
| [Room & Guest Pass Studio](ajnetweb_sharing/) | Per-user room access, guest QR passes |
| [Remote Access](ajnetweb_tunnel/) | Secure remote access and installer support |
| [Prayer & Adhan](ajnetweb_adhan/) | Prayer times (Umm Al-Qura and others), adhan on chosen speakers, pauses TVs/music, reminders, Hijri date |

Alexa Matter Bridge lives in its own repository: <https://github.com/ajnetworksa/alexa_bridge>.

## AJ Netweb UI kit

The cards and the dashboard generator are in [`ajnetweb-ui/`](ajnetweb-ui/) and can be used in any
Home Assistant project. **Team playbook:** start with
[ajnetweb-ui/docs/01-project-playbook.md](ajnetweb-ui/docs/01-project-playbook.md).

Music uses **Music Assistant** (official HA add-on, installed from the default store) together with our
music card. No custom music server is needed.

## Product plan

Packages, roadmap and the improvement backlog: [docs/product-plan.md](docs/product-plan.md).
