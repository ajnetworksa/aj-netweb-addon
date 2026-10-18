// Licence check in the browser. The Dashboard Suite add-on verifies the licence (signature, Install ID,
// products, expiry) and publishes it as sensor.ajnetweb_license; the cards check the signed key again
// with AJ Netweb's public key, so the kit doesn't run on a Home Assistant that AJ Netweb didn't activate.
// With AJ Netweb Remote Access as the licence source the add-on has already verified it (see
// licensing/ajn_license.py) and the browser accepts its word. The last valid licence is remembered per
// browser, so a Home Assistant restart (sensor briefly missing) never blanks a wall panel.
// A build without a public key and without a Remote Access root CA (developer build) disables the check.
import * as ed from "@noble/ed25519";
import { sha512 } from "@noble/hashes/sha2.js";

ed.hashes.sha512 = sha512;

const PUBLIC_KEY = __AJN_PUBKEY__; // licensing/public_key.txt, set at build time
const ENFORCED = __AJN_ENFORCED__; // true when the build has a public key or a Remote Access root CA
const SENSOR = "sensor.ajnetweb_license";
const STORE = "ajn-licence";
const PRODUCT = "dashboard";

const verified = new Map(); // key -> payload | null

const b64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
const b64u = (s) => b64(s.replace(/-/g, "+").replace(/_/g, "/") + "=".repeat((4 - (s.length % 4)) % 4));

function check(key) {
  if (!PUBLIC_KEY) return null;
  if (verified.has(key)) return verified.get(key);
  let payload = null;
  try {
    const [head, body, sig] = String(key).split(".");
    if (head === "AJN1" && body && sig &&
        ed.verify(b64u(sig), new TextEncoder().encode(`${head}.${body}`), b64(PUBLIC_KEY))) {
      payload = JSON.parse(new TextDecoder().decode(b64u(body)));
    }
  } catch (e) { payload = null; }
  verified.set(key, payload);
  return payload;
}

function usable(p, installId) {
  if (!p || p.v !== 1) return false;
  if (installId && String(p.install).toLowerCase() !== String(installId).toLowerCase()) return false;
  const products = p.products || [];
  if (!products.includes("*") && !products.includes(PRODUCT)) return false;
  return !p.expires || new Date(`${p.expires}T23:59:59`) >= new Date();
}

let last = { states: null, result: null };

/** { ok, state, message, install_id } for the current hass. Cheap: re-evaluated only when the sensor changes. */
export function licenseState(hass) {
  if (!ENFORCED) return { ok: true, state: "unconfigured" };
  const s = hass && hass.states ? hass.states[SENSOR] : undefined;
  if (last.result && last.states === s) return last.result;
  let result;
  if (s && s.state === "grace") {
    result = { ok: true, state: "grace", days_left: s.attributes.days_left };
  } else if (s && s.state === "active" && usable(check(s.attributes.key), s.attributes.install_id)) {
    result = { ok: true, state: "active" };
    try { localStorage.setItem(STORE, JSON.stringify({ key: s.attributes.key, install: s.attributes.install_id })); } catch (e) { /* private mode */ }
  } else if (s && s.state === "active" && s.attributes.source === "remote_access") {
    // Remote Access proved it to the Dashboard add-on (certificate chain + device signature, checked in
    // Python). The browser can't re-check an X.509 chain cheaply, so this path trusts the add-on.
    result = { ok: true, state: "active", source: "remote_access" };
    try { localStorage.setItem(STORE + "-ra", String(Date.now() + 3 * 86400000)); } catch (e) { /* private mode */ }
  } else if (!s || s.state === "unavailable" || s.state === "unknown") {
    // add-on not reporting (HA restarting, add-on updating): fall back to this browser's last valid licence
    let cached = null;
    try { cached = JSON.parse(localStorage.getItem(STORE) || "null"); } catch (e) { cached = null; }
    let raUntil = 0;
    try { raUntil = Number(localStorage.getItem(STORE + "-ra") || 0); } catch (e) { raUntil = 0; }
    result = (cached && usable(check(cached.key), cached.install)) || raUntil > Date.now()
      ? { ok: true, state: "cached" }
      : { ok: false, state: "missing", message: "AJ Netweb Dashboard Suite is not installed or not running." };
  } else {
    result = { ok: false, state: s.state, install_id: s.attributes.install_id,
               message: s.state === "locked" ? "This Home Assistant is not activated." : "The licence is not valid." };
  }
  last = { states: s, result };
  return result;
}

export function licenseNotice(result) {
  return `<ha-card style="padding:18px 20px;display:grid;gap:6px">
    <div style="font-weight:700;font-size:16px">AJ Netweb - not activated</div>
    <div style="color:var(--secondary-text-color);font-size:14px">${(result && result.message) || ""}
      Open <b>Dashboard Studio → Licence</b> and send the Install ID to AJ Netweb.</div></ha-card>`;
}
