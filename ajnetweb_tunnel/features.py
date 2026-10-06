"""Advanced maintenance features for the AJ Netweb agent (standard library only).

* HAWebSocket      – minimal Home Assistant WebSocket client (via the Supervisor proxy)
* device inventory – device registry + entity availability (only shared with owner consent)
* safe updates     – backup before update, health check afterwards, automatic rollback
* diagnostics      – hub latency, DNS, throughput to the hub, Wi-Fi signal, Zigbee (ZHA) link quality
* templates        – push allow-listed configuration files, install add-ons, validate, roll back on error
* cloud backups    – encrypted full backup streamed to AJ Netweb; restore from AJ Netweb
* temporary access – time-limited Home Assistant login for a technician, removed automatically
"""
from __future__ import annotations

import base64
import http.client
import json
import os
import secrets
import socket
import ssl
import struct
import threading
import time
import urllib.parse
from datetime import datetime, timedelta, timezone

DATA = "/data/ajn"
TEMP_USERS = f"{DATA}/temp_users.json"
HA_CONFIG_DIR = "/homeassistant"
TEMPLATE_PREFIXES = ("blueprints/automation/ajnetweb/", "blueprints/script/ajnetweb/", "packages/ajnetweb/",
                     "themes/ajnetweb/", "www/ajnetweb/", "custom_templates/ajnetweb/")


