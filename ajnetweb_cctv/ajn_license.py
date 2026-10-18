#!/usr/bin/env python3
"""
AJ Netweb licence check - shared by every AJ Netweb add-on.

CANONICAL COPY: licensing/ajn_license.py. Each add-on folder holds a copy (Docker builds only see
their own folder); run `python3 tools/license/ajn-license.py sync` after changing this file or the
public key, and CI / review should reject copies that differ.

How it works
- AJ Netweb signs a licence with its private Ed25519 key (kept offline by AJ Netweb, never in this repo).
- The licence names the Home Assistant installation it belongs to (the Install ID = HA's own
  instance UUID from /homeassistant/.storage/core.uuid, the same ID Remote Access uses), the products
  and an optional expiry date.
- Every add-on verifies the signature with the public key below, offline. No internet needed.
- One licence activates all add-ons on that installation: it is stored in
  /homeassistant/.ajnetweb/license.key (plus a copy in each add-on's /data).
- New or updated installations without a licence get GRACE_DAYS to be activated, then the add-on
  locks: its pages show the activation screen and its API answers 402.
- While PUBLIC_KEY is empty (developer build) nothing is enforced.

Licence format (one line):  AJN1.<base64url(payload JSON)>.<base64url(signature)>
payload: {"v":1, "id":"AJN-2026-0001", "customer":"Villa Al Noor", "install":"<Install ID>",
          "products":["*"] | ["dashboard","adhan",...], "issued":"2026-10-18", "expires":null | "2027-10-18"}
"""

import base64
import json
import logging
import os
import threading
import time
from datetime import date
from typing import Any, Dict, Optional

log = logging.getLogger("ajnetweb.license")

# AJ Netweb public key (raw Ed25519, base64). Set by `ajn-license.py keygen --install` + `sync`.
PUBLIC_KEY = ""

GRACE_DAYS = 14
PREFIX = "AJN1."
CONFIG_DIR = os.environ.get("AJN_CONFIG_DIR", "/homeassistant")
DATA_DIR = os.environ.get("AJN_DATA_DIR", os.environ.get("ADDON_DATA_DIR", "/data"))
SHARED_DIR = os.path.join(CONFIG_DIR, ".ajnetweb")
SHARED_KEY = os.path.join(SHARED_DIR, "license.key")
SHARED_STATE = os.path.join(SHARED_DIR, "license_state.json")

MESSAGES = {
    "unconfigured": "Developer build - licensing is not enforced.",
    "active": "Activated.",
    "grace": "Not activated yet. This add-on keeps working for {days} more day(s).",
    "locked": "Not activated. Send the Install ID to AJ Netweb to receive your licence key.",
    "expired": "The licence expired on {expires}. Contact AJ Netweb to renew it.",
    "wrong_install": "This licence belongs to another Home Assistant installation.",
    "wrong_product": "This licence does not include this add-on.",
    "invalid": "The licence key is not valid.",
    "error": "The licence could not be checked (crypto library missing).",
}


# ---------------------------------------------------------------------------- helpers
def _b64d(s: str) -> bytes:
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))


def _read(path: str) -> str:
    try:
        with open(path, "r", encoding="utf-8") as f:
            return f.read().strip()
    except OSError:
        return ""


def _write(path: str, text: str) -> None:
    try:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        tmp = path + ".tmp"
        with open(tmp, "w", encoding="utf-8") as f:
            f.write(text)
        os.replace(tmp, path)
    except OSError as e:
        log.warning("could not write %s: %s", path, e)


def install_id() -> str:
    """Home Assistant's instance UUID - stable for the installation, kept in backups."""
    try:
        with open(os.path.join(CONFIG_DIR, ".storage", "core.uuid"), "r", encoding="utf-8") as f:
            uid = (json.load(f).get("data") or {}).get("uuid") or ""
        if uid:
            return str(uid)
    except (OSError, ValueError):
        pass
    return ""


def decode(key: str) -> Optional[Dict[str, Any]]:
    """Payload of a licence string without checking it (for display)."""
    key = "".join((key or "").split())
    if not key.startswith(PREFIX) or key.count(".") != 2:
        return None
    try:
        return json.loads(_b64d(key.split(".")[1]))
    except (ValueError, TypeError):
        return None


