#!/usr/bin/env python3
"""
AJ Netweb Dashboard - Native Home Assistant themes.

Every theme uses only documented HA theme variables (no card-mod), so it keeps
working when the HA frontend changes. Variables prefixed `ajn-` are read by the
bundled AJ Netweb cards (glass blur, accent glow) and ignored by everything else.
"""

import logging
import os
import re
from typing import Dict, Optional

import yaml

log = logging.getLogger("dashboard.themes")

THEME_FILE_NAME = "ajnetweb.yaml"


def _mode(bg, base, card, border, text, text2, accent, primary=None, shadow="none",
          radius="20px", blur="0px", header=None, glow="transparent"):
    return {
        "primary-color": primary or accent,
        "accent-color": accent,
        "lovelace-background": bg,
        "primary-background-color": base,
        "secondary-background-color": base,
        "card-background-color": card,
        "ha-card-background": card,
        "ha-card-border-color": border,
        "ha-card-border-width": "1px",
        "ha-card-border-radius": radius,
        "ha-card-box-shadow": shadow,
        "primary-text-color": text,
        "secondary-text-color": text2,
        "divider-color": border,
        "app-header-background-color": header or base,
        "app-header-text-color": text,
        "app-header-selection-bar-color": accent,
        "sidebar-selected-icon-color": accent,
        "sidebar-selected-text-color": accent,
        "state-icon-color": text2,
        "ajn-accent": accent,
        "ajn-glow": glow,
        "ajn-glass-blur": blur,
        "ajn-surface": card,
        "ajn-border": border,
        "ajn-radius": radius,
    }


THEMES: Dict[str, Dict] = {
    "apple_frosted_glass": {
        "name": "AJ Netweb Frosted Glass",
        "label": "Frosted Glass",
        "description": "Translucent iOS-style glass over a soft gradient. Follows the device light/dark setting.",
        "modes": {
            "light": _mode("linear-gradient(160deg, #e8eef6 0%, #f4efe9 55%, #e9f0f2 100%) fixed",
                           "#f2f4f8", "rgba(255, 255, 255, 0.72)", "rgba(255, 255, 255, 0.55)",
                           "#151823", "#5f6577", "#2f7dd1",
                           shadow="0 8px 24px rgba(20, 30, 60, 0.08)", blur="18px",
                           header="rgba(242, 244, 248, 0.85)"),
            "dark": _mode("radial-gradient(1200px 800px at 10% -10%, #1d2a44 0%, transparent 60%), "
                          "radial-gradient(900px 700px at 110% 10%, #2a1f3d 0%, transparent 55%), #0d0f14 fixed",
                          "#0d0f14", "rgba(30, 33, 42, 0.62)", "rgba(255, 255, 255, 0.08)",
                          "#eef1f6", "#9aa3b5", "#5aa9ff",
                          shadow="0 10px 30px rgba(0, 0, 0, 0.35)", blur="18px",
                          header="rgba(13, 15, 20, 0.85)", glow="rgba(90, 169, 255, 0.25)"),
        },
    },
    "cyber_luxury": {
        "name": "AJ Netweb Cyber Luxury",
        "label": "Cyber Luxury",
        "description": "Obsidian glass with cyan accents. Dark only - ideal for showrooms and cinemas.",
        "modes": {
            "dark": _mode("radial-gradient(1000px 600px at 0% 0%, #0b2a3a 0%, transparent 60%), #05070c fixed",
                          "#05070c", "rgba(14, 22, 36, 0.72)", "rgba(0, 229, 255, 0.18)",
                          "#eafcff", "#86a3b4", "#00d8f0",
                          shadow="0 0 0 1px rgba(0,229,255,0.04), 0 12px 30px rgba(0,0,0,0.5)",
                          blur="14px", header="#05070c", glow="rgba(0, 216, 240, 0.35)"),
        },
    },
    "scandinavian_minimal": {
        "name": "AJ Netweb Nordic",
        "label": "Nordic Minimal",
        "description": "Warm neutrals, flat cards and generous spacing. Calm and very readable.",
        "modes": {
            "light": _mode("#f3f0eb", "#f3f0eb", "#fbfaf7", "#e6e0d6", "#2b2722", "#7a7268", "#b07a3c",
                           radius="16px"),
            "dark": _mode("#1b1a18", "#1b1a18", "#252320", "#34312c", "#efe9df", "#a39b8f", "#d29b5a",
                          radius="16px"),
        },
    },
    "modern_bento": {
        "name": "AJ Netweb Bento",
        "label": "Modern Bento",
        "description": "Solid rounded tiles in the style of Apple Home. High contrast on any screen.",
        "modes": {
            "light": _mode("#eceef2", "#eceef2", "#ffffff", "rgba(0,0,0,0.05)", "#111318", "#6b7180", "#0a84ff",
                           radius="24px", shadow="0 1px 2px rgba(0,0,0,0.06)"),
            "dark": _mode("#000000", "#000000", "#1c1c1e", "rgba(255,255,255,0.06)", "#f5f5f7", "#98989f",
                          "#0a84ff", radius="24px"),
        },
    },
    "oled_stealth": {
        "name": "AJ Netweb OLED",
        "label": "OLED Stealth",
        "description": "True black with green accents. Lowest power and glare for always-on wall panels.",
        "modes": {
            "dark": _mode("#000000", "#000000", "#0a0a0a", "#1a1a1a", "#e8e8e8", "#8a8a8a", "#22c55e",
                          radius="16px", header="#000000", glow="rgba(34, 197, 94, 0.25)"),
        },
    },
    "hotel_suite": {
        "name": "AJ Netweb Hospitality",
        "label": "Hospitality",
        "description": "Deep walnut and brass. Built for hotel rooms, serviced apartments and majlis panels.",
        "modes": {
            "dark": _mode("linear-gradient(170deg, #1a1512 0%, #0e0b09 100%) fixed", "#0e0b09",
                          "rgba(34, 27, 22, 0.82)", "rgba(212, 167, 92, 0.22)", "#f6efe4", "#b3a48e",
                          "#d4a75c", radius="18px", blur="10px", glow="rgba(212, 167, 92, 0.25)"),
            "light": _mode("#f6f1e9", "#f6f1e9", "#fffdf9", "#e7dccb", "#2a211a", "#7b6c5b", "#a87a2e",
                           radius="18px"),
        },
    },
}


