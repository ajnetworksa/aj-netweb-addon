"""Consistency checks across the add-ons, so a release can't ship with mismatched files."""

import json
import re

import pytest
import yaml

from conftest import ADDONS, ROOT

ARCHES = {"aarch64", "amd64"}


def addon_ids(addons):
    return [a.name for a in addons]


@pytest.mark.parametrize("addon", ADDONS, ids=addon_ids(ADDONS))
def test_config_json(addon):
    cfg = json.loads((addon / "config.json").read_text(encoding="utf-8"))
    for key in ("name", "version", "slug", "description", "arch"):
        assert cfg.get(key), f"{addon.name}/config.json is missing '{key}'"
    assert cfg["slug"] == addon.name
    assert re.fullmatch(r"\d+\.\d+\.\d+", cfg["version"]), cfg["version"]
    assert set(cfg["arch"]) <= ARCHES


@pytest.mark.parametrize("addon", ADDONS, ids=addon_ids(ADDONS))
def test_build_json_covers_every_arch(addon):
    cfg = json.loads((addon / "config.json").read_text(encoding="utf-8"))
    build = json.loads((addon / "build.json").read_text(encoding="utf-8"))
    assert set(cfg["arch"]) <= set(build["build_from"])


@pytest.mark.parametrize("addon", ADDONS, ids=addon_ids(ADDONS))
def test_changelog_has_current_version(addon):
    version = json.loads((addon / "config.json").read_text(encoding="utf-8"))["version"]
    changelog = (addon / "CHANGELOG.md").read_text(encoding="utf-8")
    first = re.search(r"^## (\S+)", changelog, re.M)
    assert first, f"{addon.name}/CHANGELOG.md has no '## <version>' entry"
    assert first.group(1) == version, f"top CHANGELOG entry is {first.group(1)}, config.json says {version}"


def test_repository_json():
    repo = json.loads((ROOT / "repository.json").read_text(encoding="utf-8"))
    assert repo["name"] and repo["url"]


def test_licence_module_copies_match():
    master = (ROOT / "licensing" / "ajn_license.py").read_bytes()
    copies = sorted(ROOT.glob("ajnetweb_*/ajn_license.py"))
    assert copies
    stale = [c.parent.name for c in copies if c.read_bytes() != master]
    assert not stale, f"ajn_license.py differs from licensing/ajn_license.py in: {stale}"


def test_ui_version_matches_dashboard_addon():
    ui = json.loads((ROOT / "ajnetweb-ui" / "package.json").read_text(encoding="utf-8"))
    dash = json.loads((ROOT / "ajnetweb_dashboard" / "config.json").read_text(encoding="utf-8"))
    assert ui["version"] == dash["version"]


def test_card_suite_is_the_ui_build():
    dist = (ROOT / "ajnetweb-ui" / "dist" / "ajnetweb-ui.js").read_bytes()
    shipped = (ROOT / "ajnetweb_dashboard" / "www" / "ajnetweb-card-suite.js").read_bytes()
    assert dist == shipped, "run `npm run build` in ajnetweb-ui and commit the result"


class _BlueprintLoader(yaml.SafeLoader):
    pass


_BlueprintLoader.add_constructor("!input", lambda loader, node: ("!input", loader.construct_scalar(node)))

BLUEPRINTS = sorted(ROOT.glob("ajnetweb_dashboard/blueprints/*.yaml"))


@pytest.mark.parametrize("path", BLUEPRINTS, ids=[p.name for p in BLUEPRINTS])
def test_blueprint_inputs_are_declared(path):
    doc = yaml.load(path.read_text(encoding="utf-8"), Loader=_BlueprintLoader)
    declared = set(doc["blueprint"]["input"])
    used = set()

    def walk(node):
        if isinstance(node, tuple) and node[:1] == ("!input",):
            used.add(node[1])
        elif isinstance(node, dict):
            for v in node.values():
                walk(v)
        elif isinstance(node, list):
            for v in node:
                walk(v)

    walk({k: v for k, v in doc.items() if k != "blueprint"})
    assert used, "no !input found - is the loader working?"
    assert used <= declared, f"undeclared inputs: {used - declared}"