def verify(key: str, product: str, iid: str, public_key: str = None) -> Dict[str, Any]:
    """Check one licence string. Returns {ok, reason, payload}."""
    pub = PUBLIC_KEY if public_key is None else public_key
    key = "".join((key or "").split())
    payload = decode(key)
    if not payload:
        return {"ok": False, "reason": "invalid", "payload": None}
    try:
        from cryptography.exceptions import InvalidSignature
        from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PublicKey
    except ImportError:
        return {"ok": False, "reason": "error", "payload": payload}
    head, body, sig = key.split(".")
    try:
        Ed25519PublicKey.from_public_bytes(base64.b64decode(pub)).verify(_b64d(sig), f"{head}.{body}".encode())
    except (InvalidSignature, ValueError, TypeError):
        return {"ok": False, "reason": "invalid", "payload": payload}
    if payload.get("v") != 1:
        return {"ok": False, "reason": "invalid", "payload": payload}
    if not iid or str(payload.get("install", "")).lower() != iid.lower():
        return {"ok": False, "reason": "wrong_install", "payload": payload}
    products = payload.get("products") or []
    if "*" not in products and product not in products:
        return {"ok": False, "reason": "wrong_product", "payload": payload}
    exp = payload.get("expires")
    if exp:
        try:
            if date.fromisoformat(str(exp)) < date.today():
                return {"ok": False, "reason": "expired", "payload": payload}
        except ValueError:
            return {"ok": False, "reason": "invalid", "payload": payload}
    return {"ok": True, "reason": "active", "payload": payload}


