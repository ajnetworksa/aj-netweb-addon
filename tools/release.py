#!/usr/bin/env python3
"""Release helper for the AJ Netweb add-ons.

  python3 tools/release.py bump ajnetweb_adhan 1.2.0 "Iqamah reminder"   # new version + changelog entry
  python3 tools/release.py check --base origin/main                        # every changed add-on has a new version
  python3 tools/release.py changed --before <sha>                          # add-ons whose version changed (JSON)

`bump` keeps every file that carries the version in step: config.json, the CHANGELOG heading, the Remote Access
agent version (build.json, Dockerfile) and, for the Dashboard Suite, the UI kit's package.json, package-lock.json,
README resource URL and ADDON_VERSION in dashboard_engine.py.
`check` and `changed` are what CI runs (see .github/workflows/checks.yml and addon-images.yml).
"""

import argparse
import json
import re
import subprocess
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
VERSION_RE = re.compile(r"\d+\.\d+\.\d+")
# Files that change what the user reads on GitHub but not what Home Assistant installs.
NO_RELEASE_NEEDED = {"README.md", "DOCS.md"}


def addons():
    return sorted(p.parent.name for p in ROOT.glob("ajnetweb_*/config.json"))


def read_json(path):
    return json.loads(path.read_text(encoding="utf-8"))


def write_json(path, data):
    path.write_text(json.dumps(data, indent=2, ensure_ascii=False) + "\n", encoding="utf-8")


def git(*args):
    return subprocess.run(["git", *args], cwd=ROOT, check=True, capture_output=True, text=True).stdout


def version_at(rev, addon):
    """The add-on's version at a git revision, or None when it didn't exist there."""
    try:
        return json.loads(git("show", f"{rev}:{addon}/config.json"))["version"]
    except (subprocess.CalledProcessError, json.JSONDecodeError, KeyError):
        return None


def owner_of(path):
    """The add-on a changed file belongs to, or None for files outside any add-on."""
    parts = Path(path).parts
    if parts[0] == "ajnetweb-ui":
        # The UI kit ships inside the Dashboard Suite; its docs and preview tool don't.
        return None if len(parts) > 1 and parts[1] in ("docs", "dev", "README.md") else "ajnetweb_dashboard"
    if parts[0].startswith("ajnetweb_") and len(parts) > 1 and parts[-1] not in NO_RELEASE_NEEDED:
        return parts[0]
    return None


def cmd_bump(args):
    if args.addon not in addons():
        sys.exit(f"unknown add-on {args.addon!r}; choose from {', '.join(addons())}")
    if not VERSION_RE.fullmatch(args.version):
        sys.exit("version must look like 1.2.3")
    folder = ROOT / args.addon
    cfg = read_json(folder / "config.json")
    old = cfg["version"]
    if tuple(map(int, args.version.split("."))) <= tuple(map(int, old.split("."))):
        sys.exit(f"{args.addon} is already at {old}; the new version must be higher")
    cfg["version"] = args.version
    write_json(folder / "config.json", cfg)

    build = read_json(folder / "build.json")
    if "AJN_AGENT_VERSION" in build.get("args", {}):
        build["args"]["AJN_AGENT_VERSION"] = args.version
        write_json(folder / "build.json", build)
        dockerfile = folder / "Dockerfile"
        text = dockerfile.read_text(encoding="utf-8")
        dockerfile.write_text(re.sub(r"(ARG AJN_AGENT_VERSION=)\S+", rf"\g<1>{args.version}", text), encoding="utf-8")

    if args.addon == "ajnetweb_dashboard":
        pkg = ROOT / "ajnetweb-ui" / "package.json"
        data = read_json(pkg)
        data["version"] = args.version
        write_json(pkg, data)
        lock = ROOT / "ajnetweb-ui" / "package-lock.json"
        data = read_json(lock)
        data["version"] = args.version
        data["packages"][""]["version"] = args.version
        write_json(lock, data)
        engine = folder / "dashboard_engine.py"
        text = engine.read_text(encoding="utf-8")
        engine.write_text(re.sub(r'("ADDON_VERSION", ")[^"]+"', rf'\g<1>{args.version}"', text), encoding="utf-8")
        readme = ROOT / "ajnetweb-ui" / "README.md"
        text = readme.read_text(encoding="utf-8")
        readme.write_text(re.sub(r"(ajnetweb-ui\.js\?v=)\d+\.\d+\.\d+", rf"\g<1>{args.version}", text), encoding="utf-8")

    changelog = folder / "CHANGELOG.md"
    text = changelog.read_text(encoding="utf-8")
    heading = f"## {args.version}" + (f" - {args.title}" if args.title else "")
    entry = f"{heading}\n- \n\n"
    first = re.search(r"^## ", text, re.M)
    at = first.start() if first else len(text)
    changelog.write_text(text[:at] + entry + text[at:], encoding="utf-8")
    print(f"{args.addon}: {old} -> {args.version}. Write the changes under '{heading}' in {changelog.relative_to(ROOT)}.")
    if args.addon == "ajnetweb_dashboard":
        print("Then run `npm run build` in ajnetweb-ui so the bundled card suite carries the new version.")


def cmd_check(args):
    changed = git("diff", "--name-only", f"{args.base}...HEAD").split()
    touched = sorted({a for a in map(owner_of, changed) if a})
    missing = []
    for addon in touched:
        if not (ROOT / addon / "config.json").exists():
            continue  # add-on removed in this change
        old, new = version_at(args.base, addon), read_json(ROOT / addon / "config.json")["version"]
        if old is not None and old == new:
            missing.append(f"{addon} (still {new})")
        else:
            print(f"ok  {addon}: {old or 'new'} -> {new}")
    if missing:
        print("These add-ons changed but kept their version, so Home Assistant won't offer the update:")
        for m in missing:
            print(f"  - {m}")
        print('Bump each one with: python3 tools/release.py bump <add-on> <new version> "<short title>"')
        sys.exit(1)
    if not touched:
        print("No add-on files changed; no version bump needed.")


def cmd_changed(args):
    before = args.before
    if not before or set(before) == {"0"}:
        result = addons()  # new branch: build everything once
    else:
        result = [a for a in addons() if version_at(before, a) != read_json(ROOT / a / "config.json")["version"]]
    print(json.dumps(result))


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = parser.add_subparsers(dest="cmd", required=True)
    p = sub.add_parser("bump", help="raise an add-on's version and open a changelog entry")
    p.add_argument("addon")
    p.add_argument("version")
    p.add_argument("title", nargs="?", default="")
    p.set_defaults(func=cmd_bump)
    p = sub.add_parser("check", help="fail when a changed add-on kept its version")
    p.add_argument("--base", required=True)
    p.set_defaults(func=cmd_check)
    p = sub.add_parser("changed", help="print add-ons whose version changed since a commit, as JSON")
    p.add_argument("--before", default="")
    p.set_defaults(func=cmd_changed)
    args = parser.parse_args()
    args.func(args)


if __name__ == "__main__":
    main()
