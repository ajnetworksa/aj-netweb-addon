# AJ Netweb Smart Home Platform — product plan

Status: working document, October 2026. Owner: AJ Netweb engineering.

## 1. Vision

A villa-grade smart home system for the GCC that matches the experience of Crestron, Savant and
Control4. It runs on Home Assistant, so the client is not locked to one hardware brand and pays no
per-device licence. We sell the installation, the design and the support. The software is our tool
for doing that quickly and to the same standard on every project.

**What makes it ours:**

| Commercial systems | AJ Netweb |
|---|---|
| Programmed by a dealer, changes cost a visit | Dashboard builds itself from HA areas; changes in a Studio, often remote |
| Proprietary touch panels | Any Android/iPad tablet, the Companion app and Fully Kiosk |
| Usually English-first | Arabic and English, RTL, Umm Al-Qura prayer times and adhan built in |
| Licence per room or processor | No licence. HA is open source, and support is our recurring revenue |
| Breaks if the dealer disappears | Standard HA underneath; full backups the client owns |

**Design rules** (they stay in force):
1. Native HA first, our cards second, community cards only by exception. Never card-mod.
2. Use only public, documented HA APIs, so HA updates don't break sites.
3. Installers configure, they don't code: every project setting is in a Studio or in HA settings.
4. One source per feature: a fix in the kit reaches every site with the next add-on update.

## 2. Product line

| Product | Type | Version | Status |
|---|---|---|---|
| Dashboard Suite + UI kit | Add-on + Lovelace strategy/cards | 3.1.0 | Production |
| Prayer & Adhan | Add-on | 1.0.0 | **New — field trial** |
| Music (Music Assistant + our music card) | Official add-on + our card | MA 2.x / kit 3.1 | **New — field trial** |
| Intercom & Door Station | Add-on | 1.5.0 | Production |
| CCTV & NVR Studio | Add-on | 1.2.0 | Production |
| Room & Guest Pass Studio | Add-on | 1.1.0 | Production |
| Remote Access | Add-on | 1.2.4 | Production |
| Alexa Matter Bridge | Add-on (own repo) | 1.1.0 | Production |
| Wall panel kit (tablet + mount + kiosk profile) | Hardware bundle | — | Planned (Q1 2027) |
| Installer portal / fleet monitoring | Cloud service | — | Planned (Q2 2027) |

## 3. Client packages

Prices are set by sales; this table defines **what each package must include**, so every quote and
every installation is the same.

