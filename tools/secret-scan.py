#!/usr/bin/env python3
"""Secret scanner for the AJ repos - stops keys, tokens, passwords and secret files before they reach GitHub.

    python3 tools/secret-scan.py --staged         what `git commit` is about to record   (pre-commit hook)
    python3 tools/secret-scan.py --range A..B     commits about to be pushed              (pre-push hook)
    python3 tools/secret-scan.py --all            every commit in the history
    python3 tools/secret-scan.py --tree           the files as they are now

Exit code 1 + a list (values masked) when something is found. A false positive on one line: add the comment
`secret-scan: allow` on that line. Known real values are also matched exactly: the scanner reads the platform
settings file if it can (AJN_ENV, /etc/ajnetweb/ajnetweb.env or ../secrets/ajnetweb.env) and refuses any of
its secrets wherever they appear. Same file in aj-netweb-platform, aj-netweb-addon and aj-audio. Stdlib only.
"""
from __future__ import annotations

import argparse
import os
import re
import subprocess
import sys
from pathlib import Path

# ---- files that must never be committed (path regex, case-insensitive)
BAD_FILES = [
    (r"(^|/)\.env$|(^|/)[^/]*\.env$", "environment file (.env)"),
    (r"(^|/)ajnetweb\.env", "AJ Netweb settings file"),
    (r"\.(pem|key|p12|pfx|jks|keystore|ppk|kdbx|asc|gpg)$", "key / certificate / keystore"),
    (r"(^|/)id_(rsa|dsa|ecdsa|ed25519)(\.|$)", "SSH private key"),
    (r"(^|/)ajn_vm\d+$", "SSH private key (ajn_vm*)"),
    (r"(^|/)cloudflare\.ini$", "Cloudflare credentials"),
    (r"(^|/)licen[cs]es\.csv$", "licence list"),
    (r"(^|/)zigbee_network\.json$", "Zigbee network key backup"),
    (r"(^|/)tokens?[^/]*\.txt$", "token file"),
    (r"(^|/)(pki|pki-out|secrets)/", "secrets / PKI folder"),
    (r"(^|/)(data|letsencrypt)/.*\.(db|sqlite3?|pem)$", "runtime data"),
    (r"(^|/)\.storage/auth", "Home Assistant auth store"),
    (r"(^|/)service-account[^/]*\.json$|google-services\.json$|GoogleService-Info\.plist$", "cloud credentials"),
]
OK_FILES = re.compile(r"(\.example$|\.sample$|(^|/)tests?/fixtures?/|\.env\.example$)", re.I)

# ---- content patterns
PATTERNS = [
    ("private key", r"-----BEGIN (?:RSA |EC |OPENSSH |DSA |ENCRYPTED |PGP )?PRIVATE KEY(?: BLOCK)?-----"),
    ("GitHub token", r"\b(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})"),
    ("Telegram bot token", r"\b\d{8,10}:AA[A-Za-z0-9_-]{30,}"),
    ("Stripe / Moyasar key", r"\b(?:sk|rk|pk)_live_[A-Za-z0-9]{16,}|\bsk_test_[A-Za-z0-9]{20,}"),
    ("AWS key", r"\bAKIA[0-9A-Z]{16}\b"),
    ("Google API key", r"\bAIza[0-9A-Za-z_-]{35}\b"),
    ("Slack token", r"\bxox[baprs]-[A-Za-z0-9-]{10,}"),
    ("JWT / HA long-lived token", r"\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{20,}\.[A-Za-z0-9_-]{20,}"),
    ("Cloudflare token in ini", r"dns_cloudflare_api_token\s*=\s*[A-Za-z0-9_-]{30,}"),
    ("URL with password", r"\b[a-z][a-z0-9+.-]*://[^\s/:@'\"]+:(?!(?i:your|pass|changeme|change-me|secret@|xxx|\*))"
                          r"[^\s/@'\"$<{]{6,}@[A-Za-z0-9.-]+"),
    # NAME=value / NAME: "value" where NAME says secret and value is a literal (not code, not a placeholder)
    ("hard-coded secret", r"(?i)\b[A-Z0-9_]*(?:SECRET|TOKEN|PASSWORD|PASSWD|API_?KEY|PRIVATE_?KEY|STORE_?PASS)[A-Z0-9_]*"
                          r"\s*[:=]\s*[\"']?(?!change-me|your|<|\$|\{|%|xxx|none|null|true|false|example|dummy|test|os\.|env)"
                          r"([A-Za-z0-9+/_=.-]{24,})[\"']?\s*(?:#.*)?$"),
]
RX = [(n, re.compile(p)) for n, p in PATTERNS]
ALLOW = "secret-scan: allow"
CODE_HINT = re.compile(r"[\(\)\[\]]|\b(?:secrets|os|self|request|env|config|get|token_urlsafe|getenv)\b")


