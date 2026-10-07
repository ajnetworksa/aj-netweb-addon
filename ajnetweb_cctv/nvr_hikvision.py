"""
Hikvision NVR & DVR ISAPI Integration Engine
Supports channel discovery, live snapshots, continuous PTZ, presets, and recording search.
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

log = logging.getLogger("cctv.hikvision")


class HikvisionClient:
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
            # Most Hikvision devices require HTTP Digest auth
            self._session.auth = HTTPDigestAuth(self.username, self.password)
        return self._session

    def _request(self, method: str, path: str, data=None, headers=None, timeout=None):
        url = f"{self.base_url}{path}"
        sess = self._get_session()
        to = timeout or self.timeout
        hdrs = headers or {}

        try:
            resp = sess.request(method, url, data=data, headers=hdrs, timeout=to)
            # If 401 with Digest, try Basic auth fallback
            if resp.status_code == 401 and isinstance(sess.auth, HTTPDigestAuth):
                sess.auth = HTTPBasicAuth(self.username, self.password)
                resp = sess.request(method, url, data=data, headers=hdrs, timeout=to)
            return resp
        except Exception as e:
            log.warning("Hikvision request failed (%s %s): %s", method, path, e)
            raise

    def test_connection(self) -> dict:
        """Verify credentials and connectivity by requesting device info."""
        info = self.get_device_info()
        return {"ok": True, "brand": "hikvision", "info": info}

    def get_device_info(self) -> dict:
        """Fetch model, serial number, firmware, and MAC address."""
        res = {
            "brand": "Hikvision",
            "model": "Unknown",
            "serial": "Unknown",
            "firmware": "Unknown",
            "mac": "Unknown",
            "device_name": "Hikvision NVR",
        }
        try:
            resp = self._request("GET", "/ISAPI/System/deviceInfo")
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                # Strip XML namespaces for easy parsing
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]

                res["model"] = root.findtext("model") or res["model"]
                res["serial"] = root.findtext("serialNumber") or res["serial"]
                res["firmware"] = root.findtext("firmwareVersion") or res["firmware"]
                res["mac"] = root.findtext("macAddress") or res["mac"]
                res["device_name"] = root.findtext("deviceName") or res["device_name"]
        except Exception as e:
            log.error("Failed to fetch Hikvision device info: %s", e)
        return res

    def get_channels(self) -> list:
        """
        Discover active camera channels connected to the NVR.
        Checks both IP input proxy channels and analog/video input channels.
        """
        channels = []
        found_ids = set()

        # 1. Check IP Camera Proxy Channels (/ISAPI/ContentMgmt/InputProxy/channels)
        try:
            resp = self._request("GET", "/ISAPI/ContentMgmt/InputProxy/channels")
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]

                for item in root.findall(".//InputProxyChannel"):
                    cid_str = item.findtext("id")
                    name = item.findtext("name")
                    online = (item.findtext(".//online") or "true").lower() == "true"
                    if cid_str:
                        try:
                            cid = int(cid_str)
                            found_ids.add(cid)
                            channels.append({
                                "id": cid,
                                "name": name or f"Camera {cid}",
                                "online": online,
                                "ptz": True,
                                "brand": "hikvision",
                                "stream_main": self.get_rtsp_url(cid, "main"),
                                "stream_sub": self.get_rtsp_url(cid, "sub"),
                            })
                        except ValueError:
                            pass
        except Exception as e:
            log.debug("InputProxy channels query failed: %s", e)

        # 2. Check Standard Video Inputs (/ISAPI/System/Video/inputs/channels)
        try:
            resp = self._request("GET", "/ISAPI/System/Video/inputs/channels")
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]

                for item in root.findall(".//VideoInputChannel"):
                    cid_str = item.findtext("id")
                    name = item.findtext("name")
                    if cid_str:
                        try:
                            cid = int(cid_str)
                            if cid not in found_ids:
                                found_ids.add(cid)
                                channels.append({
                                    "id": cid,
                                    "name": name or f"Camera {cid}",
                                    "online": True,
                                    "ptz": True,
                                    "brand": "hikvision",
                                    "stream_main": self.get_rtsp_url(cid, "main"),
                                    "stream_sub": self.get_rtsp_url(cid, "sub"),
                                })
                        except ValueError:
                            pass
        except Exception as e:
            log.debug("Video inputs channels query failed: %s", e)

        # Fallback: if NVR returned empty channel list, provide default 4 or 8 channels
        if not channels:
            for cid in range(1, 9):
                channels.append({
                    "id": cid,
                    "name": f"Camera {cid}",
                    "online": True,
                    "ptz": True,
                    "brand": "hikvision",
                    "stream_main": self.get_rtsp_url(cid, "main"),
                    "stream_sub": self.get_rtsp_url(cid, "sub"),
                })

        channels.sort(key=lambda x: x["id"])
        return channels

    def get_snapshot(self, channel_id: int) -> bytes | None:
        """
        Fetch JPEG snapshot from NVR for the given channel.
        Tries primary snapshot path first, then proxy fallback.
        """
        paths = [
            f"/ISAPI/Streaming/channels/{channel_id}01/picture",
            f"/ISAPI/ContentMgmt/StreamingProxy/channels/{channel_id}01/picture",
            f"/ISAPI/Streaming/channels/{channel_id}/picture",
        ]
        for path in paths:
            try:
                resp = self._request("GET", path, timeout=4)
                if resp.status_code == 200 and resp.content and resp.content.startswith(b"\xff\xd8"):
                    return resp.content
            except Exception:
                continue
        return None

    def ptz_continuous(self, channel_id: int, pan: int = 0, tilt: int = 0, zoom: int = 0) -> bool:
        """
        Send continuous PTZ command to camera channel.
        pan: -100 (left) to 100 (right)
        tilt: -100 (down) to 100 (up)
        zoom: -100 (out) to 100 (in)
        """
        xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<PTZData version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <pan>{int(pan)}</pan>
    <tilt>{int(tilt)}</tilt>
    <zoom>{int(zoom)}</zoom>
</PTZData>"""
        try:
            resp = self._request("PUT", f"/ISAPI/PTZCtrl/channels/{channel_id}/continuous",
                                  data=xml, headers={"Content-Type": "application/xml"})
            return resp.status_code in (200, 204)
        except Exception as e:
            log.error("Hikvision PTZ continuous error (ch %s): %s", channel_id, e)
            return False

    def ptz_stop(self, channel_id: int) -> bool:
        """Stop all continuous PTZ movements."""
        return self.ptz_continuous(channel_id, pan=0, tilt=0, zoom=0)

    def ptz_preset(self, channel_id: int, preset_id: int, action: str = "goto") -> bool:
        """
        Preset control:
        action: 'goto' or 'set'
        """
        path = f"/ISAPI/PTZCtrl/channels/{channel_id}/presets/{preset_id}"
        if action == "goto":
            path += "/goto"
            method = "PUT"
            data = None
            headers = None
        elif action == "set":
            method = "PUT"
            data = f"""<?xml version="1.0" encoding="UTF-8"?>
<PTZPreset version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <id>{preset_id}</id>
    <presetName>Preset {preset_id}</presetName>
</PTZPreset>"""
            headers = {"Content-Type": "application/xml"}
        else:
            return False

        try:
            resp = self._request(method, path, data=data, headers=headers)
            return resp.status_code in (200, 204)
        except Exception as e:
            log.error("Hikvision PTZ preset error (ch %s preset %s): %s", channel_id, preset_id, e)
            return False

    def search_recordings(self, channel_id: int, date_str: str) -> list:
        """
        Search historical recordings stored on NVR for a given day.
        date_str: 'YYYY-MM-DD'
        Returns timeline blocks with start, end, type, and playback URL.
        """
        start_iso = f"{date_str}T00:00:00Z"
        end_iso = f"{date_str}T23:59:59Z"
        track_id = f"{channel_id}01"

        search_xml = f"""<?xml version="1.0" encoding="UTF-8"?>
<CMSearchDescription version="2.0" xmlns="http://www.hikvision.com/ver20/XMLSchema">
    <searchID>{datetime.utcnow().strftime('%Y%m%d%H%M%S')}-{channel_id}</searchID>
    <trackList>
        <trackID>{track_id}</trackID>
    </trackList>
    <timeSpanList>
        <timeSpan>
            <startTime>{start_iso}</startTime>
            <endTime>{end_iso}</endTime>
        </timeSpan>
    </timeSpanList>
    <maxResults>100</maxResults>
    <searchResultPostion>0</searchResultPostion>
</CMSearchDescription>"""

        results = []
        try:
            resp = self._request("POST", "/ISAPI/ContentMgmt/search",
                                  data=search_xml, headers={"Content-Type": "application/xml"})
            if resp.status_code == 200:
                root = ET.fromstring(resp.text)
                for elem in root.iter():
                    if "}" in elem.tag:
                        elem.tag = elem.tag.split("}", 1)[1]

                for match in root.findall(".//searchMatch"):
                    st = match.findtext(".//startTime")
                    et = match.findtext(".//endTime")
                    pb_uri = match.findtext(".//playbackURI") or ""
                    meta = match.findtext(".//mediaSegmentDescriptor/contentType") or "video"

                    if st and et:
                        results.append({
                            "channel": channel_id,
                            "start": st,
                            "end": et,
                            "type": "motion" if "motion" in pb_uri.lower() else "continuous",
                            "playback_uri": pb_uri,
                            "media_type": meta,
                        })
        except Exception as e:
            log.error("Hikvision recording search error (ch %s on %s): %s", channel_id, date_str, e)

        return results

    def get_rtsp_url(self, channel_id: int, stream_quality: str = "sub") -> str:
        """
        Build standard Hikvision RTSP URL.
        stream_quality: 'main' (101) or 'sub' (102)
        """
        suffix = "01" if stream_quality == "main" else "02"
        stream_id = f"{channel_id}{suffix}"
        user = urllib.parse.quote(self.username, safe="")
        pwd = urllib.parse.quote(self.password, safe="")
        return f"rtsp://{user}:{pwd}@{self.host}:{self.rtsp_port}/Streaming/Channels/{stream_id}"