# ====================================================================== WebSocket
class HAWebSocket:
    def __init__(self, token: str, host: str = "supervisor", path: str = "/core/websocket", timeout: int = 30):
        self.sock = socket.create_connection((host, 80), timeout=timeout)
        self.buf = b""
        self.n = 0
        key = base64.b64encode(os.urandom(16)).decode()
        self.sock.sendall((f"GET {path} HTTP/1.1\r\nHost: {host}\r\nUpgrade: websocket\r\nConnection: Upgrade\r\n"
                           f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n"
                           f"Authorization: Bearer {token}\r\n\r\n").encode())
        while b"\r\n\r\n" not in self.buf:
            chunk = self.sock.recv(4096)
            if not chunk:
                raise ConnectionError("websocket handshake failed")
            self.buf += chunk
        head, self.buf = self.buf.split(b"\r\n\r\n", 1)
        if b" 101 " not in head.split(b"\r\n", 1)[0]:
            raise ConnectionError(f"websocket upgrade refused: {head[:80]!r}")
        if self.recv().get("type") != "auth_required":
            raise ConnectionError("unexpected websocket greeting")
        self.send({"type": "auth", "access_token": token})
        if self.recv().get("type") != "auth_ok":
            raise PermissionError("websocket auth failed")

    def _read(self, n: int) -> bytes:
        while len(self.buf) < n:
            chunk = self.sock.recv(65536)
            if not chunk:
                raise ConnectionError("websocket closed")
            self.buf += chunk
        out, self.buf = self.buf[:n], self.buf[n:]
        return out

    def send(self, obj: dict, opcode: int = 1) -> None:
        data = json.dumps(obj).encode() if opcode == 1 else b""
        mask = os.urandom(4)
        n = len(data)
        head = bytes([0x80 | opcode])
        if n < 126:
            head += bytes([0x80 | n])
        elif n < 65536:
            head += bytes([0x80 | 126]) + struct.pack(">H", n)
        else:
            head += bytes([0x80 | 127]) + struct.pack(">Q", n)
        self.sock.sendall(head + mask + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def recv(self) -> dict:
        payload = b""
        while True:
            b1, b2 = self._read(2)
            opcode, n = b1 & 0x0F, b2 & 0x7F
            if n == 126:
                n = struct.unpack(">H", self._read(2))[0]
            elif n == 127:
                n = struct.unpack(">Q", self._read(8))[0]
            if b2 & 0x80:
                mask = self._read(4)
                data = bytes(b ^ mask[i % 4] for i, b in enumerate(self._read(n)))
            else:
                data = self._read(n)
            if opcode == 8:
                raise ConnectionError("websocket closed by server")
            if opcode == 9:
                self.sock.sendall(bytes([0x8A, 0x80]) + os.urandom(4))
                continue
            if opcode in (1, 0):
                payload += data
                if b1 & 0x80:
                    return json.loads(payload)

    def call(self, type_: str, **kw):
        self.n += 1
        self.send({"id": self.n, "type": type_, **kw})
        while True:
            m = self.recv()
            if m.get("id") == self.n and m.get("type") == "result":
                if not m.get("success"):
                    raise RuntimeError(f"{type_}: {(m.get('error') or {}).get('message', 'failed')}")
                return m.get("result")

    def close(self) -> None:
        try:
            self.sock.close()
        except OSError:
            pass


def ws(token: str) -> HAWebSocket:
    return HAWebSocket(token)


# ====================================================================== device inventory
def device_inventory(token: str, states: list) -> list[dict]:
    c = ws(token)
    try:
        devices = c.call("config/device_registry/list") or []
        entities = c.call("config/entity_registry/list") or []
        areas = {a["area_id"]: a.get("name") for a in (c.call("config/area_registry/list") or [])}
    finally:
        c.close()
    st = {s["entity_id"]: s.get("state") for s in states or []}
    per: dict[str, list] = {}
    for e in entities:
        if e.get("device_id") and not e.get("disabled_by"):
            per.setdefault(e["device_id"], []).append(st.get(e["entity_id"]))
    out = []
    for d in devices:
        if d.get("entry_type") == "service" or d.get("disabled_by"):
            continue
        es = per.get(d["id"], [])
        unavailable = sum(1 for s in es if s == "unavailable")
        out.append({"name": d.get("name_by_user") or d.get("name"), "manufacturer": d.get("manufacturer"),
                    "model": d.get("model"), "model_id": d.get("model_id"), "sw_version": d.get("sw_version"),
                    "hw_version": d.get("hw_version"), "serial_number": d.get("serial_number"),
                    "area": areas.get(d.get("area_id")), "entities": len(es), "unavailable": unavailable,
                    "offline": bool(es) and unavailable == len(es),
                    "connections": [c[0] for c in d.get("connections") or []][:3]})
    out.sort(key=lambda x: (not x["offline"], str(x["manufacturer"] or "~"), str(x["name"] or "")))
    return out[:800]


# ====================================================================== safe updates
HEALTH_WAIT_MIN = float(os.environ.get("AJN_HEALTH_WAIT_MIN", "10"))   # how long HA may take to come back


def wait_core_healthy(supervisor, minutes: float = HEALTH_WAIT_MIN) -> bool:
    deadline = time.time() + minutes * 60
    time.sleep(min(20, minutes * 20))
    while time.time() < deadline:
        try:
            r = supervisor("GET", "/core/api/", timeout=10)
            if isinstance(r, dict) and "API running" in str(r.get("message", "")):
                return True
        except Exception:  # noqa: BLE001
            pass
        time.sleep(10)
    return False


def safe_update_core(supervisor, args: dict, timeout: int) -> tuple[str, str, str]:
    before = supervisor("GET", "/core/info").get("version")
    backup_slug = None
    if args.get("backup", "true") != "false":
        res = supervisor("POST", "/backups/new/partial", {
            "name": f"AJ Netweb pre-update {before}", "homeassistant": True, "folders": [], "addons": [],
            "homeassistant_exclude_database": True}, timeout=1800)
        backup_slug = res.get("slug")
    body = {"version": args["version"]} if args.get("version") else {}
    supervisor("POST", "/core/update", body, timeout=timeout)
    after = supervisor("GET", "/core/info").get("version")
    if wait_core_healthy(supervisor):
        return "ok", f"Home Assistant {before} -> {after}" + (f" (backup {backup_slug})" if backup_slug else ""), ""
    if backup_slug and args.get("rollback", "true") != "false":
        supervisor("POST", f"/backups/{backup_slug}/restore/partial", {"homeassistant": True}, timeout=3600)
        ok = wait_core_healthy(supervisor)
        return "error", (f"{after} did not start; rolled back to {before} "
                         f"({'healthy' if ok else 'still unhealthy - check on site'})"), ""
    return "error", f"Home Assistant {after} is not responding after the update", ""


def pre_backup(supervisor, label: str) -> str | None:
    res = supervisor("POST", "/backups/new/partial", {
        "name": f"AJ Netweb pre-update {label}", "homeassistant": True, "folders": [], "addons": [],
        "homeassistant_exclude_database": True}, timeout=1800)
    return res.get("slug")


# ====================================================================== diagnostics
def _tcp_ms(host: str, port: int, tries: int = 5) -> float | None:
    vals = []
    for _ in range(tries):
        t0 = time.perf_counter()
        try:
            with socket.create_connection((host, port), timeout=5):
                vals.append((time.perf_counter() - t0) * 1000)
        except OSError:
            pass
        time.sleep(0.2)
    return round(sorted(vals)[len(vals) // 2], 1) if vals else None


def hub_latency(state: dict) -> float | None:
    tun = state.get("tunnel") or {}
    if not tun.get("server_addr"):
        return None
    return _tcp_ms(tun["server_addr"], int(tun.get("server_port", 7000)), tries=1)


def diagnostics(supervisor, server_conn, state: dict, token: str, allowed: bool) -> dict:
    out: dict = {"at": datetime.now(timezone.utc).isoformat(timespec="seconds")}
    tun = state.get("tunnel") or {}
    api_host = server_conn.host
    t0 = time.perf_counter()
    try:
        socket.getaddrinfo(api_host, 443)
        out["dns_ms"] = round((time.perf_counter() - t0) * 1000, 1)
    except OSError as e:
        out["dns_error"] = str(e)
    if tun.get("server_addr"):
        out["hub_tcp_ms"] = _tcp_ms(tun["server_addr"], int(tun.get("server_port", 7000)))
    # throughput to the hub over the same TLS path the tunnel uses
    try:
        n = 5_000_000
        t0 = time.perf_counter()
        got = server_conn.download(f"/api/v1/agent/speedtest?bytes={n}")
        dt = time.perf_counter() - t0
        out["download_mbps"] = round(got * 8 / dt / 1e6, 1)
        payload = os.urandom(2_000_000)
        t0 = time.perf_counter()
        server_conn.upload("/api/v1/agent/speedtest", payload)
        out["upload_mbps"] = round(len(payload) * 8 / (time.perf_counter() - t0) / 1e6, 1)
    except Exception as e:  # noqa: BLE001
        out["throughput_error"] = str(e)[:200]
    try:
        for itf in (supervisor("GET", "/network/info") or {}).get("interfaces") or []:
            if itf.get("primary"):
                out["interface"] = {"name": itf.get("interface"), "type": itf.get("type")}
                wifi = itf.get("wifi") or {}
                if wifi:
                    out["wifi"] = {"ssid": wifi.get("ssid") if allowed else None, "signal": wifi.get("signal")}
    except Exception as e:  # noqa: BLE001
        out["network_error"] = str(e)[:200]
    try:
        c = ws(token)
        try:
            zha = c.call("zha/devices")
        finally:
            c.close()
        lqis = [d.get("lqi") for d in zha or [] if isinstance(d.get("lqi"), (int, float))]
        weak = [d for d in zha or [] if isinstance(d.get("lqi"), (int, float)) and d["lqi"] < 80]
        out["zigbee"] = {"devices": len(zha or []), "avg_lqi": round(sum(lqis) / len(lqis)) if lqis else None,
                         "weak_links": len(weak)}
        if allowed:
            out["zigbee"]["weak"] = [{"name": d.get("user_given_name") or d.get("name"), "lqi": d.get("lqi")}
                                     for d in weak[:20]]
    except Exception:  # noqa: BLE001
        out["zigbee"] = None   # ZHA not installed (Zigbee2MQTT reports through MQTT instead)
    return out


# ====================================================================== configuration templates
def apply_template(supervisor, tpl: dict) -> tuple[str, str, str]:
    written, originals = [], {}
    log_lines = []
    # validate every path BEFORE writing anything; resolve symlinks so a link planted inside an allowed
    # folder can never redirect a write to configuration.yaml, secrets.yaml or outside /homeassistant
    root = os.path.realpath(HA_CONFIG_DIR)
    plan = []
    for f in tpl.get("files") or []:
        rel = str(f.get("path", ""))
        if ".." in rel or rel.startswith("/") or "\\" in rel or not rel.startswith(TEMPLATE_PREFIXES):
            return "rejected", f"template path not allowed: {rel}", ""
        dst = os.path.realpath(os.path.join(root, rel))
        # compare against the *unresolved* allowed folders: any symlink anywhere on the path changes realpath
        allowed_dirs = [os.path.join(root, p) for p in TEMPLATE_PREFIXES]
        if not any(dst.startswith(a) for a in allowed_dirs):
            return "rejected", f"template path escapes the allowed folders: {rel}", ""
        plan.append((dst, rel, str(f.get("content", ""))))
    try:
        for dst, rel, content in plan:
            if os.path.exists(dst):
                with open(dst, "rb") as fh:
                    originals[dst] = fh.read()
            os.makedirs(os.path.dirname(dst), exist_ok=True)
            with open(dst, "w", encoding="utf-8") as fh:
                fh.write(content)
            written.append(dst)
            log_lines.append(f"wrote {rel}")
        installed = {a["slug"] for a in supervisor("GET", "/addons").get("addons", [])}
        for slug in tpl.get("addons") or []:
            if slug not in installed:
                supervisor("POST", f"/store/addons/{slug}/install", {}, timeout=1800)
                log_lines.append(f"installed add-on {slug}")
        supervisor("POST", "/core/check", {}, timeout=300)
    except Exception as e:  # noqa: BLE001
        for dst in written:
            if dst in originals:
                with open(dst, "wb") as fh:
                    fh.write(originals[dst])
            elif os.path.exists(dst):
                os.unlink(dst)
        return "error", f"template '{tpl.get('name')}' rolled back: {e}"[:400], "\n".join(log_lines)
    if tpl.get("reload") == "restart":
        supervisor("POST", "/core/restart", {}, timeout=600)
        log_lines.append("Home Assistant restarted")
    elif tpl.get("reload") == "reload":
        supervisor("POST", "/core/api/services/homeassistant/reload_all", {}, timeout=300)
        log_lines.append("configuration reloaded")
    return "ok", f"template '{tpl.get('name')}' applied ({len(written)} file(s))", "\n".join(log_lines)


# ====================================================================== cloud backups
def _sup_conn():
    return http.client.HTTPConnection("supervisor", 80, timeout=600)


def backup_upload(supervisor, server_conn, sup_token: str, password: str, ha_version: str) -> tuple[str, str, str]:
    name = f"AJ Netweb cloud {datetime.now().strftime('%Y-%m-%d %H:%M')}"
    res = supervisor("POST", "/backups/new/full", {"name": name, "password": password, "compressed": True},
                     timeout=7200)
    slug = res["slug"]
    c = _sup_conn()
    try:
        c.request("GET", f"/backups/{slug}/download", headers={"Authorization": f"Bearer {sup_token}"})
        r = c.getresponse()
        if r.status != 200:
            raise RuntimeError(f"backup download from Supervisor failed: HTTP {r.status}")
        length = r.getheader("Content-Length")
        q = urllib.parse.urlencode({"name": name, "ha_slug": slug, "ha_version": ha_version})
        result = server_conn.stream_upload(f"/api/v1/agent/backups?{q}", r, int(length) if length else None)
    except Exception:
        # don't leave a full backup behind on the device's disk for every failed attempt
        try:
            supervisor("DELETE", f"/backups/{slug}")
        except Exception:  # noqa: BLE001
            pass
        raise
    finally:
        c.close()
    # keep only the newest local cloud copy to save disk space on the device
    for b in sorted((supervisor("GET", "/backups").get("backups") or []), key=lambda b: b.get("date") or ""):
        if str(b.get("name", "")).startswith("AJ Netweb cloud") and b.get("slug") != slug:
            try:
                supervisor("DELETE", f"/backups/{b['slug']}")
            except Exception:  # noqa: BLE001
                pass
    return "ok", f"cloud backup stored ({result.get('size', 0) / 1024 ** 2:.1f} MB, id {result.get('id')})", ""


def backup_restore(supervisor, server_conn, sup_token: str, password: str, backup_id: str,
                   self_slug: str) -> tuple[str, str, str]:
    resp, conn = server_conn.open_download(f"/api/v1/agent/backups/{backup_id}")
    size = int(resp.getheader("Content-Length") or 0)
    boundary = "ajn" + secrets.token_hex(12)
    pre = (f"--{boundary}\r\nContent-Disposition: form-data; name=\"file\"; filename=\"restore.tar\"\r\n"
           f"Content-Type: application/x-tar\r\n\r\n").encode()
    post = f"\r\n--{boundary}--\r\n".encode()
    c = _sup_conn()
    c.putrequest("POST", "/backups/new/upload")
    c.putheader("Authorization", f"Bearer {sup_token}")
    c.putheader("Content-Type", f"multipart/form-data; boundary={boundary}")
    c.putheader("Content-Length", str(len(pre) + size + len(post)))
    c.endheaders()
    c.send(pre)
    while True:
        chunk = resp.read(1024 * 1024)
        if not chunk:
            break
        c.send(chunk)
    c.send(post)
    r = c.getresponse()
    body = json.loads(r.read() or b"{}")
    conn.close()
    c.close()
    if r.status != 200 or body.get("result") != "ok":
        raise RuntimeError(f"upload to Supervisor failed: {body.get('message') or r.status}")
    slug = (body.get("data") or {}).get("slug")
    info = supervisor("GET", f"/backups/{slug}/info")
    addons = [a["slug"] for a in info.get("addons") or [] if a.get("slug") != self_slug]
    folders = [f for f in info.get("folders") or []]
    supervisor("POST", f"/backups/{slug}/restore/partial",
               {"homeassistant": True, "addons": addons, "folders": folders, "password": password}, timeout=14400)
    return "ok", f"restored backup {backup_id} ({len(addons)} add-ons, {len(folders)} folders; this app kept)", ""


# ====================================================================== temporary technician access
_temp_lock = threading.Lock()


def _load_temp() -> list:
    try:
        with open(TEMP_USERS) as f:
            return json.load(f)
    except (OSError, ValueError):
        return []


def _save_temp(items: list) -> None:
    with open(TEMP_USERS, "w") as f:
        json.dump(items, f)
    os.chmod(TEMP_USERS, 0o600)


def temp_access_create(token: str, minutes: int, admin: bool, public_url: str) -> tuple[str, str, str]:
    minutes = max(15, min(int(minutes or 60), 240))
    expires = datetime.now(timezone.utc) + timedelta(minutes=minutes)
    username = f"ajn-tech-{secrets.token_hex(3)}"
    password = secrets.token_urlsafe(15)
    c = ws(token)
    try:
        user = c.call("config/auth/create", name=f"AJ Netweb technician (until {expires.astimezone():%H:%M})",
                      group_ids=["system-admin" if admin else "system-users"], local_only=False)["user"]
        c.call("config/auth_provider/homeassistant/create", user_id=user["id"], username=username, password=password)
    finally:
        c.close()
    with _temp_lock:
        items = _load_temp()
        items.append({"user_id": user["id"], "username": username, "expires": expires.isoformat()})
        _save_temp(items)
    out = (f"URL:      {public_url}\nUsername: {username}\nPassword: {password}\n"
           f"Role:     {'administrator' if admin else 'user'}\nExpires:  {expires.astimezone():%Y-%m-%d %H:%M %Z}\n")
    return "ok", f"temporary login {username} valid for {minutes} min", out


def temp_access_cleanup(token: str, force_all: bool = False) -> list[str]:
    removed = []
    with _temp_lock:
        items = _load_temp()
        keep = []
        now = datetime.now(timezone.utc)
        for it in items:
            if force_all or datetime.fromisoformat(it["expires"]) <= now:
                try:
                    c = ws(token)
                    try:
                        c.call("config/auth/delete", user_id=it["user_id"])
                    finally:
                        c.close()
                    removed.append(it["username"])
                except Exception as e:  # noqa: BLE001
                    if "not found" in str(e).lower():
                        removed.append(it["username"])
                    else:
                        keep.append(it)
            else:
                keep.append(it)
        _save_temp(keep)
    return removed


class ServerConn:
    """Streaming HTTPS to the AJ Netweb API with the device certificate (for large transfers)."""

    def __init__(self, server: str, data_dir: str = DATA):
        s = server
        if "://" in s:
            s = s.split("://", 1)[1]
        s = s.rstrip("/")
        host, _, port = s.partition(":")
        self.host, self.port, self.data_dir = host, int(port or 443), data_dir

    def _conn(self, timeout: int = 3600):
        ctx = ssl.create_default_context()
        import re
        if re.match(r"^\d+\.\d+\.\d+\.\d+$", self.host) or self.host in ("localhost", "127.0.0.1"):
            ctx.check_hostname = False
            ctx.verify_mode = ssl.CERT_NONE
        if os.path.exists(f"{self.data_dir}/client.crt") and os.path.exists(f"{self.data_dir}/client.key"):
            ctx.load_cert_chain(f"{self.data_dir}/client.crt", f"{self.data_dir}/client.key")
        return http.client.HTTPSConnection(self.host, self.port, context=ctx, timeout=timeout)

    def download(self, path: str) -> int:
        c = self._conn(120)
        c.request("GET", path)
        r = c.getresponse()
        n = 0
        while chunk := r.read(262144):
            n += len(chunk)
        c.close()
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return n

    def upload(self, path: str, payload: bytes) -> dict:
        c = self._conn(120)
        c.request("POST", path, body=payload, headers={"Content-Type": "application/octet-stream"})
        r = c.getresponse()
        body = r.read()
        c.close()
        if r.status != 200:
            raise RuntimeError(f"HTTP {r.status}")
        return json.loads(body or b"{}")

    def stream_upload(self, path: str, src, length: int | None) -> dict:
        c = self._conn(7200)
        c.putrequest("POST", path)
        c.putheader("Content-Type", "application/x-tar")
        if length is not None:
            c.putheader("Content-Length", str(length))
        else:
            c.putheader("Transfer-Encoding", "chunked")
        c.endheaders()
        while chunk := src.read(1024 * 1024):
            c.send(chunk if length is not None else f"{len(chunk):X}\r\n".encode() + chunk + b"\r\n")
        if length is None:
            c.send(b"0\r\n\r\n")
        r = c.getresponse()
        body = r.read()
        c.close()
        if r.status != 200:
            raise RuntimeError(f"upload failed: HTTP {r.status} {body[:200]!r}")
        return json.loads(body or b"{}")

    def open_download(self, path: str):
        c = self._conn(7200)
        c.request("GET", path)
        r = c.getresponse()
        if r.status != 200:
            c.close()
            raise RuntimeError(f"download failed: HTTP {r.status}")
        return r, c
