# AJ Netweb licensing

Only Home Assistant installations that AJ Netweb has activated can use the AJ Netweb add-ons and the
dashboard. **AJ Netweb Remote Access is the licence authority.** When it is activated and the subscription
is active, it gives every other AJ Netweb add-on a "green signal", so nobody types a key into each add-on.
Sites without Remote Access can still use an offline licence key.

This page is for AJ Netweb (the owner). Installers only need [step 3](#3-activate-a-client-site).

## How it works

```
 AJ Netweb server                    Client's Home Assistant
 ┌──────────────────┐ licence key +  ┌────────────────────────────────────────────────────────────────┐
 │ AJ Netweb CA 🔒  │ CSR            │ Remote Access                                                  │
 │ subscriptions    │◀───────────────│  private device key 🔒 (never leaves its /data)                │
 │                  │ client cert    │  client cert  CN = Install ID, signed by the AJ Netweb CA      │
 │                  │───────────────▶│                                                                │
 │                  │ heartbeat 60 s │  every 10 min signs  {Install ID, status, products, +72 h}     │
 │                  │◀──────────────▶│  → /config/.ajnetweb/remote_access.json                        │
 └──────────────────┘ status: active │                                                                │
                                     │ Dashboard · Adhan · CCTV · Intercom · Guest Pass               │
                                     │  check: cert chain → pinned AJ Netweb root CA, CN = Install ID,│
                                     │  signature by that cert's key, status active, not expired      │
                                     └────────────────────────────────────────────────────────────────┘
```

**Why copying doesn't work:**
- The signal is signed with the device key of *that* Remote Access. The key is created on the device
  during activation and never sent anywhere, not even to your server.
- A signal is only valid for **72 hours**. A copy taken from a client stops working within three days,
  and it can't be refreshed without the device key.
- The certificate carries the **Install ID** (HA's own instance UUID). On another Home Assistant it doesn't
  match.
- Only your **AJ Netweb CA** can issue a certificate that the add-ons accept. A self-made certificate, or one
  from any other CA, is rejected.
- Changing anything in the signal (status, products, expiry) breaks the signature.

**It follows the subscription:**
- The server reports a status other than active (e.g. `suspended`) → the add-ons lock within 10 minutes.
- The server rejects the certificate (revoked) → Remote Access withdraws the signal.
- The certificate expires and the server refuses to renew it → the signal ends.
- **Internet outage:** the signal keeps working for up to **30 days** without reaching the server, so a villa
  with a dead internet line is not locked.
- **Products:** if the heartbeat sends `products: [...]`, only those add-ons are licensed. Otherwise all are.

**Grace period:** a site without any licence works for **14 days** after it first runs a licensed version.
After that, the add-on locks:
- its page shows the activation screen and its API answers `402`;
- background work stops (adhan playback, doorbell events);
- the dashboard cards show "AJ Netweb - not activated".

**Developer builds:** while neither `licensing/root_ca.pem` nor `licensing/public_key.txt` exists, nothing is
enforced. That is the state of the repository until you do step 1.

## 1. Switch licensing on (once)

### a) Remote Access signal: pin your root CA

Put the **certificate** (not the key) of the CA that signs Remote Access client certificates in
`licensing/root_ca.pem`. It is the root of the `ca_pem` your server returns at activation. Then run:

```bash
pip install cryptography
python3 tools/license/ajn-license.py sync        # embeds the CA into every add-on, checks the file
cd ajnetweb-ui && npm install && npm run build && cd ..
git add licensing/root_ca.pem licensing/ajn_license.py */ajn_license.py ajnetweb-ui/dist ajnetweb_dashboard/www
git commit -m "Pin AJ Netweb root CA for licensing" && git push
```

Release the add-ons with bumped versions as usual. Sites start their 14-day grace period when they update,
and sites with an active Remote Access are licensed straight away.

> If you ever replace the CA, add the new root to `root_ca.pem` and release **before** the server starts
> issuing certificates from it. The file may hold one root; ask for multi-root support if you need it.

### b) Offline licence keys (optional, for sites without Remote Access)

On **your own computer**:

```bash
python3 tools/license/ajn-license.py keygen --out ~/ajnetweb-secrets/ajnetweb-signing.pem --install
python3 tools/license/ajn-license.py sync && (cd ajnetweb-ui && npm run build)
git add licensing/public_key.txt licensing/ajn_license.py */ajn_license.py ajnetweb-ui/dist ajnetweb_dashboard/www
git commit -m "Set AJ Netweb licence public key" && git push
```

**Keeping the signing key safe:**
- Back up the private key file and its passphrase in two safe places.
- If you lose it, you can't issue new keys.
- If it leaks, make a new key pair and re-issue the keys.
- `.gitignore` blocks `*.pem` keys, `*.key`, `licences.csv` and `ajnetweb-secrets/`, and the tool refuses
  to save the private key inside the repository.

> **Tip:** your server can hand out these keys automatically. If the heartbeat response contains
> `"entitlement": "AJN1.…"` (a key signed with this signing key, for that Install ID, with a short expiry),
> Remote Access stores it. The dashboard can then check the licence signature in the browser too
> (see [below](#what-this-protects-and-what-it-doesnt)).

## 2. Issue a licence

- **With Remote Access (normal):** activate Remote Access with the client's subscription licence key, as you
  do today. All the other AJ Netweb add-ons are licensed within 10 minutes. There is nothing else to do.
- **Offline key:** the installer copies the **Install ID** from Dashboard Studio → Licence and sends it. You run:

```bash
python3 tools/license/ajn-license.py issue --key ~/ajnetweb-secrets/ajnetweb-signing.pem \
    --install-id 3f2c0a5b9d1e4c7a8b6f0e1d2c3b4a59 --customer "Villa Al Noor - Riyadh" \
    --products all --expires 2027-12-31 --note "No internet on site"
```

Every key is recorded in `~/ajnetweb-secrets/licences.csv`. To check a key: `ajn-license.py inspect AJN1.…`

## 3. Activate a client site

- **Remote Access:** install AJ Netweb Remote Access, enter the licence key in its Configuration tab and
  start it. The Remote Access page shows *AJ Netweb add-ons: Licensed*, and Dashboard Studio → Licence shows
  *Licensed by AJ Netweb Remote Access*.
- **Offline key:** paste it in Dashboard Studio → Licence (or any AJ Netweb add-on page) → **Activate**.

## What this protects, and what it doesn't

| Threat | Protected? |
|---|---|
| Someone adds the public GitHub repo to their own HA | ✅ Works 14 days, then locks |
| Copying the licence signal or an offline key to another HA | ✅ Wrong Install ID / signal expires in 72 h |
| Editing the signal or a key (status, products, expiry) | ✅ Signature breaks |
| A self-made "Remote Access" certificate | ✅ Not issued by the pinned AJ Netweb CA |
| Cancelled / suspended subscription | ✅ The add-ons lock within 10 minutes (after the server reports it) |
| Restoring a client's **full backup** (with Remote Access data) on another HA | ⚠️ Clones the device key. Your server can see two devices with the same certificate (different MAC / machine ID in heartbeats) and revoke it. |
| Faking `sensor.ajnetweb_license` in the browser | ⚠️ With the Remote Access path the browser trusts the Dashboard add-on. Use server `entitlement` keys for a cryptographic browser check. The add-ons themselves can't be fooled this way. |
| A skilled developer editing the readable Python of the *other* add-ons to remove the check | ⚠️ Possible. Next step: compile them too and ship ready-made images, as Remote Access now does ([guide](../docs/remote-access-closed-source.md)). The LICENSE file makes it a breach of your terms. |
