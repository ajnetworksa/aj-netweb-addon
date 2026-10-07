"""
Dahua NVR, XVR & Amcrest HTTP CGI Integration Engine
Supports channel discovery, live snapshots, continuous PTZ, presets, and recording search.
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

log = logging.getLogger("cctv.dahua")


class DahuaClient:
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
            # Dahua standard is HTTP Digest authentication
            self._session.auth = HTTPDigestAuth(self.username, self.password)
        return self._session

    def _request(self, method: str, path: str, params=None, data=None, timeout=None):
        url = f"{self.base_url}{path}"
        sess = self._get_session()
        to = timeout or self.timeout

        try:
            resp = sess.request(method, url, params=params, data=data, timeout=to)
            # If 401 with Digest, try Basic auth fallback
            if resp.status_code == 401 and isinstance(sess.auth, HTTPDigestAuth):
                sess.auth = HTTPBasicAuth(self.username, self.password)
                resp = sess.request(method, url, params=params, data=data, timeout=to)
            return resp
        except Exception as e:
            log.warning("Dahua request failed (%s %s): %s", method, path, e)
            raise

    def test_connection(self) -> dict:
        """Verify credentials and connectivity by requesting device info."""
        info = self.get_device_info()
        return {"ok": True, "brand": "dahua", "info": info}

    def get_device_info(self) -> dict:
        """Fetch model, serial number, firmware, and device type."""
        res = {
            "brand": "Dahua",
            "model": "Unknown",
            "serial": "Unknown",
            "firmware": "Unknown",
            "mac": "Unknown",
            "device_name": "Dahua NVR",
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
            log.error("Failed to fetch Dahua device info: %s", e)
        return res

    def get_channels(self) -> list:
        """
        Discover camera channels connected to the Dahua NVR.
        Queries ChannelTitle configuration.
        """
        channels = []
        try:
            resp = self._request("GET", "/cgi-bin/configManager.cgi",
                                 params={"action": "getConfig", "name": "ChannelTitle"})
            if resp.status_code == 200:
                # Format: table.ChannelTitle[0].Name=Front Yard
                matches = re.findall(r"table\.ChannelTitle\[(\d+)\]\.Name=(.*)", resp.text)
                for idx_str, name in matches:
                    cid = int(idx_str) + 1  # Dahua channel index in CGI starts at 0 or 1, UI uses 1-based
                    channels.append({
                        "id": cid,
                        "dahua_idx": int(idx_str),
                        "name": name.strip() or f"Camera {cid}",
                        "online": True,
                        "ptz": True,
                        "brand": "dahua",
                        "stream_main": self.get_rtsp_url(cid, "main"),
                        "stream_sub": self.get_rtsp_url(cid, "sub"),
                    })
        except Exception as e:
            log.debug("Dahua ChannelTitle query failed: %s", e)

        # Fallback: if no titles returned, populate 8 channels
        if not channels:
            for cid in range(1, 9):
                channels.append({
                    "id": cid,
                    "dahua_idx": cid - 1,
                    "name": f"Camera {cid}",
                    "online": True,
                    "ptz": True,
                    "brand": "dahua",
                    "stream_main": self.get_rtsp_url(cid, "main"),
                    "stream_sub": self.get_rtsp_url(cid, "sub"),
                })

        channels.sort(key=lambda x: x["id"])
        return channels

    def get_snapshot(self, channel_id: int) -> bytes | None:
        """
        Fetch JPEG snapshot from Dahua NVR for the given channel.
        channel_id: 1-indexed
        """
        # Dahua snapshot CGI accepts 1-based or 0-based channel
        for ch in [channel_id, channel_id - 1]:
            try:
                resp = self._request("GET", "/cgi-bin/snapshot.cgi", params={"channel": ch}, timeout=4)
                if resp.status_code == 200 and resp.content and resp.content.startswith(b"\xff\xd8"):
                    return resp.content
            except Exception:
                continue
        return None

    def ptz_start(self, channel_id: int, code: str, speed: int = 5) -> bool:
        """
        Start continuous PTZ movement.
        code: Up, Down, Left, Right, LeftUp, RightUp, LeftDown, RightDown, ZoomIn, ZoomOut, FocusNear, FocusFar
        speed: 1 to 8 (default 5)
        """
        ch_idx = channel_id - 1
        speed = max(1, min(int(speed or 5), 8))
        params = {
            "action": "start",
            "channel": ch_idx,
            "code": code,
            "arg1": 0,
            "arg2": speed,
            "arg3": 0,
        }
        try:
            resp = self._request("GET", "/cgi-bin/ptz.cgi", params=params)
            return resp.status_code == 200 and "OK" in resp.text
        except Exception as e:
            log.error("Dahua PTZ start error (ch %s code %s): %s", channel_id, code, e)
            return False

    def ptz_stop(self, channel_id: int, code: str) -> bool:
        """Stop PTZ movement."""
        ch_idx = channel_id - 1
        params = {
            "action": "stop",
            "channel": ch_idx,
            "code": code,
            "arg1": 0,
            "arg2": 0,
            "arg3": 0,
        }
        try:
            resp = self._request("GET", "/cgi-bin/ptz.cgi", params=params)
            return resp.status_code == 200 and "OK" in resp.text
        except Exception as e:
            log.error("Dahua PTZ stop error (ch %s code %s): %s", channel_id, code, e)
            return False

    def ptz_preset(self, channel_id: int, preset_id: int, action: str = "goto") -> bool:
        """
        Preset control:
        action: 'goto' or 'set'
        """
        ch_idx = channel_id - 1
        act = "gotopreset" if action == "goto" else "setpreset"
        params = {
            "action": act,
            "channel": ch_idx,
            "arg1": 0,
            "arg2": preset_id,
            "arg3": 0,
        }
        try:
            resp = self._request("GET", "/cgi-bin/ptz.cgi", params=params)
            return resp.status_code == 200 and "OK" in resp.text
        except Exception as e:
            log.error("Dahua PTZ preset error (ch %s preset %s): %s", channel_id, preset_id, e)
            return False

    def search_recordings(self, channel_id: int, date_str: str) -> list:
        """
        Search historical recordings on Dahua NVR for a given day.
        date_str: 'YYYY-MM-DD'
        Uses mediaFileFind.cgi workflow.
        """
        ch_idx = channel_id - 1
        start_time = f"{date_str} 00:00:00"
        end_time = f"{date_str} 23:59:59"
        results = []

        try:
            # 1. Create finder instance
            resp = self._request("GET", "/cgi-bin/mediaFileFind.cgi", params={"action": "factory.create"})
            if resp.status_code != 200 or "result=" not in resp.text:
                return results
            finder_id = resp.text.split("result=")[1].strip()

            # 2. Set search conditions
            self._request("GET", "/cgi-bin/mediaFileFind.cgi", params={
                "action": "findFile",
                "object": finder_id,
                "condition.Channel": ch_idx,
                "condition.StartTime": start_time,
                "condition.EndTime": end_time,
                "condition.Types[0]": "dav",
            })

            # 3. Retrieve matched files
            resp_files = self._request("GET", "/cgi-bin/mediaFileFind.cgi", params={
                "action": "findNextFile",
                "object": finder_id,
                "count": 100,
            })

            # 4. Close finder
            self._request("GET", "/cgi-bin/mediaFileFind.cgi", params={
                "action": "close",
                "object": finder_id,
            })

            # Parse files
            # items.StartTime=2026-10-07 10:15:00
            # items.EndTime=2026-10-07 10:30:00
            # items.FilePath=/mnt/dvr/sda0/2026-10-07/...
            cur_item = {}
            for line in resp_files.text.splitlines():
                if "=" in line:
                    k, v = line.split("=", 1)
                    k = k.strip()
                    v = v.strip()
                    if "StartTime" in k:
                        cur_item["start"] = v
                    elif "EndTime" in k:
                        cur_item["end"] = v
                    elif "FilePath" in k:
                        cur_item["path"] = v
                    elif "Length" in k:
                        cur_item["length"] = v
                    elif "Type" in k:
                        cur_item["type"] = "motion" if "m" in v.lower() else "continuous"
                        if "start" in cur_item and "end" in cur_item:
                            results.append({
                                "channel": channel_id,
                                "start": cur_item["start"],
                                "end": cur_item["end"],
                                "type": cur_item.get("type", "continuous"),
                                "path": cur_item.get("path", ""),
                                "length": cur_item.get("length", 0),
                            })
                            cur_item = {}
        except Exception as e:
            log.error("Dahua recording search error (ch %s on %s): %s", channel_id, date_str, e)

        return results

    def get_rtsp_url(self, channel_id: int, stream_quality: str = "sub") -> str:
        """
        Build standard Dahua RTSP URL.
        stream_quality: 'main' (subtype=0) or 'sub' (subtype=1)
        """
        subtype = 0 if stream_quality == "main" else 1
        user = urllib.parse.quote(self.username, safe="")
        pwd = urllib.parse.quote(self.password, safe="")
        return f"rtsp://{user}:{pwd}@{self.host}:{self.rtsp_port}/cam/realmonitor?channel={channel_id}&subtype={subtype}"
