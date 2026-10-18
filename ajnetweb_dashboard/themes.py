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
          radius="20px", blur="0px", header=None, glow="transparent", surface_on=None, text_on=None,
          sheet=None, nav=None, is_dark=None, surface=None, saturate="1.4", solid=None, highlight=None,
          gradient=None):
    dark = is_dark if is_dark is not None else text.lower() in (
        "#eef1f6", "#eafcff", "#e8e8e8", "#f6efe4", "#efe9df", "#f5f5f7")
    # Dialogs, menus and pickers must stay opaque even when cards are glass, or text becomes unreadable
    if not solid:
        solid = card if not card.startswith("rgba") else (sheet if sheet and not sheet.startswith("rgba") else base)
    return {
        "primary-color": primary or accent,
        "accent-color": accent,
        "lovelace-background": bg,
        "primary-background-color": base,
        "secondary-background-color": base,
        "card-background-color": solid,
        "ha-dialog-surface-background": solid,
        "mdc-theme-surface": solid,
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
        "ajn-surface": surface or card,
        "ajn-glass-saturate": saturate,
        "ajn-highlight": highlight or "transparent",
        "ajn-gradient": gradient or f"linear-gradient(135deg, {accent} 0%, {accent} 100%)",
        "ajn-border": border,
        "ajn-radius": radius,
        # "on" tiles turn bright (Apple Home style); sheet + nav bar surfaces for the UI kit
        "ajn-surface-on": surface_on or ("rgba(255, 255, 255, 0.94)" if dark else "#ffffff"),
        "ajn-text-on": text_on or "#15171c",
        "ajn-sheet-bg": sheet or base,
        "ajn-nav-bg": nav or ("rgba(28, 30, 38, 0.72)" if dark else "rgba(30, 32, 40, 0.78)"),
        "ajn-tile-height": "116px",
    }


