# AJ Netweb Remote Access

Secure access to your Home Assistant from anywhere — including live cameras and two-way intercom —
without opening ports on your router.

## Setup

1. Install this app/add-on and open the **Configuration** tab.
2. Paste the **license key** you received from AJ Netweb (`AJN-XXXXX-XXXXX-…`) and **Save**.
3. **Start** the add-on and open the **Log** tab. After a few seconds you'll see
   `Activated. Your remote address: https://<your-home>.yourname.dpdns.org`.
4. Add these lines to `configuration.yaml` (File editor or Studio Code Server) and restart
   Home Assistant:

   ```yaml
   http:
     use_x_forwarded_for: true
     trusted_proxies:
       - 172.30.33.0/24
     ip_ban_enabled: true
     login_attempts_threshold: 5

   web_rtc: !include ajnetweb/web_rtc.yaml
   ```

   If you already have an `http:` section, merge the keys into it.
5. **Settings → System → Network → Home Assistant URL → Internet:** enter your remote address.
6. In the Home Assistant Companion app, the same address is used automatically when you're away.

Test it on mobile data (Wi-Fi off): open the address, sign in, open a camera and try the intercom.

## Options

| Option | Description |
|---|---|
| `license_key` | Used once to activate this Home Assistant. You can clear it afterwards. |
| `allow_installer_management` | Lets AJ Netweb maintain this Home Assistant for you: safe updates (backup first, automatic roll-back), encrypted cloud backups, network checks, standard configuration packages, and short-lived technician logins for support visits. Also shares the device list (names, models) with your installer. Off = status reporting only, and any temporary technician login is deleted at once. Every action appears on the **AJ Netweb** sidebar page. |
| `manage_webrtc_config` | Writes the relay settings used for live video and intercom on mobile networks. |
| `log_level` | `info` normally; `debug` if AJ Netweb support asks. |

## The AJ Netweb sidebar page

Shows your **Instance ID** (quote it when you contact support), the connection and subscription status,
this system's identifiers and versions, whether installer management is enabled, and every action your
installer performed.
Active **temporary technician logins** are listed there too, with their expiry time; they delete
themselves automatically.

## Your customer page

AJ Netweb can send you a private link to your own service page: status, availability, monthly reports,
receipts and support requests. It also has a **Turn off installer access** button that works
immediately. Turning access back **on** is only possible here, in this app's configuration — nobody can
do it remotely.

## Troubleshooting

| Log message | What to do |
|---|---|
| `License key was rejected` | Check the key for typos; contact support if it is correct. |
| `already bound to another Home Assistant` | You moved to new hardware — ask support to reset the binding, then restart. |
| `Subscription inactive` / `Remote access paused` | Contact AJ Netweb about your subscription. Your home keeps working locally. |
| `not configured to trust this add-on as a reverse proxy` | Add the `http:` lines above and restart Home Assistant. |
| Cameras load on Wi-Fi but not on 4G | Add the `web_rtc:` line above and restart Home Assistant. |

## Privacy & security

* The connection to AJ Netweb is outbound, encrypted, and uses a device certificate created on your
  Home Assistant (the private key never leaves it).
* Your cameras' RTSP streams never leave your home network; video is delivered through Home Assistant.
* Cloud backups are encrypted on this Home Assistant before they are uploaded.
* AJ Netweb's gateway inspects web requests to block attacks and bans addresses that try to guess
  passwords. See AJ Netweb's privacy policy for details.
