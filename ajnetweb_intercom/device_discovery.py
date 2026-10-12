#!/usr/bin/env python3
"""
AJ Netweb SADP & ONVIF Device Discovery Engine
Discovers Hikvision cameras, NVRs, Villa Door Stations, Indoor Displays, Dahua devices,
and generic ONVIF devices across the local subnet.
"""

import logging
import os
import re
import socket
import struct
import threading
import time
import urllib.parse
import uuid
import xml.etree.ElementTree as ET
from typing import Dict, List, Any, Optional

log = logging.getLogger("device.discovery")

_discovery_cache = {
    "timestamp": 0,
    "devices": [],
    "lock": threading.Lock()
}


def get_arp_table() -> Dict[str, str]:
    """Read local ARP table to map IP -> MAC."""
    arp_map = {}
    try:
        if os.path.exists("/proc/net/arp"):
            with open("/proc/net/arp", "r") as f:
                for line in f:
                    parts = line.split()
                    if len(parts) >= 4 and parts[0] != "IP":
                        ip, flags, hw_type, mac = parts[0], parts[1], parts[2], parts[3]
                        if mac and mac != "00:00:00:00:00:00":
                            arp_map[ip] = mac.lower()
    except Exception as e:
        log.debug("Could not read ARP table: %s", e)
    return arp_map


def classify_device(model: str, desc: str = "") -> tuple[str, str]:
    """Classify device into (category_key, human_readable_label)."""
    text = f"{model} {desc}".upper()
    if any(k in text for k in ["KV8", "KV6", "KV7", "KD8", "KD9", "VTO", "DOORSTATION", "DOOR STATION", "VILLA DOOR"]):
        return "door_station", "Villa Door Station"
    if any(k in text for k in ["KH9", "KH8", "KH6", "VTH", "INDOOR STATION", "INDOOR DISPLAY", "DISPLAY"]):
        return "indoor_station", "Indoor Touch Display"
    if any(k in text for k in ["7604", "7608", "7616", "7716", "7732", "8616", "9632", "NXI", "NVR", "DVR", "XVR"]):
        return "nvr", "Network Video Recorder (NVR)"
    if any(k in text for k in ["H6C", "H3C", "C6N", "TY1", "TY2", "EZVIZ"]):
        return "camera", "Wi-Fi Smart Camera"
    if any(k in text for k in ["PTZ", "SD4", "SD5", "SPEED DOME", "DOMECAM"]):
        return "ptz", "PTZ Speed Dome Camera"
    return "camera", "IP Surveillance Camera"