THEMES: Dict[str, Dict] = {
    "apple_frosted_glass": {
        "name": "AJ Netweb Frosted Glass",
        "label": "Frosted Glass",
        "description": "Translucent iOS-style glass over a soft gradient. Follows the device light/dark setting.",
        "modes": {
            "light": _mode("linear-gradient(160deg, #e8eef6 0%, #f4efe9 55%, #e9f0f2 100%) fixed",
                           "#f2f4f8", "rgba(255, 255, 255, 0.5)", "rgba(255, 255, 255, 0.6)",
                           "#151823", "#5f6577", "#2f7dd1",
                           shadow="0 8px 24px rgba(20, 30, 60, 0.08)", blur="18px",
                           header="rgba(242, 244, 248, 0.85)", solid="#ffffff"),
            "dark": _mode("radial-gradient(1200px 800px at 10% -10%, #1d2a44 0%, transparent 60%), "
                          "radial-gradient(900px 700px at 110% 10%, #2a1f3d 0%, transparent 55%), #0d0f14 fixed",
                          "#0d0f14", "rgba(44, 47, 58, 0.55)", "rgba(255, 255, 255, 0.07)",
                          "#eef1f6", "#9aa3b5", "#5aa9ff",
                          shadow="0 10px 30px rgba(0, 0, 0, 0.35)", blur="18px",
                          header="rgba(13, 15, 20, 0.85)", glow="rgba(90, 169, 255, 0.25)",
                          solid="#1b1e27"),
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
                          blur="14px", header="#05070c", glow="rgba(0, 216, 240, 0.35)", solid="#0c1422"),
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
            "light": _mode("#eceef2", "#eceef2", "rgba(255,255,255,0.6)", "rgba(0,0,0,0.04)", "#111318", "#6b7180",
                           "#0a84ff", radius="24px", shadow="0 1px 2px rgba(0,0,0,0.06)", solid="#ffffff"),
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
                          "#d4a75c", radius="18px", blur="10px", glow="rgba(212, 167, 92, 0.25)",
                          solid="#221b16"),
            "light": _mode("#f6f1e9", "#f6f1e9", "#fffdf9", "#e7dccb", "#2a211a", "#7b6c5b", "#a87a2e",
                           radius="18px"),
        },
    },
    # ------------------------------------------------------------ 3.2 themes
    "liquid_glass": {
        "name": "AJ Netweb Liquid Glass",
        "label": "Liquid Glass",
        "description": "Apple iOS 26 style: very clear glass with a bright edge highlight over a vivid colour field.",
        "modes": {
            "dark": _mode("radial-gradient(900px 700px at 0% 0%, rgba(80, 120, 255, 0.55) 0%, transparent 60%), "
                          "radial-gradient(800px 650px at 100% 15%, rgba(255, 80, 170, 0.40) 0%, transparent 60%), "
                          "radial-gradient(900px 700px at 50% 110%, rgba(0, 210, 200, 0.40) 0%, transparent 60%), #0a0c14 fixed",
                          "#0a0c14", "rgba(40, 44, 60, 0.42)", "rgba(255, 255, 255, 0.16)",
                          "#f5f7fb", "#b4bccb", "#7cb6ff", is_dark=True,
                          surface="rgba(255, 255, 255, 0.08)", blur="28px", saturate="1.9", radius="26px",
                          shadow="inset 0 1px 0 rgba(255, 255, 255, 0.28), inset 0 -1px 0 rgba(255, 255, 255, 0.05), "
                                 "0 12px 32px rgba(0, 0, 0, 0.32)",
                          highlight="rgba(255, 255, 255, 0.28)", header="rgba(10, 12, 20, 0.55)",
                          glow="rgba(124, 182, 255, 0.35)", solid="#161a26", sheet="rgba(22, 26, 38, 0.78)",
                          nav="rgba(255, 255, 255, 0.10)", surface_on="rgba(255, 255, 255, 0.88)",
                          gradient="linear-gradient(135deg, #7cb6ff 0%, #b28dff 55%, #ff7ac6 100%)"),
            "light": _mode("radial-gradient(900px 700px at 0% 0%, rgba(120, 160, 255, 0.55) 0%, transparent 60%), "
                           "radial-gradient(800px 650px at 100% 10%, rgba(255, 150, 200, 0.45) 0%, transparent 60%), "
                           "radial-gradient(900px 700px at 50% 110%, rgba(90, 230, 210, 0.45) 0%, transparent 60%), #eef1f8 fixed",
                           "#eef1f8", "rgba(255, 255, 255, 0.50)", "rgba(255, 255, 255, 0.75)",
                           "#10131c", "#4d5468", "#2a6ff0", is_dark=False,
                           surface="rgba(255, 255, 255, 0.32)", blur="28px", saturate="1.9", radius="26px",
                           shadow="inset 0 1px 0 rgba(255, 255, 255, 0.9), 0 10px 30px rgba(40, 60, 120, 0.12)",
                           highlight="rgba(255, 255, 255, 0.9)", header="rgba(238, 241, 248, 0.6)",
                           glow="rgba(42, 111, 240, 0.25)", solid="#f7f8fc", sheet="rgba(247, 248, 252, 0.82)",
                           nav="rgba(24, 28, 40, 0.58)", surface_on="#ffffff",
                           gradient="linear-gradient(135deg, #2a6ff0 0%, #8a5cf5 55%, #e9528f 100%)"),
        },
    },
    "native_blur": {
        "name": "AJ Netweb Native Blur",
        "label": "Native Blur",
        "description": "Home Assistant's own colours with soft frosted cards. The safest choice next to stock HA pages.",
        "modes": {
            "light": _mode("#f2f4f7", "#fafafa", "rgba(255, 255, 255, 0.72)", "rgba(0, 0, 0, 0.06)",
                           "#212121", "#727272", "#03a9f4", primary="#03a9f4", is_dark=False,
                           blur="14px", radius="16px", shadow="0 2px 10px rgba(0, 0, 0, 0.06)",
                           header="rgba(250, 250, 250, 0.8)", solid="#ffffff"),
            "dark": _mode("#111111", "#111111", "rgba(32, 33, 36, 0.72)", "rgba(255, 255, 255, 0.07)",
                          "#e1e1e1", "#9b9b9b", "#03a9f4", primary="#03a9f4", is_dark=True,
                          blur="14px", radius="16px", shadow="0 2px 12px rgba(0, 0, 0, 0.35)",
                          header="rgba(17, 17, 17, 0.8)", solid="#1c1c1c", glow="rgba(3, 169, 244, 0.25)"),
        },
    },
    "aurora": {
        "name": "AJ Netweb Aurora",
        "label": "Aurora Gradient",
        "description": "Northern-lights mesh gradient (green, teal, violet) behind dark glass. Striking on wall panels.",
        "modes": {
            "dark": _mode("radial-gradient(1000px 700px at 15% 0%, rgba(52, 211, 153, 0.45) 0%, transparent 60%), "
                          "radial-gradient(900px 700px at 90% 20%, rgba(59, 130, 246, 0.45) 0%, transparent 60%), "
                          "radial-gradient(1000px 800px at 60% 110%, rgba(168, 85, 247, 0.45) 0%, transparent 60%), #070a12 fixed",
                          "#070a12", "rgba(16, 22, 34, 0.55)", "rgba(255, 255, 255, 0.10)",
                          "#eef6f4", "#9fb3b0", "#34d399", is_dark=True,
                          surface="rgba(14, 20, 32, 0.38)", blur="22px", saturate="1.6", radius="22px",
                          shadow="inset 0 1px 0 rgba(255, 255, 255, 0.12), 0 12px 30px rgba(0, 0, 0, 0.35)",
                          header="rgba(7, 10, 18, 0.6)", glow="rgba(52, 211, 153, 0.35)", solid="#111827",
                          sheet="rgba(12, 18, 30, 0.85)",
                          gradient="linear-gradient(135deg, #34d399 0%, #3b82f6 50%, #a855f7 100%)"),
        },
    },
    "desert_dusk": {
        "name": "AJ Netweb Desert Dusk",
        "label": "Desert Dusk",
        "description": "Gulf sunset gradient - sand, rose and violet - with warm glass. Made for GCC villas.",
        "modes": {
            "dark": _mode("linear-gradient(165deg, #2b1a2e 0%, #4a2433 38%, #7a3f2c 72%, #c27b3e 100%) fixed",
                          "#1c1220", "rgba(40, 24, 34, 0.50)", "rgba(255, 214, 170, 0.16)",
                          "#fff3e6", "#d8bba3", "#ffb867", is_dark=True,
                          surface="rgba(40, 22, 30, 0.34)", blur="20px", saturate="1.5", radius="22px",
                          shadow="inset 0 1px 0 rgba(255, 220, 180, 0.18), 0 12px 30px rgba(20, 5, 10, 0.4)",
                          header="rgba(28, 18, 32, 0.6)", glow="rgba(255, 184, 103, 0.35)", solid="#2a1a26",
                          sheet="rgba(36, 22, 32, 0.88)",
                          gradient="linear-gradient(135deg, #ffcf8a 0%, #ff8a5c 50%, #d9487a 100%)"),
            "light": _mode("linear-gradient(165deg, #fff4e6 0%, #ffe1cc 45%, #f7c9c9 75%, #e4c4e8 100%) fixed",
                           "#fff4e6", "rgba(255, 255, 255, 0.55)", "rgba(255, 255, 255, 0.7)",
                           "#2d1a14", "#7a5a4c", "#c2602f", is_dark=False,
                           surface="rgba(255, 255, 255, 0.40)", blur="20px", saturate="1.5", radius="22px",
                           shadow="inset 0 1px 0 rgba(255, 255, 255, 0.85), 0 10px 26px rgba(120, 60, 30, 0.12)",
                           header="rgba(255, 244, 230, 0.7)", solid="#fffaf4", sheet="rgba(255, 250, 244, 0.9)",
                           gradient="linear-gradient(135deg, #e8933e 0%, #d9573f 50%, #b8457a 100%)"),
        },
    },
    "material_you": {
        "name": "AJ Netweb Material",
        "label": "Material You",
        "description": "Google Material 3 look: tonal colour surfaces, big rounded corners, no blur. Fast on cheap tablets.",
        "modes": {
            "light": _mode("#f7f2fa", "#f7f2fa", "#ffffff", "#e7e0ec", "#1d1b20", "#49454f", "#6750a4",
                           is_dark=False, radius="28px", surface="#f3edf7", solid="#ffffff",
                           shadow="0 1px 2px rgba(0, 0, 0, 0.08)", surface_on="#eaddff", text_on="#21005d",
                           nav="rgba(29, 27, 32, 0.9)",
                           gradient="linear-gradient(135deg, #6750a4 0%, #7d5260 100%)"),
            "dark": _mode("#141218", "#141218", "#211f26", "#36343b", "#e6e0e9", "#cac4d0", "#d0bcff",
                          is_dark=True, radius="28px", surface="#211f26", solid="#2b2930",
                          surface_on="#4f378b", text_on="#eaddff", nav="rgba(43, 41, 48, 0.96)",
                          glow="rgba(208, 188, 255, 0.2)",
                          gradient="linear-gradient(135deg, #d0bcff 0%, #efb8c8 100%)"),
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
