"""AJ Netweb licence signal ("green signal") for the other AJ Netweb add-ons.

Remote Access is the licence authority on a Home Assistant. When the AJ Netweb server has activated
this installation (it issued our client certificate, CN = Install ID, signed by the AJ Netweb CA) and
the last heartbeat says the subscription is active, we publish a short-lived statement:

    /homeassistant/.ajnetweb/remote_access.json
    { "payload": {v, install_id, status, products, site_name, instance_uid, paid_until,
                  heartbeat_at, issued_at, valid_until, agent_version},
      "sig": base64(ECDSA-SHA256 over the canonical payload, made with OUR client key),
      "cert_pem": our client certificate, "chain_pem": the CA certificate(s) from the server }

The other add-ons (ajn_license.py) check: certificate chain -> pinned AJ Netweb root CA, CN == this
Install ID, signature made by that certificate's key, status active, not expired. The private key never
leaves /data, so a copied statement stops working when it expires (VALID_HOURS) and can't be renewed.

If the server also sends an AJ Netweb licence (heartbeat field "entitlement", AJN1 format), it is stored
as the shared licence key, which the dashboard can also verify in the browser.

Standard library + the openssl CLI (already in the image) - no extra packages.
"""
from __future__ import annotations

import base64
import json
import os
import re
import subprocess
import tempfile
import time
from datetime import datetime, timezone

DATA = "/data/ajn"
SHARED_DIR = "/homeassistant/.ajnetweb"
SIGNAL = f"{SHARED_DIR}/remote_access.json"
SHARED_KEY = f"{SHARED_DIR}/license.key"
VALID_HOURS = 72          # a statement older than this is ignored by the other add-ons
OFFLINE_DAYS = 30         # keep giving the green signal this long without reaching the AJ Netweb server
EVERY = 600               # re-sign every 10 minutes


def _read(path: str) -> str:
    try:
        with open(path, encoding="utf-8") as f:
            return f.read()
    except OSError:
        return ""


def _json(path: str) -> dict:
    try:
        with open(path, encoding="utf-8") as f:
            v = json.load(f)
        return v if isinstance(v, dict) else {}
    except (OSError, ValueError):
        return {}


def _write(path: str, text: str, mode: int = 0o644) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    fd, tmp = tempfile.mkstemp(dir=os.path.dirname(path), prefix=".tmp-")
    with os.fdopen(fd, "w", encoding="utf-8") as f:
        f.write(text)
    os.chmod(tmp, mode)
    os.replace(tmp, path)


def canonical(payload: dict) -> bytes:
    return json.dumps(payload, sort_keys=True, separators=(",", ":"), ensure_ascii=False).encode()


def _ts(iso: str | None) -> float | None:
    if not iso:
        return None
    try:
        return datetime.fromisoformat(str(iso).replace("Z", "+00:00")).timestamp()
    except ValueError:
        return None


def build_payload(install_id: str, agent_version: str) -> dict | None:
    if not (os.path.exists(f"{DATA}/client.crt") and os.path.exists(f"{DATA}/client.key")):
        return None
    hb = _json(f"{DATA}/last_heartbeat.json")
    st = _json(f"{DATA}/state.json")
    at = _ts(hb.get("_at"))
    now = time.time()
    status = str(hb.get("status") or "unknown")
    if at is None:
        status = "unknown"
    elif now - at > OFFLINE_DAYS * 86400:
        status = "stale"          # server not reached for too long
    products = hb.get("products") if isinstance(hb.get("products"), list) else ["*"]
    return {
        "v": 1, "install_id": install_id, "status": status,
        "products": [str(p) for p in products][:32],
        "site_name": hb.get("site_name") or st.get("site_name"),
        "instance_uid": hb.get("instance_uid") or st.get("instance_uid"),
        "paid_until": hb.get("paid_until"), "heartbeat_at": hb.get("_at"),
        "issued_at": int(now), "valid_until": int(now + VALID_HOURS * 3600),
        "agent_version": agent_version,
    }


def sign(data: bytes) -> str:
    with tempfile.NamedTemporaryFile(dir="/tmp", delete=False) as f:
        f.write(data)
        name = f.name
    try:
        out = subprocess.run(["openssl", "dgst", "-sha256", "-sign", f"{DATA}/client.key", name],
                             capture_output=True, timeout=20, check=True).stdout
    finally:
        os.unlink(name)
    return base64.b64encode(out).decode()


def publish(install_id: str, agent_version: str) -> str:
    """Write the signed statement. Returns the status written (or 'none')."""
    payload = build_payload(install_id, agent_version)
    if not payload:
        # not (or no longer) activated, e.g. the server rejected our certificate: withdraw the signal
        if os.path.exists(SIGNAL):
            os.unlink(SIGNAL)
        return "none"
    doc = {"payload": payload, "sig": sign(canonical(payload)),
           "cert_pem": _read(f"{DATA}/client.crt"), "chain_pem": _read(f"{DATA}/ca.crt")}
    _write(SIGNAL, json.dumps(doc, indent=1))
    ent = str(_json(f"{DATA}/last_heartbeat.json").get("entitlement") or "").strip()
    if re.fullmatch(r"AJN1\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+", ent) and _read(SHARED_KEY).strip() != ent:
        _write(SHARED_KEY, ent + "\n")
    return payload["status"]


def loop(install_id: str, agent_version: str, log=print) -> None:
    last = None
    while True:
        try:
            st = publish(install_id, agent_version)
            if st != last:
                log(f"licence signal for AJ Netweb add-ons: {st}")
                last = st
        except Exception as e:  # noqa: BLE001 - never take the agent down
            log(f"licence signal: {e}")
        time.sleep(EVERY)
