"""tools/release.py: the version bump touches every file that carries the version, and the CI check
knows which add-on a changed file belongs to."""

import argparse
import importlib.util
import json
import re
import shutil

import pytest

from conftest import ROOT

spec = importlib.util.spec_from_file_location("release", ROOT / "tools" / "release.py")
release = importlib.util.module_from_spec(spec)
spec.loader.exec_module(release)


@pytest.mark.parametrize(
    "path, owner",
    [
        ("ajnetweb_adhan/prayer.py", "ajnetweb_adhan"),
        ("ajnetweb_adhan/www/app.js", "ajnetweb_adhan"),
        ("ajnetweb_adhan/README.md", None),
        ("ajnetweb_cctv/DOCS.md", None),
        ("ajnetweb-ui/src/cards/music.js", "ajnetweb_dashboard"),
        ("ajnetweb-ui/docs/03-cards-reference.md", None),
        ("ajnetweb-ui/dev/preview.js", None),
        ("docs/product-plan.md", None),
        ("tests/test_units.py", None),
    ],
)
def test_owner_of(path, owner):
    assert release.owner_of(path) == owner


@pytest.fixture
def repo_copy(tmp_path, monkeypatch):
    for name in ("ajnetweb_dashboard", "ajnetweb_tunnel"):
        shutil.copytree(ROOT / name, tmp_path / name, ignore=shutil.ignore_patterns("www", "*.png"))
    (tmp_path / "ajnetweb-ui").mkdir()
    for name in ("package.json", "package-lock.json", "README.md"):
        shutil.copy(ROOT / "ajnetweb-ui" / name, tmp_path / "ajnetweb-ui" / name)
    monkeypatch.setattr(release, "ROOT", tmp_path)
    return tmp_path


def bump(addon, version, title=""):
    release.cmd_bump(argparse.Namespace(addon=addon, version=version, title=title))


def test_bump_dashboard_updates_every_copy_of_the_version(repo_copy):
    bump("ajnetweb_dashboard", "99.0.0", "test")
    root = repo_copy
    assert json.loads((root / "ajnetweb_dashboard/config.json").read_text())["version"] == "99.0.0"
    assert json.loads((root / "ajnetweb-ui/package.json").read_text())["version"] == "99.0.0"
    lock = json.loads((root / "ajnetweb-ui/package-lock.json").read_text())
    assert lock["version"] == lock["packages"][""]["version"] == "99.0.0"
    assert '"ADDON_VERSION", "99.0.0"' in (root / "ajnetweb_dashboard/dashboard_engine.py").read_text()
    assert "ajnetweb-ui.js?v=99.0.0" in (root / "ajnetweb-ui/README.md").read_text()
    first = re.search(r"^## .*", (root / "ajnetweb_dashboard/CHANGELOG.md").read_text(), re.M).group(0)
    assert first == "## 99.0.0 - test"


def test_bump_tunnel_updates_agent_version(repo_copy):
    bump("ajnetweb_tunnel", "99.0.0")
    build = json.loads((repo_copy / "ajnetweb_tunnel/build.json").read_text())
    assert build["args"]["AJN_AGENT_VERSION"] == "99.0.0"
    assert "ARG AJN_AGENT_VERSION=99.0.0" in (repo_copy / "ajnetweb_tunnel/Dockerfile").read_text()


def test_bump_refuses_a_lower_version(repo_copy):
    with pytest.raises(SystemExit):
        bump("ajnetweb_dashboard", "0.0.1")