# ---------------------------------------------------------------------------- licence state
class License:
    """Licence state of one add-on. Cheap to call: the result is cached for a minute."""

    def __init__(self, product: str, name: str = ""):
        self.product = product
        self.name = name or product
        self._lock = threading.Lock()
        self._cache = None
        self._at = 0.0

    # -- grace period: the first time this installation ran a licensed build of this add-on
    def _first_seen(self) -> float:
        now = time.time()
        seen = []
        for path in (os.path.join(DATA_DIR, "license_state.json"), SHARED_STATE):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    v = json.load(f).get(self.product)
                if isinstance(v, (int, float)) and 0 < v <= now:
                    seen.append(float(v))
            except (OSError, ValueError, AttributeError):
                pass
        first = min(seen) if seen else now
        for path in (os.path.join(DATA_DIR, "license_state.json"), SHARED_STATE):
            try:
                with open(path, "r", encoding="utf-8") as f:
                    data = json.load(f)
            except (OSError, ValueError):
                data = {}
            if not isinstance(data, dict):
                data = {}
            if data.get(self.product) != first:
                data[self.product] = first
                _write(path, json.dumps(data))
        return first

    def _key(self) -> str:
        return _read(SHARED_KEY) or _read(os.path.join(DATA_DIR, "license.key")) or os.environ.get("AJN_LICENSE_KEY", "")

    def status(self, fresh: bool = False) -> Dict[str, Any]:
        with self._lock:
            if not fresh and self._cache and time.time() - self._at < 60:
                return self._cache
            st = self._compute()
            if self._cache and self._cache["state"] != st["state"]:
                log.warning("Licence state of %s changed: %s -> %s", self.name, self._cache["state"], st["state"])
            self._cache, self._at = st, time.time()
            return st

    def _compute(self) -> Dict[str, Any]:
        iid = install_id()
        base = {"product": self.product, "name": self.name, "install_id": iid, "grace_days": GRACE_DAYS}
        if not PUBLIC_KEY:
            return dict(base, state="unconfigured", allowed=True, message=MESSAGES["unconfigured"])
        key = self._key()
        res = verify(key, self.product, iid) if key else {"ok": False, "reason": "locked", "payload": None}
        p = res.get("payload") or {}
        lic = {k: p.get(k) for k in ("id", "customer", "products", "issued", "expires")} if p else None
        if res["ok"]:
            return dict(base, state="active", allowed=True, license=lic, key=key,
                        message=MESSAGES["active"])
        first = self._first_seen()
        left = GRACE_DAYS - int(max(0.0, time.time() - first) // 86400)
        reason = res["reason"]
        if left > 0 and reason in ("locked", "invalid", "wrong_install", "wrong_product"):
            msg = MESSAGES["grace"].format(days=left)
            if reason != "locked":
                msg = MESSAGES[reason] + " " + msg
            return dict(base, state="grace", allowed=True, days_left=left, reason=reason, license=lic, message=msg)
        return dict(base, state="locked", allowed=False, reason=reason, license=lic,
                    message=MESSAGES.get(reason, MESSAGES["locked"]).format(expires=p.get("expires", "")))

    def allowed(self) -> bool:
        return bool(self.status()["allowed"])

    def activate(self, key: str) -> Dict[str, Any]:
        key = "".join((key or "").split())
        if not PUBLIC_KEY:
            return {"ok": False, "error": MESSAGES["unconfigured"], "status": self.status(True)}
        res = verify(key, self.product, install_id())
        if not res["ok"]:
            return {"ok": False, "error": MESSAGES.get(res["reason"], MESSAGES["invalid"]).format(
                expires=(res.get("payload") or {}).get("expires", "")), "status": self.status(True)}
        _write(SHARED_KEY, key + "\n")
        _write(os.path.join(DATA_DIR, "license.key"), key + "\n")
        log.info("Activated licence %s for %s", (res["payload"] or {}).get("id"), (res["payload"] or {}).get("customer"))
        st = self.status(True)
        publish(self)
        return {"ok": True, "status": st}

    def public_status(self) -> Dict[str, Any]:
        st = dict(self.status())
        st.pop("key", None)
        return st


# ---------------------------------------------------------------------------- HA sensor
def publish(lic: License) -> None:
    """sensor.ajnetweb_license - lets the dashboard cards check the licence in the browser."""
    token = os.environ.get("SUPERVISOR_TOKEN")
    if not token:
        return
    st = lic.status()
    attrs = {"friendly_name": "AJ Netweb licence", "icon": "mdi:license", "install_id": st.get("install_id"),
             "products": (st.get("license") or {}).get("products"), "customer": (st.get("license") or {}).get("customer"),
             "expires": (st.get("license") or {}).get("expires"), "key": st.get("key", ""),
             "days_left": st.get("days_left"), "published_by": lic.product}
    try:
        import urllib.request
        req = urllib.request.Request("http://supervisor/core/api/states/sensor.ajnetweb_license",
                                     data=json.dumps({"state": st["state"], "attributes": attrs}).encode(),
                                     headers={"Authorization": f"Bearer {token}", "Content-Type": "application/json"},
                                     method="POST")
        urllib.request.urlopen(req, timeout=10).read()
    except Exception as e:  # noqa: BLE001 - HA may be restarting; we retry
        log.debug("licence sensor not published: %s", e)


def start_publisher(lic: License, every: int = 60) -> None:
    def run():
        while True:
            publish(lic)
            time.sleep(every)
    threading.Thread(target=run, daemon=True, name="licence-sensor").start()


# ---------------------------------------------------------------------------- HTTP gate
def handle(handler, lic: License, endpoints: bool = True) -> bool:
    """
    Call first in do_GET / do_POST / do_HEAD of an add-on's request handler.
    Serves /license (page) and /api/license (status, activate). When the add-on is locked, every other
    page shows the activation screen and every API call answers 402. Returns True if it answered.
    """
    path = handler.path.split("?", 1)[0].rstrip("/") or "/"
    method = handler.command
    if not endpoints:  # e.g. a guest port on the LAN: only the gate, no licence pages
        pass
    elif path.endswith("/api/license"):
        if method == "POST":
            try:
                n = int(handler.headers.get("Content-Length") or 0)
                body = json.loads(handler.rfile.read(min(n, 8192)) or b"{}")
            except (ValueError, TypeError):
                body = {}
            res = lic.activate(str(body.get("key", "")))
            _json(handler, 200 if res["ok"] else 400,
                  {"ok": res["ok"], "error": res.get("error"), "status": _strip(res["status"])})
        else:
            _json(handler, 200, lic.public_status())
        return True
    elif path.endswith("/license"):
        _page(handler, lic)
        return True
    if lic.allowed():
        return False
    if "/api/" in path + "/":
        _json(handler, 402, {"ok": False, "error": lic.status()["message"],
                             **({"license": lic.public_status()} if endpoints else {})})
    else:
        _page(handler, lic)
    return True


def _strip(st):
    st = dict(st)
    st.pop("key", None)
    return st


def _json(handler, code, data):
    body = json.dumps(data).encode()
    handler.send_response(code)
    handler.send_header("Content-Type", "application/json")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if handler.command != "HEAD":
        handler.wfile.write(body)


def _page(handler, lic):
    body = ACTIVATION_PAGE.replace("__NAME__", _esc(lic.name)).encode()
    handler.send_response(200)
    handler.send_header("Content-Type", "text/html; charset=utf-8")
    handler.send_header("Cache-Control", "no-store")
    handler.send_header("Content-Length", str(len(body)))
    handler.end_headers()
    if handler.command != "HEAD":
        handler.wfile.write(body)


def _esc(s):
    return str(s).replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;").replace('"', "&quot;")


ACTIVATION_PAGE = """<!doctype html><html><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1"><title>__NAME__ - activation</title>
<style>
 :root { color-scheme: light dark; --bg:#f4f5f8; --card:#fff; --text:#151823; --t2:#5f6577; --b:#e3e6ee; --acc:#2f7dd1; }
 @media (prefers-color-scheme: dark) { :root { --bg:#0f1116; --card:#1a1d25; --text:#eef1f6; --t2:#9aa3b5; --b:#2a2e38; --acc:#5aa9ff; } }
 body { margin:0; font-family:-apple-system,"Segoe UI",Roboto,"Noto Sans Arabic",sans-serif; background:var(--bg); color:var(--text); }
 .w { max-width:560px; margin:6vh auto; padding:0 16px; }
 .c { background:var(--card); border:1px solid var(--b); border-radius:20px; padding:24px; }
 h1 { font-size:22px; margin:0 0 4px; } .s { color:var(--t2); margin:0 0 18px; }
 .st { padding:12px 14px; border-radius:12px; margin-bottom:18px; font-weight:600; }
 .active { background:rgba(48,209,88,.15); color:#1f9d4a; } .grace { background:rgba(255,176,32,.16); color:#b7790b; }
 .locked { background:rgba(255,69,58,.14); color:#d23a30; } .unconfigured { background:rgba(127,127,127,.14); }
 label { display:block; font-size:13px; font-weight:600; color:var(--t2); margin:14px 0 6px; }
 .id { display:flex; gap:8px; } code { flex:1; padding:10px 12px; border-radius:10px; background:var(--bg); border:1px solid var(--b); font-size:13px; word-break:break-all; }
 textarea { width:100%; box-sizing:border-box; min-height:96px; padding:10px 12px; border-radius:10px; border:1px solid var(--b); background:var(--bg); color:var(--text); font:13px ui-monospace,monospace; }
 button { font:inherit; font-weight:600; border:none; border-radius:999px; padding:10px 18px; cursor:pointer; background:var(--acc); color:#fff; }
 button.g { background:transparent; color:var(--text); border:1px solid var(--b); }
 .row { display:flex; gap:10px; margin-top:14px; align-items:center; flex-wrap:wrap; } .err { color:#d23a30; font-size:14px; }
 dl { display:grid; grid-template-columns:auto 1fr; gap:4px 14px; font-size:14px; margin:0; } dt { color:var(--t2); }
 .ar { direction:rtl; text-align:right; color:var(--t2); font-size:14px; margin-top:16px; }
</style></head><body><div class="w"><div class="c">
 <h1>__NAME__</h1><p class="s">AJ Netweb licence</p>
 <div id="st" class="st">…</div>
 <dl id="info"></dl>
 <label>Install ID - send this to AJ Netweb</label>
 <div class="id"><code id="iid">…</code><button class="g" id="copy">Copy</button></div>
 <label>Licence key</label>
 <textarea id="key" placeholder="AJN1...." spellcheck="false"></textarea>
 <div class="row"><button id="act">Activate</button><span id="msg" class="err"></span></div>
 <p class="ar">هذه الإضافة تعمل بترخيص من AJ Netweb. أرسل رقم التثبيت (Install ID) إلى AJ Netweb لاستلام مفتاح الترخيص.</p>
</div></div><script>
const $ = (i) => document.getElementById(i);
const base = location.pathname.replace(/\\/license\\/?$/, "/").replace(/\\/?$/, "/");
function show(s) {
  $("st").className = "st " + (s.state === "expired" ? "locked" : s.state); $("st").textContent = s.message;
  $("iid").textContent = s.install_id || "(not found - is the Home Assistant config folder mapped?)";
  const l = s.license || {}; const rows = [["Customer", l.customer], ["Licence", l.id], ["Products", (l.products || []).map((x) => x === "*" ? "All AJ Netweb add-ons" : x).join(", ")], ["Expires", l.expires || (l.id ? "never" : "")]];
  $("info").innerHTML = rows.filter((r) => r[1]).map((r) => `<dt>${r[0]}</dt><dd style="margin:0">${String(r[1]).replace(/[<&]/g, "")}</dd>`).join("");
}
fetch(base + "api/license").then((r) => r.json()).then(show);
$("copy").onclick = () => { navigator.clipboard && navigator.clipboard.writeText($("iid").textContent); $("copy").textContent = "Copied"; };
$("act").onclick = async () => {
  $("msg").textContent = "";
  const r = await fetch(base + "api/license", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ key: $("key").value }) });
  const d = await r.json(); show(d.status);
  if (d.ok) { $("msg").style.color = "#1f9d4a"; $("msg").textContent = "Activated - reloading…"; setTimeout(() => (window.top !== window ? location.reload() : (location.href = base)), 1200); }
  else $("msg").textContent = d.error || "Not accepted";
};
</script></body></html>"""
