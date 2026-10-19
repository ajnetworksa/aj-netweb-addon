"""The add-on pages share one look script, built from ajnetweb-ui/src/look/addon-look.js."""
import json
import re

from conftest import ADDONS, ROOT

BUILT = ROOT / "ajnetweb-ui" / "dist" / "ajnetweb-look.js"
LOOK_ADDONS = [a for a in ADDONS if a.name != "ajnetweb_tunnel"]
COLOURS = {"bg", "surface", "surface2", "hover", "text", "text2", "muted", "border",
           "accent", "accent_hover", "accent_glow", "accent_soft"}


def test_every_addon_ships_the_built_look():
    built = BUILT.read_bytes()
    for addon in LOOK_ADDONS:
        assert (addon / "www" / "ajnetweb-look.js").read_bytes() == built, f"{addon.name}: run npm run build"


def test_every_addon_page_loads_the_look_with_a_valid_map():
    for addon in LOOK_ADDONS:
        html = (addon / "www" / "index.html").read_text(encoding="utf-8")
        m = re.search(r"""<script src="ajnetweb-look\.js" data-vars='([^']+)'></script>""", html)
        assert m, f"{addon.name}: index.html does not load ajnetweb-look.js"
        mapping = json.loads(m.group(1))
        assert mapping and all(k.startswith("--") for k in mapping), addon.name
        assert set(mapping.values()) <= COLOURS, f"{addon.name}: unknown colour {set(mapping.values()) - COLOURS}"


def test_hidden_pickers_have_a_note():
    for addon in LOOK_ADDONS:
        html = (addon / "www" / "index.html").read_text(encoding="utf-8")
        if "data-ajn-look-hide" in html:
            assert "data-ajn-look-note" in html, f"{addon.name}: say where the colours are changed"