| | Essential | Premium | Signature |
|---|---|---|---|
| Target | Apartments, small villas | Family villas | Palaces, large villas, compounds |
| Lighting, AC, curtains | ✅ | ✅ | ✅ |
| Dashboard on phones | ✅ | ✅ | ✅ |
| Arabic / English | ✅ | ✅ | ✅ |
| Scenes | Up to 5 | Per room | Per room + seasonal (Ramadan, Eid, summer) |
| Room photos on the dashboard | — | ✅ | ✅ professional photos |
| Wall panels | — | 1–2 | Every floor + majlis |
| Prayer times card | ✅ | ✅ | ✅ |
| Adhan on speakers, TV pause | — | ✅ | ✅ + per-zone (majlis, women's majlis, guest wing) |
| Multi-room music (Music Assistant) | — | ✅ | ✅ + streaming accounts set up for the family |
| Intercom / door station | Optional | ✅ | ✅ multiple gates |
| CCTV in the dashboard | Optional | ✅ | ✅ + live wall panel |
| Guest / staff access control | — | ✅ | ✅ + guest wing / hotel mode |
| Alexa (Arabic/English voice) | Optional | ✅ | ✅ + local Arabic voice (planned) |
| Remote support | 1 year | 2 years | Ongoing contract with SLA |
| Off-site backups and monitoring | — | ✅ (planned) | ✅ (planned) |

## 4. Improvement backlog

Priorities: **P0** protects quality on sites we already have, **P1** is what clients will notice
and pay for, **P2** helps the business scale.

### P0 — quality and reliability (before scaling installations)

| # | Item | Why | Effort |
|---|---|---|---|
| 1 | **CI on GitHub**: build the kit, `py_compile`, `node --check`, `bash -n`, add-on lint (`frenck/action-addon-linter`) on every PR | Catch a broken add-on before it reaches a client | S |
| 2 | **Automated tests**: strategy snapshot tests on the sample houses; Python unit tests for the adhan scheduler and dashboard engine | The strategy is the core; regressions show on every site at once | M |
| 3 | **Release automation**: tag → changelog → version bump in config.json → built image | No manual version mistakes; sites update cleanly | S |
| 4 | **Device test lab** in the office: one HA box with real Sonos/Cast/AirPlay speaker, Hikvision door station + NVR, Zigbee/KNX lights, AC gateway, 2 tablets | Everything so far was tested against a simulated HA; real devices must sign off each release | M |
| 5 | **Release channels**: `stable` and `beta` add-on repositories; new versions go to 2–3 friendly sites first | Never surprise 50 clients at once | S |
| 6 | **Off-site backups**: scheduled HA backups to our storage (encrypted, per client) | A failed SD/SSD must not lose a project | M |
| 7 | **Health monitoring**: daily heartbeat from each site (HA version, add-on versions, offline devices, disk, backup age) | Fix problems before the client calls | M |

### P1 — features clients will see

| # | Item | Notes | Effort |
|---|---|---|---|
| 8 | **House modes**: Home / Away / Sleep / Guests / Ramadan as one chip row; each mode sets lights, AC, alarm, adhan zones | Biggest "luxury" feeling for the least work | M |
| 9 | **Energy & DEWA/SEC card**: today's kWh, AC share, cost estimate, solar if present (native energy data) | GCC bills are dominated by AC; clients ask for it | M |
| 10 | **AC schedules & pre-cooling**: "cool the majlis 30 min before Maghrib", summer/winter profiles | Ties into the prayer times we already compute | M |
| 11 | **Notification centre** in the dashboard: doorbell, alarms, water leak, gate left open, with history | Today notifications are only on phones | M |
| 12 | **Alarm system** pack: native `alarm_control_panel` + sirens + our UI, arm from the dashboard and Alexa | Replaces separate alarm apps | M |
| 13 | **Water tank & irrigation**: tank level card, pump protection, garden zones by schedule | Very common in villas; blueprint exists, needs a card | M |
| 14 | **Guest wing / hotel mode**: welcome scene, time-limited access, cleaning status | Extends Room & Guest Pass | M |
| 15 | **Local Arabic voice**: HA Assist with Arabic (Gulf) speech models on a local box, voice satellites in rooms | Privacy; works when the internet is down | L |
| 16 | **Studio upgrades**: room photo upload and crop, scene editor (capture current state), drag to reorder rooms | Today photos and scenes are done in HA settings | M |
| 17 | **Kiosk app profile**: one-tap Fully Kiosk / Companion setup via QR (screen dimming by motion, auto-start) | Cuts wall panel setup from 30 to 5 minutes | S |
| 18 | **Music**: per-room presets ("Quran in the morning", "dinner jazz"), wake-up and sleep timers, Quran radio favourites | Builds on the new music card | S |
| 19 | **Adhan**: per-zone adhan (different speakers per prayer), Iqamah reminder, Friday Jumu'ah settings, Quran after Fajr | Builds on the new add-on | S |

### P2 — scale the business

| # | Item | Notes | Effort |
|---|---|---|---|
| 20 | **Separate UI kit repository** published on HACS | Other integrators and our own non-add-on sites get updates | S |
| 21 | **Installer portal**: list of sites, versions, health, backups, one-click remote session | Built on items 6, 7 and Remote Access | L |
| 22 | **Site templates**: save a finished project (Studio options, scenes, blueprints) and start the next villa from it | Big time saver for compounds with identical villas | M |
| 23 | **Licensing / activation** for paid add-ons (offline-tolerant) | Only if we sell software separately | M |
| 24 | **Client app branding**: white-label theme per developer/compound | For real estate developers | S |
| 25 | **Documentation site** (MkDocs) from `ajnetweb-ui/docs` + training videos for installers | Onboarding new installers | S |

Effort: S ≤ 1 week, M 2–4 weeks, L 1–3 months, for one developer.

## 5. Roadmap

| Quarter | Theme | Deliverables |
|---|---|---|
| **Q4 2026** | Ship what we built safely | Field trial of Music + Prayer & Adhan on 3 sites · CI (1) · release automation (3) · release channels (5) · test lab (4) |
| **Q1 2027** | Reliability + luxury basics | Tests (2) · off-site backups (6) · house modes (8) · kiosk profile (17) · wall panel hardware kit · adhan/music presets (18, 19) |
| **Q2 2027** | Visibility | Health monitoring (7) · installer portal v1 (21) · energy card (9) · AC schedules (10) · notification centre (11) |
| **Q3 2027** | Expand | Alarm pack (12) · water & irrigation (13) · hotel mode (14) · Studio upgrades (16) · site templates (22) · HACS kit (20) |
| **Later** | Voice | Local Arabic Assist (15) once Gulf-Arabic speech models are good enough |

## 6. Definition of done (every feature, every release)

- [ ] Works on a phone (Companion app, iOS and Android), a portrait tablet and a landscape tablet.
- [ ] English and Arabic (RTL) checked.
- [ ] Light and dark theme checked.
- [ ] Only public HA APIs are used; tested on the current and the previous HA release.
- [ ] Tested in the device lab with real hardware, not only the preview tool.
- [ ] Non-admin user tested (staff/guest), not only admin.
- [ ] Docs updated: cards reference, playbook checklist, add-on DOCS.md, changelog.
- [ ] Version bumped; CI green; installed on a beta site for one week before stable.

## 7. Risks and how we handle them

| Risk | Mitigation |
|---|---|
| HA frontend change breaks a card | Public APIs only; test on beta HA each month; the kit is small enough to fix in a day |
| Music provider changes (YouTube Music in MA is beta; Spotify API needs Premium) | Music Assistant handles providers; we only call MA services. Offer several providers per client |
| Adhan plays at the wrong time | Times from HA's official integration; per-prayer offsets agreed with the local mosque; "mute next" and master switch on the dashboard |
| Adhan audio copyright | We ship no audio; the client chooses and supplies the recording |
| Client internet down | Everything core runs locally; only streaming music and remote access need internet |
| Hardware failure on site | Off-site backups (P0-6); restore to a spare box in under 1 hour |
| Knowledge in one developer's head | Docs in the repo, playbook for installers, CI and tests so others can change code safely |

## 8. Metrics

- Installation time per villa (target: dashboard ready same day as devices are paired).
- Support calls per site per month, and share fixed remotely.
- Sites on the current version (target ≥ 90 % within 30 days of a release).
- Client satisfaction at handover and after 3 months.
