#!/usr/bin/env python3
"""
AJ Netweb licence tool - for AJ Netweb only. Run it on your own computer, never on a client's system.

  keygen                 create the signing key pair (once). The private key is encrypted with a passphrase.
  issue                  sign a licence for one Home Assistant installation (Install ID)
  inspect <licence>      show what a licence contains and whether the signature is valid
  sync                   copy licensing/ajn_license.py (with the public key) into every add-on

Requires: pip install cryptography

Examples
  python3 tools/license/ajn-license.py keygen --out ~/ajnetweb-secrets/ajnetweb-signing.pem --install
  python3 tools/license/ajn-license.py sync
  python3 tools/license/ajn-license.py issue --key ~/ajnetweb-secrets/ajnetweb-signing.pem \\
      --install-id 3f2c...e91 --customer "Villa Al Noor" --expires 2027-12-31
"""

import argparse
import base64
import csv
import getpass
import json
import os
import re
import sys
from datetime import date

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
CANON = os.path.join(ROOT, "licensing", "ajn_license.py")
PUBFILE = os.path.join(ROOT, "licensing", "public_key.txt")
ADDONS = ["ajnetweb_dashboard", "ajnetweb_adhan", "ajnetweb_cctv", "ajnetweb_intercom", "ajnetweb_sharing"]
PRODUCTS = ["dashboard", "adhan", "cctv", "intercom", "sharing"]


def need_crypto():
    try:
        from cryptography.hazmat.primitives import serialization  # noqa: F401
    except ImportError:
        sys.exit("Install the crypto library first:  pip install cryptography")


def b64u(b: bytes) -> str:
    return base64.urlsafe_b64encode(b).decode().rstrip("=")


def load_private(path):
    from cryptography.hazmat.primitives import serialization
    with open(path, "rb") as f:
        data = f.read()
    pw = os.environ.get("AJN_KEY_PASSPHRASE")
    if pw is None:
        pw = getpass.getpass("Passphrase for the signing key: ")
    return serialization.load_pem_private_key(data, password=pw.encode() or None)


def public_b64(priv) -> str:
    from cryptography.hazmat.primitives import serialization
    raw = priv.public_key().public_bytes(serialization.Encoding.Raw, serialization.PublicFormat.Raw)
    return base64.b64encode(raw).decode()


def cmd_keygen(a):
    need_crypto()
    from cryptography.hazmat.primitives import serialization
    from cryptography.hazmat.primitives.asymmetric.ed25519 import Ed25519PrivateKey
    out = os.path.expanduser(a.out)
    if os.path.exists(out):
        sys.exit(f"{out} already exists - refusing to overwrite your signing key.")
    if os.path.abspath(out).startswith(ROOT + os.sep):
        sys.exit("Do not keep the private key inside the repository. Choose a path outside it.")
    pw = getpass.getpass("New passphrase (keep it safe): ")
    if len(pw) < 10 or pw != getpass.getpass("Repeat passphrase: "):
        sys.exit("Passphrases differ or are shorter than 10 characters.")
    priv = Ed25519PrivateKey.generate()
    pem = priv.private_bytes(serialization.Encoding.PEM, serialization.PrivateFormat.PKCS8,
                             serialization.BestAvailableEncryption(pw.encode()))
    os.makedirs(os.path.dirname(out) or ".", exist_ok=True)
    fd = os.open(out, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "wb") as f:
        f.write(pem)
    pub = public_b64(priv)
    print(f"Private key written to {out}  (back it up offline - losing it means re-licensing every site)")
    print(f"Public key: {pub}")
    if a.install:
        with open(PUBFILE, "w", encoding="utf-8") as f:
            f.write(pub + "\n")
        print(f"Public key saved to {os.path.relpath(PUBFILE, ROOT)} - now run:  python3 {os.path.relpath(__file__, ROOT)} sync")