def theme_name(key: str) -> str:
    return THEMES.get(key, THEMES["apple_frosted_glass"])["name"]


def theme_catalog():
    return [{"key": k, "name": v["name"], "label": v["label"], "description": v["description"],
             "modes": list(v["modes"].keys()),
             "preview": {m: {"bg": c["primary-background-color"], "card": c["ha-card-background"],
                             "accent": c["ajn-accent"], "text": c["primary-text-color"],
                             "border": c["ha-card-border-color"]}
                         for m, c in v["modes"].items()}}
            for k, v in THEMES.items()]


def render_themes_yaml() -> str:
    doc = {}
    for spec in THEMES.values():
        modes = spec["modes"]
        if len(modes) == 1:
            doc[spec["name"]] = dict(next(iter(modes.values())))
        else:
            doc[spec["name"]] = {"modes": modes}
    header = ("# Generated by AJ Netweb Dashboard Suite - do not edit, changes are overwritten.\n"
              "# Uses native Home Assistant theme variables only (no card-mod required).\n")
    return header + yaml.safe_dump(doc, sort_keys=False, allow_unicode=True, width=1000)


def themes_include_status(config_dir: str) -> Dict[str, Optional[str]]:
    """Check that configuration.yaml loads the themes folder."""
    path = os.path.join(config_dir, "configuration.yaml")
    try:
        with open(path, "r", encoding="utf-8") as f:
            text = f.read()
    except OSError:
        return {"ok": None, "detail": "configuration.yaml not readable"}
    if re.search(r"^\s*themes\s*:\s*!include_dir_merge_named\s+themes\s*$", text, re.M):
        return {"ok": True, "detail": "themes folder is loaded"}
    if re.search(r"^\s*themes\s*:", text, re.M):
        return {"ok": None, "detail": "themes are configured differently - make sure the 'themes' folder is merged"}
    return {"ok": False, "detail": "Add to configuration.yaml:\nfrontend:\n  themes: !include_dir_merge_named themes"}


def install_themes(config_dir: str) -> Dict:
    target_dir = os.path.join(config_dir, "themes", "ajnetweb")
    try:
        os.makedirs(target_dir, exist_ok=True)
        path = os.path.join(target_dir, THEME_FILE_NAME)
        with open(path, "w", encoding="utf-8") as f:
            f.write(render_themes_yaml())
        log.info("Installed AJ Netweb themes to %s", path)
        return {"ok": True, "path": path}
    except OSError as e:
        log.warning("Could not write themes: %s", e)
        return {"ok": False, "error": str(e)}
