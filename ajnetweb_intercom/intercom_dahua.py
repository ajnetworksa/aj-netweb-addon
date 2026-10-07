"""
Dahua & Amcrest VTO Video Intercom & Door Station CGI Client
Supports Remote Door Release, Call Status Monitoring, Event Attachment & Snapshots.
"""

import logging
import re
import urllib.parse
from datetime import datetime

try:
    import requests
    from requests.auth import HTTPBasicAuth, HTTPDigestAuth
except ImportError:
    requests = None

log = logging.getLogger("intercom.dahua")


class DahuaIntercomClient:
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

    def _request(self, method: str, path: str, params=None, data=None, timeout=None, stream=False):
        url = f"{self.base_url}{path}"
        sess = self._get_session()
        to = timeout or self.timeout

        try:
            resp = sess.request(method, url, params=params, data=data, timeout=to, stream=stream)
            if resp.status_code == 401 and isinstance(sess.auth, HTTPDigestAuth):
                sess.auth = HTTPBasicAuth(self.username, self.password)
                resp = sess.request(method, url, params=params, data=data, timeout=to, stream=stream)
            return resp
        except Exception as e:
            log.warning("Dahua VTO request failed (%s %s): %s", method, path, e)
            raise

    def get_device_info(self) -> dict:
        """Fetch model and serial number."""
        res = {
            "brand": "Dahua",
            "model": "VTO Door Station",
            "serial": "Unknown",
            "firmware": "Unknown",
            "device_name": "Dahua Video Doorbell",
        }
        try:
            resp = self._request("GET", "/cgi-bin/magicBox.cgi", params={"action": "getSystemInfo"})
            if resp.status_code == 200:
                for line in resp.text.splitlines():
                    if "=" in line:
                        k, v = line.split("=", 1)
                        k = k.strip()
                        v = v.strip()
                        if k == "deviceType":
                            res["model"] = v
                        elif k == "serialNumber":
                            res["serial"] = v
                        elif k == "version":
                            res["firmware"] = v

            resp_dev = self._request("GET", "/cgi-bin/magicBox.cgi", params={"action": "getDeviceType"})
            if resp_dev.status_code == 200 and "=" in resp_dev.text:
                res["device_name"] = resp_dev.text.split("=", 1)[1].strip() or res["device_name"]
        except Exception as e:
            log.error("Failed to query Dahua VTO device info: %s", e)
        return res

    def get_call_status(self) -> dict:
        """Query current call state."""
        try:
            resp = self._request("GET", "/cgi-bin/intercom.cgi", params={"action": "callStatus"}, timeout=3)
            if resp.status_code == 200:
                # Returns e.g. status=Calling or status=Idle
                st = "idle"
                if "Calling" in resp.text or "Ring" in resp.text:
                    st = "ring"
                elif "InCall" in resp.text:
                    st = "onCall"
                return {"status": st, "raw": resp.text.strip()}
        except Exception:
            pass
        return {"status": "idle"}

    def unlock_door(self, door_id: int = 1) -> bool:
        """
        Trigger electric strike / relay release.
        door_id: 1 or 2
        """
        params = {
            "action": "openDoor",
            "channel": door_id,
            "UserID": "101",
            "Type": "Remote",
        }
        try:
            resp = self._request("GET", "/cgi-bin/accessControl.cgi", params=params, timeout=5)
            if resp.status_code == 200 and "OK" in resp.text:
                log.info("Dahua VTO Door %s successfully opened.", door_id)
                return True
        except Exception as e:
            log.error("Dahua VTO door %s unlock failed: %s", door_id, e)
        return False

    def hang_up(self) -> bool:
        """End current call session."""
        try:
            resp = self._request("GET", "/cgi-bin/intercom.cgi", params={"action": "hangUp"}, timeout=4)
            return resp.status_code == 200 and "OK" in resp.text
        except Exception as e:
            log.error("Dahua VTO hangup error: %s", e)
            return False

    def get_snapshot(self) -> bytes | None:
        """Fetch camera snapshot from VTO door station."""
        for ch in [1, 0]:
            try:
                resp = self._request("GET", "/cgi-bin/snapshot.cgi", params={"channel": ch}, timeout=4)
                if resp.status_code == 200 and resp.content and resp.content.startswith(b"\xff\xd8"):
                    return resp.content
            except Exception:
                continue
        return None

    def get_rtsp_url(self) -> str:
        """Build standard Dahua RTSP URL."""
        user = urllib.parse.quote(self.username, safe="")
        pwd = urllib.parse.quote(self.password, safe="")
        return f"rtsp://{user}:{pwd}@{self.host}:{self.rtsp_port}/cam/realmonitor?channel=1&subtype=0"

    def listen_event_manager(self, event_callback):
        """
        Persistent background stream to Dahua eventManager.cgi.
        """
        codes = "[CallNoAnswered,Invite,HangUp,DoorStatus,AccessControl]"
        log.info("Connecting to Dahua eventManager listener: %s", codes)
        try:
            resp = self._request("GET", "/cgi-bin/eventManager.cgi",
                                 params={"action": "attach", "codes": codes},
                                 stream=True, timeout=90)
            if resp.status_code != 200:
                log.warning("eventManager returned HTTP %s", resp.status_code)
                return

            for line in resp.iter_lines(decode_unicode=True):
                if not line or not line.startswith("Code="):
                    continue
                # Line example: Code=Invite;action=Start;index=0;data={...}
                m_code = re.search(r"Code=(.*?);", line)
                m_act = re.search(r"action=(.*?);", line)

                code = m_code.group(1) if m_code else ""
                act = m_act.group(1) if m_act else ""

                event_name = None
                if code == "Invite" and act == "Start":
                    event_name = "ring"
                elif code == "AccessControl":
                    event_name = "door_unlocked"
                elif code == "DoorStatus":
                    event_name = "door_status"
                elif code == "HangUp":
                    event_name = "call_ended"

                if event_name:
                    event_callback({
                        "event": event_name,
                        "code": code,
                        "action": act,
                        "raw": line,
                        "timestamp": datetime.utcnow().isoformat() + "Z",
                    })
        except Exception as e:
            log.warning("Dahua eventManager disconnected: %s", e)
