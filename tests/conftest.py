import importlib
import sys
from pathlib import Path

import pytest

ROOT = Path(__file__).resolve().parent.parent
ADDONS = sorted(p.parent for p in ROOT.glob("ajnetweb_*/config.json"))


@pytest.fixture
def load_addon_module():
    """Import a module from an add-on folder the way the add-on runs it (its folder on sys.path).

    Several add-ons ship modules with the same name, so each import is undone afterwards.
    """
    added = []

    def load(addon: str, module: str):
        path = str(ROOT / addon)
        sys.path.insert(0, path)
        added.append(path)
        before = set(sys.modules)
        mod = importlib.import_module(module)
        added.extend(("mod", m) for m in set(sys.modules) - before)
        return mod

    yield load
    for item in added:
        if isinstance(item, tuple):
            sys.modules.pop(item[1], None)
        elif item in sys.path:
            sys.path.remove(item)