def scan_network(timeout_sec: float = 2.5, force_refresh: bool = False) -> List[Dict[str, Any]]:
    """
    Scans the local network using:
    1. Hikvision SADP Protocol (UDP 37020 Multicast & Broadcast)
    2. ONVIF WS-Discovery (UDP 3702 Multicast & Broadcast)
    3. ARP table MAC mapping & port verification
    """
    now = time.time()
    with _discovery_cache["lock"]:
        if not force_refresh and (now - _discovery_cache["timestamp"] < 25):
            return list(_discovery_cache["devices"])

    log.info("Starting local SADP & ONVIF device discovery scan...")
    devices: Dict[str, Dict[str, Any]] = {}
    arp_table = get_arp_table()

    # ------------------------------------------------------------- 1. Hikvision SADP
    try:
        sadp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        sadp_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        sadp_sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
        sadp_sock.settimeout(0.8)

        probe_uuid = str(uuid.uuid4())
        sadp_packet = f"""<?xml version="1.0" encoding="utf-8"?><Probe><Uuid>{probe_uuid}</Uuid><Types>inquiry</Types></Probe>""".encode("utf-8")

        for target in [("239.255.255.250", 37020), ("255.255.255.255", 37020)]:
            try:
                sadp_sock.sendto(sadp_packet, target)
            except Exception:
                pass

        sadp_start = time.time()
        while time.time() - sadp_start < timeout_sec:
            try:
                data, addr = sadp_sock.recvfrom(8192)
                text = data.decode("utf-8", errors="replace")
                if "<ProbeMatch" in text:
                    def get_xml_tag(tag: str) -> str:
                        m = re.search(rf"<{tag}>([^<]+)</{tag}>", text)
                        return m.group(1).strip() if m else ""

                    dev_ip = get_xml_tag("IPv4Address") or addr[0]
                    if not dev_ip or dev_ip in ("0.0.0.0", "127.0.0.1"):
                        continue

                    model = get_xml_tag("DeviceDescription") or get_xml_tag("DeviceType")
                    serial = get_xml_tag("DeviceSN")
                    mac = get_xml_tag("MAC") or arp_table.get(dev_ip, "")
                    http_port = int(get_xml_tag("HttpPort") or 80)
                    cmd_port = int(get_xml_tag("CommandPort") or 8000)
                    version = get_xml_tag("SoftwareVersion")
                    activated = get_xml_tag("Activated").lower() in ("true", "1")

                    brand = "Hikvision"
                    if "CS-" in model or "EZVIZ" in model.upper():
                        brand = "EZVIZ"

                    cat_key, cat_label = classify_device(model)

                    devices[dev_ip] = {
                        "ip": dev_ip,
                        "model": model,
                        "brand": brand,
                        "category": cat_key,
                        "category_label": cat_label,
                        "mac": mac,
                        "http_port": http_port,
                        "rtsp_port": 554,
                        "sdk_port": cmd_port,
                        "serial": serial,
                        "version": version,
                        "activated": activated,
                        "protocol": "SADP",
                    }
            except socket.timeout:
                break
            except Exception:
                break
        sadp_sock.close()
    except Exception as e:
        log.warning("SADP discovery socket error: %s", e)

    # ------------------------------------------------------------- 2. ONVIF WS-Discovery
    try:
        onvif_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM, socket.IPPROTO_UDP)
        onvif_sock.setsockopt(socket.SOL_SOCKET, socket.SO_BROADCAST, 1)
        onvif_sock.setsockopt(socket.IPPROTO_IP, socket.IP_MULTICAST_TTL, 4)
        onvif_sock.settimeout(0.8)

        ws_probe = f"""<?xml version="1.0" encoding="UTF-8"?>
<e:Envelope xmlns:e="http://www.w3.org/2003/05/soap-envelope"
            xmlns:w="http://schemas.xmlsoap.org/ws/2004/08/addressing"
            xmlns:d="http://schemas.xmlsoap.org/ws/2005/04/discovery"
            xmlns:dn="http://www.onvif.org/ver10/network/wsdl">
  <e:Header>
    <w:MessageID>uuid:{uuid.uuid4()}</w:MessageID>
    <w:To>urn:schemas-xmlsoap-org:ws:2005:04:discovery</w:To>
    <w:Action>http://schemas.xmlsoap.org/ws/2005/04/discovery/Probe</w:Action>
  </e:Header>
  <e:Body><d:Probe><d:Types>dn:NetworkVideoTransmitter</d:Types></d:Probe></e:Body>
</e:Envelope>""".encode("utf-8")

        for target in [("239.255.255.250", 3702), ("255.255.255.255", 3702)]:
            try:
                onvif_sock.sendto(ws_probe, target)
            except Exception:
                pass

        onvif_start = time.time()
        while time.time() - onvif_start < timeout_sec:
            try:
                data, addr = onvif_sock.recvfrom(8192)
                text = data.decode("utf-8", errors="replace")
                if "ProbeMatch" in text:
                    ip = addr[0]
                    # Parse XAddrs
                    xaddrs_m = re.search(r"<[a-zA-Z0-9:]*XAddrs>([^<]+)</", text)
                    http_port = 80
                    if xaddrs_m:
                        url_m = re.search(r"http://([a-zA-Z0-9\.\-]+)(?::(\d+))?", xaddrs_m.group(1))
                        if url_m:
                            extracted_ip = url_m.group(1)
                            if extracted_ip and extracted_ip not in ("[]", "0.0.0.0"):
                                ip = extracted_ip
                            if url_m.group(2):
                                http_port = int(url_m.group(2))

                    if not ip or ip in ("0.0.0.0", "127.0.0.1"):
                        continue

                    scopes_m = re.search(r"<[a-zA-Z0-9:]*Scopes>([^<]+)</", text)
                    scopes = scopes_m.group(1) if scopes_m else ""

                    brand = "ONVIF"
                    if "dahua" in scopes.lower():
                        brand = "Dahua"
                    elif "hikvision" in scopes.lower():
                        brand = "Hikvision"
                    elif "ezviz" in scopes.lower() or "cs-h" in scopes.lower():
                        brand = "EZVIZ"

                    model = "ONVIF Camera"
                    hw_m = re.search(r"hardware/([a-zA-Z0-9\-_]+)", scopes)
                    if hw_m:
                        model = hw_m.group(1)
                    else:
                        name_m = re.search(r"name/([a-zA-Z0-9\-_]+)", scopes)
                        if name_m:
                            model = name_m.group(1)

                    mac_m = re.search(r"(?:mac|MAC)/([0-9a-fA-F:]{17})", scopes)
                    mac = mac_m.group(1) if mac_m else arp_table.get(ip, "")

                    cat_key, cat_label = classify_device(model)

                    if ip in devices:
                        devices[ip]["protocol"] += " / ONVIF"
                        if not devices[ip].get("mac") and mac:
                            devices[ip]["mac"] = mac
                    else:
                        devices[ip] = {
                            "ip": ip,
                            "model": model,
                            "brand": brand,
                            "category": cat_key,
                            "category_label": cat_label,
                            "mac": mac,
                            "http_port": http_port,
                            "rtsp_port": 554,
                            "sdk_port": 37777 if brand == "Dahua" else 8000,
                            "serial": "",
                            "version": "",
                            "activated": True,
                            "protocol": "ONVIF",
                        }
            except socket.timeout:
                break
            except Exception:
                break
        onvif_sock.close()
    except Exception as e:
        log.warning("ONVIF discovery socket error: %s", e)

    # Fill any remaining MAC addresses from ARP table
    for ip, dev in devices.items():
        if not dev.get("mac") and ip in arp_table:
            dev["mac"] = arp_table[ip]

    # Sort: Door stations & NVRs first, then cameras
    order = {"door_station": 0, "indoor_station": 1, "nvr": 2, "ptz": 3, "camera": 4}
    device_list = list(devices.values())
    device_list.sort(key=lambda d: (order.get(d["category"], 9), d["ip"]))

    with _discovery_cache["lock"]:
        _discovery_cache["timestamp"] = time.time()
        _discovery_cache["devices"] = device_list

    log.info("Discovery complete: %s devices located on local network.", len(device_list))
    return device_list