def known_secrets() -> dict[str, str]:
    """Exact values from the platform settings file, when this machine has it."""
    out = {}
    here = Path(__file__).resolve()
    for p in (os.environ.get("AJN_ENV"), "/etc/ajnetweb/ajnetweb.env",
              here.parents[2] / "secrets" / "ajnetweb.env" if len(here.parents) > 2 else None):
        try:
            for line in Path(p).read_text(encoding="utf-8").splitlines():
                k, _, v = line.partition("=")
                if re.search(r"SECRET|TOKEN|PASSWORD|_KEY$", k) and len(v.strip()) >= 16:
                    out[v.strip()] = k.strip()
        except (OSError, TypeError):
            continue
    return out


def git(*args: str) -> str:
    return subprocess.run(["git", *args], capture_output=True, text=True, errors="replace", check=False).stdout


def mask(s: str) -> str:
    s = s.strip()
    return s[:6] + "…" + f"({len(s)} chars)" if len(s) > 10 else "…"


def check_file(path: str) -> str | None:
    if OK_FILES.search(path):
        return None
    for rx, why in BAD_FILES:
        if re.search(rx, path, re.I):
            return why
    return None


def scan_lines(path: str, lines, known: dict, where: str, hits: list) -> None:
    for no, line in lines:
        if ALLOW in line or len(line) > 4000:
            continue
        for name, rx in RX:
            m = rx.search(line)
            if not m:
                continue
            if name == "hard-coded secret" and CODE_HINT.search(m.group(0).split("=", 1)[-1].split(":", 1)[-1]):
                continue
            hits.append((where, path, no, name, mask(m.group(0))))
            break
        for val, key in known.items():
            if val in line:
                hits.append((where, path, no, f"real value of {key}", mask(val)))


def scan_patch(patch: str, known: dict, hits: list) -> None:
    where, path, no, lines = "", "", 0, []

    def flush():
        if path and lines:
            scan_lines(path, lines, known, where, hits)

    for raw in patch.splitlines():
        if raw.startswith("@@C "):
            flush()
            lines, where = [], raw[4:]
        elif raw.startswith("+++ "):
            flush()
            lines = []
            path = raw[6:] if raw.startswith("+++ b/") else ""
            if path:
                why = check_file(path)
                if why:
                    hits.append((where, path, 0, f"file must not be committed: {why}", ""))
        elif raw.startswith("@@ "):
            m = re.search(r"\+(\d+)", raw)
            no = int(m.group(1)) if m else 0
        elif raw.startswith("+") and not raw.startswith("+++"):
            lines.append((no, raw[1:]))
            no += 1
        elif not raw.startswith("-"):
            no += 1
    flush()


def main() -> int:
    ap = argparse.ArgumentParser(description=__doc__.split("\n")[0])
    g = ap.add_mutually_exclusive_group(required=True)
    g.add_argument("--staged", action="store_true")
    g.add_argument("--range", nargs="+", metavar="REV")
    g.add_argument("--new", metavar="REV", help="commits of REV that no remote branch has yet (new branch push)")
    g.add_argument("--all", action="store_true")
    g.add_argument("--tree", action="store_true")
    a = ap.parse_args()
    known, hits = known_secrets(), []
    fmt = ["--no-color", "-U0", "--no-ext-diff", "--format=@@C %h"]
    if a.staged:
        scan_patch("@@C staged\n" + git("diff", "--cached", "--no-color", "-U0", "--no-ext-diff"), known, hits)
    elif a.range or a.all or a.new:
        revs = ["--all"] if a.all else ([a.new, "--not", "--remotes"] if a.new else a.range)
        scan_patch(git("log", "-p", *fmt, *revs), known, hits)
    else:
        for f in git("ls-files", "-z").split("\0"):
            if not f:
                continue
            why = check_file(f)
            if why:
                hits.append(("tree", f, 0, f"file must not be committed: {why}", ""))
                continue
            try:
                text = Path(f).read_text(encoding="utf-8")
            except (OSError, UnicodeDecodeError):
                continue
            scan_lines(f, enumerate(text.splitlines(), 1), known, "tree", hits)
    if not hits:
        print("secret-scan: clean")
        return 0
    print("secret-scan: POSSIBLE SECRETS - not committed / pushed:\n", file=sys.stderr)
    for where, path, no, name, val in hits[:200]:
        print(f"  {where:8} {path}:{no}  {name}  {val}", file=sys.stderr)
    print("\nRemove them (keep secrets in /etc/ajnetweb/ajnetweb.env or ..\\secrets). If a line is a false positive, "
          f"add the comment '{ALLOW}' to it.", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(main())
