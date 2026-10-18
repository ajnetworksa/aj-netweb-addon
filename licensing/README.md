# AJ Netweb licensing

Only Home Assistant installations that AJ Netweb has activated can use the AJ Netweb add-ons and dashboard.
This page is for AJ Netweb (the owner). Installers only need [step 4](#4-activate-a-client-site).

## How it works

```
 AJ Netweb (your PC, offline)                     Client's Home Assistant
 ┌───────────────────────────┐                    ┌──────────────────────────────────────────────┐
 │ private signing key  🔒   │  licence key       │ each add-on checks the signature with the    │
 │ ajn-license.py issue ─────┼──── AJN1.… ───────▶│ PUBLIC key built into it, the Install ID,    │
 │ licences.csv (register)   │  (paste once)      │ products and expiry - offline, no internet   │
 └───────────────────────────┘                    └──────────────────────────────────────────────┘
```

- **Signature (Ed25519).** A licence is signed with your private key. Nobody can make a valid licence
  without it, and changing even one letter of a licence (customer, expiry, Install ID) breaks the signature.
- **One installation.** The licence names the **Install ID**, which is HA's own instance UUID
  (`.storage/core.uuid`, the same ID Remote Access uses). A licence copied to another HA is rejected.
  Restoring a backup on new hardware keeps the Install ID, so a hardware swap needs no new licence.
- **Products.** `all`, or a list: `dashboard, adhan, cctv, intercom, sharing`.
- **Expiry.** Optional, e.g. for maintenance contracts. Without one, the licence never expires.
- **One key for everything.** It is stored in `/config/.ajnetweb/license.key`, and every AJ Netweb add-on on
  that HA reads it.
- **Grace period.** A site without a licence works for **14 days** after it first runs a licensed version.
  During that time the activation page shows the days left. After that, the add-on locks:
  - its page shows the activation screen and its API answers `402`;
  - background work stops (adhan playback, doorbell events);
  - the dashboard cards show "AJ Netweb - not activated".
- **Developer builds.** While `licensing/public_key.txt` doesn't exist, nothing is enforced. That is the
  state of the repository until you do step 1.
- **Remote Access** keeps its own online activation through your licence server, unchanged.

## 1. Create your signing key (once)

On **your own computer**, not a client's HA and not a shared server:

```bash
pip install cryptography
git clone https://github.com/ajnetworksa/aj-netweb-addon && cd aj-netweb-addon
python3 tools/license/ajn-license.py keygen --out ~/ajnetweb-secrets/ajnetweb-signing.pem --install
python3 tools/license/ajn-license.py sync
cd ajnetweb-ui && npm install && npm run build && cd ..
git add licensing/public_key.txt licensing/ajn_license.py */ajn_license.py ajnetweb-ui/dist ajnetweb_dashboard/www
git commit -m "Set AJ Netweb licence public key" && git push
```

- The private key file is encrypted with your passphrase. **Back up the file and the passphrase in two
  safe places** (e.g. an encrypted USB drive in the office safe, plus a password manager).
- If you lose it, you can't issue new licences. You would need a new key, and every site would need a new
  licence.
- If it leaks, anyone can make licences. Make a new key, push it, and re-issue licences to all sites.
- `.gitignore` blocks `*.pem`, `*.key`, `licences.csv` and `ajnetweb-secrets/`, and the tool refuses to save
  the private key inside the repository.

Bump the add-on versions and release as usual. Sites start their 14-day grace period when they update.

## 2. Get the Install ID of a site

The installer opens **Dashboard Studio → Licence**, or any AJ Netweb add-on page (when locked it opens the
activation screen itself). They press **Copy** next to the Install ID and send it to you.

## 3. Issue the licence

```bash
python3 tools/license/ajn-license.py issue --key ~/ajnetweb-secrets/ajnetweb-signing.pem \
    --install-id 3f2c0a5b9d1e4c7a8b6f0e1d2c3b4a59 --customer "Villa Al Noor - Riyadh" \
    --products all --expires 2027-12-31 --note "Premium package, installer Ahmed"
```

It prints the licence key (`AJN1.…`) and records it in `~/ajnetweb-secrets/licences.csv`, your register
of every licence issued (number, date, customer, Install ID, products, expiry, note). Keep that file
with the private key.

To check what a key contains: `python3 tools/license/ajn-license.py inspect AJN1.…`

## 4. Activate a client site

Paste the key in **Dashboard Studio → Licence** (or any AJ Netweb add-on page) → **Activate**. All AJ Netweb
add-ons on that HA are active within a minute, and the dashboard as soon as the page reloads.

## Renewing, upgrading, revoking

- **Renew / add products:** issue a new licence for the same Install ID and paste it. It replaces the old one.
- **Revoke:** licences are checked offline, so you can't switch one off remotely. Use expiry dates for
  contracts that may end; a site stops when its licence expires. Remote Access can still be cut off
  from your licence server.

## What this protects, and what it doesn't

| Threat | Protected? |
|---|---|
| Someone adds the public GitHub repo to their own HA | ✅ Works 14 days, then locks |
| Copying a licence from one client to another HA | ✅ Wrong Install ID → rejected |
| Editing a licence (expiry, products, customer) | ✅ Signature breaks |
| Copying the dashboard JS file to another HA | ✅ Cards show "not activated" (no valid signed licence sensor) |
| Restoring a client's **full backup** onto another HA | ⚠️ Works: the backup carries the same Install ID. Treat client backups as confidential. |
| A skilled developer editing the Python/JS to remove the check | ⚠️ Possible. The code is readable on the device. The LICENSE file makes it a breach of your terms. |
| Someone reading your code on GitHub | ⚠️ The repository is public. Making it private is the next step (see below). |

**Next steps for stronger protection** (in the product plan):
1. **Private repository.** Clients then can't browse the code. HA's add-on store needs to be able to
   reach the repository, so test a private repository on one HA before switching every site.
2. **Pre-built images** in a private container registry (`image:` in each `config.json`). Sites then download
   finished images instead of building from source, so the source isn't on the device in readable form.
3. **Compiled Python** (e.g. Nuitka or Cython) inside those images, to make editing the check much harder.