def cmd_issue(a):
    need_crypto()
    priv = load_private(os.path.expanduser(a.key))
    if os.path.exists(PUBFILE) and open(PUBFILE).read().strip() != public_b64(priv):
        sys.exit("This private key does not match licensing/public_key.txt - licences would be rejected.")
    iid = a.install_id.strip()
    if not re.fullmatch(r"[A-Za-z0-9-]{8,64}", iid):
        sys.exit("Install ID looks wrong (copy it from the add-on's activation page).")
    products = ["*"] if a.products in ("*", "all") else [p.strip() for p in a.products.split(",") if p.strip()]
    bad = [p for p in products if p != "*" and p not in PRODUCTS]
    if bad:
        sys.exit(f"Unknown product(s): {', '.join(bad)}. Known: {', '.join(PRODUCTS)} or all")
    if a.expires:
        date.fromisoformat(a.expires)
    log_path = os.path.expanduser(a.log)
    lic_id = a.id or next_id(log_path)
    payload = {"v": 1, "id": lic_id, "customer": a.customer, "install": iid, "products": products,
               "issued": date.today().isoformat(), "expires": a.expires or None}
    body = b64u(json.dumps(payload, separators=(",", ":"), ensure_ascii=False).encode())
    head = "AJN1"
    sig = priv.sign(f"{head}.{body}".encode())
    key = f"{head}.{body}.{b64u(sig)}"
    new = not os.path.exists(log_path)
    os.makedirs(os.path.dirname(log_path) or ".", exist_ok=True)
    with open(log_path, "a", newline="", encoding="utf-8") as f:
        w = csv.writer(f)
        if new:
            w.writerow(["id", "issued", "customer", "install_id", "products", "expires", "note", "key"])
        w.writerow([lic_id, payload["issued"], a.customer, iid, " ".join(products), a.expires or "", a.note or "", key])
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    print("\nLicence key (paste it in any AJ Netweb add-on -> Activation):\n")
    print(key)
    print(f"\nRecorded in {log_path}")


def next_id(log_path):
    year = date.today().year
    n = 0
    if os.path.exists(log_path):
        with open(log_path, newline="", encoding="utf-8") as f:
            for row in csv.DictReader(f):
                m = re.fullmatch(rf"AJN-{year}-(\d+)", row.get("id", ""))
                if m:
                    n = max(n, int(m.group(1)))
    return f"AJN-{year}-{n + 1:04d}"


def cmd_inspect(a):
    sys.path.insert(0, os.path.join(ROOT, "licensing"))
    import ajn_license as L
    payload = L.decode(a.licence)
    if not payload:
        sys.exit("Not an AJ Netweb licence.")
    print(json.dumps(payload, indent=2, ensure_ascii=False))
    pub = open(PUBFILE).read().strip() if os.path.exists(PUBFILE) else ""
    if pub:
        res = L.verify(a.licence, (payload.get("products") or ["dashboard"])[0].replace("*", "dashboard"),
                       payload.get("install", ""), public_key=pub)
        print("Signature:", "valid" if res["reason"] not in ("invalid", "error") else res["reason"],
              "| status:", res["reason"])


def cmd_sync(_a):
    pub = open(PUBFILE).read().strip() if os.path.exists(PUBFILE) else ""
    if pub:
        raw = base64.b64decode(pub)
        if len(raw) != 32:
            sys.exit("licensing/public_key.txt is not a raw Ed25519 public key.")
    with open(CANON, encoding="utf-8") as f:
        src = f.read()
    src = re.sub(r'^PUBLIC_KEY = ".*"$', f'PUBLIC_KEY = "{pub}"', src, count=1, flags=re.M)
    with open(CANON, "w", encoding="utf-8") as f:
        f.write(src)
    for d in ADDONS:
        with open(os.path.join(ROOT, d, "ajn_license.py"), "w", encoding="utf-8") as f:
            f.write(src)
    print(f"Synced ajn_license.py into {len(ADDONS)} add-ons ({'key set' if pub else 'no key - not enforced'}).")
    print("The dashboard cards read licensing/public_key.txt at build time: run  npm run build  in ajnetweb-ui/.")


def main():
    ap = argparse.ArgumentParser(description="AJ Netweb licence tool")
    sub = ap.add_subparsers(dest="cmd", required=True)
    k = sub.add_parser("keygen")
    k.add_argument("--out", required=True)
    k.add_argument("--install", action="store_true", help="write the public key to licensing/public_key.txt")
    i = sub.add_parser("issue")
    i.add_argument("--key", required=True, help="private key file")
    i.add_argument("--install-id", required=True)
    i.add_argument("--customer", required=True)
    i.add_argument("--products", default="all", help="all, or e.g. dashboard,adhan,cctv")
    i.add_argument("--expires", help="YYYY-MM-DD (omit for no expiry)")
    i.add_argument("--id", help="licence number (default: next AJN-<year>-NNNN)")
    i.add_argument("--note")
    i.add_argument("--log", default="~/ajnetweb-secrets/licences.csv", help="register of issued licences")
    n = sub.add_parser("inspect")
    n.add_argument("licence")
    sub.add_parser("sync")
    a = ap.parse_args()
    {"keygen": cmd_keygen, "issue": cmd_issue, "inspect": cmd_inspect, "sync": cmd_sync}[a.cmd](a)


if __name__ == "__main__":
    main()
