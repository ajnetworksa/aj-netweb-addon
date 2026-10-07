"""
Hikvision Video Intercom & Door Station ISAPI Client
Supports Remote Door Release, Call Status Monitoring, Event Long-Polling & Snapshots.
"""

import logging
import re
import urllib.parse
import xml.etree.ElementTree as ET
from datetime import datetime

try:
    import requests
    from requests.auth import HTTPBasicAuth, HTTPDigestAuth
except ImportError:
    requests = None

log = logging.getLogger("intercom.hikvision")


class HikvisionIntercomClient:
    def __init__(self, host: str, port: int = 80, rtsp_port: int = 554,
                 username: str = "admin", password: str = "", timeout: int = 8):
        self.host = host.strip()
        self.port = int(port or 80)
        self.rtsp_port = int(rtsp_port or 554)
        self.username = username.strip()
        self.password = password
        self.timeout = timeout
        self.base_url = f"http://{self.host}:{self.port}"
        self._session = None

    def _get_session(self):
        if self._session is None:
            self._session = requests.Session()
            self._session.auth = HTTPDigestAuth(self.username, self.password)
        return self._session

    def _request(self, method: str, path: str, data=None, headers=None, timeout=None, stream=False):
        url = f"{self.base_url}{path}"
        sess = self._get_session()
        to = timeout or self.timeout
        hdrs = headers or {}

        try:
            resp = sess.request(method, url, data=data, headers=hdrs, timeout=to, stream=stream)
            if resp.status_code == 401 and isinstance(sess.auth, HTTPDigestAuth):
                sess.auth = HTTPBasicAuth(self.username, self.password)
                resp = sess.request(method, url, data=data, headers=hdrs, timeout=to, stream=stream)
            return resp
        except Exception as e:
            log.warning("Hikvision intercom request failed (%s %s): %s", method, path, e)
            raise

    def get_device_info(self) -> dict:
        """Fetch model, serial number, and firmware version."""
        res = {
            "brand": "Hikvision",
            "model": "Unknown Intercom",
            "serial": "Unknown",
            "firmware": "Unknown",
            "device_name": "Hikvision Door Station",
        }
        try:
            resp = self._request("GET", "/ISAPI/System/deviceInfo")
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]
                res["model"] = root.findtext("model") or res["model"]
                res["serial"] = root.findtext("serialNumber") or res["serial"]
                res["firmware"] = root.findtext("firmwareVersion") or res["firmware"]
                res["device_name"] = root.findtext("deviceName") or res["device_name"]
        except Exception as e:
            log.error("Failed to query Hikvision device info: %s", e)
        return res

    def get_call_status(self) -> dict:
        """
        Check current call status (idle, ring, onCall).
        """
        try:
            resp = self._request("GET", "/ISAPI/VideoIntercom/callStatus?format=json", timeout=3)
            if resp.status_code == 200:
                data = resp.json()
                status = (data.get("CallStatus") or {}).get("status", "idle")
                return {"status": status, "raw": data}
        except Exception:
            pass

        # XML fallback
        try:
            resp = self._request("GET", "/ISAPI/VideoIntercom/callStatus", timeout=3)
            if resp.status_code == 200 and "<status>" in resp.text:
                m = re.search(r"<status>(.*?)</status>", resp.text)
                if m:
                    return {"status": m.group(1).strip()}
        except Exception:
            pass

        return {"status": "idle"}

    def unlock_door(self, door_id: int = 1) -> bool:
        """
        Trigger electric strike / relay release for specified door.
        door_id: 1 (Main Gate / Door 1) or 2 (Pedestrian / Door 2)
        """
        xml = """<?xml version="1.0" encoding="UTF-8"?>
<RemoteControlDoor version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <cmd>open</cmd>
</RemoteControlDoor>"""
        try:
            resp = self._request("PUT", f"/ISAPI/AccessControl/RemoteControl/door/{door_id}",
                                  data=xml, headers={"Content-Type": "application/xml"}, timeout=5)
            if resp.status_code in (200, 204):
                log.info("Hikvision Door %s successfully unlocked via ISAPI.", door_id)
                return True
        except Exception as e:
            log.error("Hikvision door %s unlock failed: %s", door_id, e)
        return False

    def call_signal(self, cmd_type: str = "hangUp") -> bool:
        """
        Interact with incoming call:
        cmd_type: 'answer' | 'reject' | 'hangUp'
        """
        payload = {"CallSignal": {"cmdType": cmd_type}}
        try:
            resp = self._request("PUT", "/ISAPI/VideoIntercom/callSignal?format=json",
                                  json=payload, timeout=4)
            return resp.status_code in (200, 204)
        except Exception as e:
            log.error("Hikvision call signal failed (%s): %s", cmd_type, e)
            return False

    def get_snapshot(self) -> bytes | None:
        """Fetch real-time camera snapshot from door station."""
        paths = [
            "/ISAPI/Streaming/channels/101/picture",
            "/ISAPI/System/Video/inputs/channels/1/picture",
            "/ISAPI/Streaming/channels/1/picture",
        ]
        for path in paths:
            try:
                resp = self._request("GET", path, timeout=4)
                if resp.status_code == 200 and resp.content and resp.content.startswith(b"\xff\xd8"):
                    return resp.content
            except Exception:
                continue
        return None

    def get_rtsp_url(self) -> str:
        """Build standard RTSP URL for door station camera."""
        user = urllib.parse.quote(self.username, safe="")
        pwd = urllib.parse.quote(self.password, safe="")
        return f"rtsp://{user}:{pwd}@{self.host}:{self.rtsp_port}/Streaming/Channels/101"

    def listen_alert_stream(self, event_callback):
        """
        Persistent background listener for /ISAPI/Event/notification/alertStream.
        Invokes event_callback(event_type, details) when rings or door releases occur.
        """
        log.info("Connecting to Hikvision alertStream event listener...")
        try:
            resp = self._request("GET", "/ISAPI/Event/notification/alertStream", stream=True, timeout=90)
            if resp.status_code != 200:
                log.warning("alertStream returned HTTP %s", resp.status_code)
                return

            buf = ""
            for chunk in resp.iter_lines(decode_unicode=True):
                if not chunk:
                    continue
                buf += chunk + "\n"
                if "</EventNotificationAlert>" in buf:
                    # Parse event block
                    m_type = re.search(r"<eventType>(.*?)</eventType>", buf)
                    m_state = re.search(r"<eventState>(.*?)</eventState>", buf)
                    m_sub = re.search(r"<subEventType>(.*?)</subEventType>", buf)

                    ev_type = m_type.group(1) if m_type else "unknown"
                    ev_state = m_state.group(1) if m_state else "active"
                    sub_type = m_sub.group(1) if m_sub else ""

                    # Map event
                    event_name = None
                    if "videocall" in ev_type.lower() or "bell" in ev_type.lower():
                        event_name = "ring"
                    elif "accesscontroller" in ev_type.lower() or "door" in ev_type.lower():
                        event_name = "door_unlocked"
                    elif "tamper" in ev_type.lower():
                        event_name = "tamper"

                    if event_name:
                        event_callback({
                            "event": event_name,
                            "type": ev_type,
                            "state": ev_state,
                            "sub_type": sub_type,
                            "timestamp": datetime.utcnow().isoformat() + "Z",
                        })
                    buf = ""
        except Exception as e:
            log.warning("Hikvision alertStream disconnected: %s", e)
