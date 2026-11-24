#!/bin/sh
# Installs the secret guard as git hooks of THIS repo (run once per clone; Git for Windows runs it too):
#   pre-commit: blocks a commit that adds a key, token, password or secret file
#   pre-push:   checks every commit about to be pushed (also ones made before the hook existed)
# Uses tools/secret-scan.py. Emergency bypass (only when you are sure it is a false positive): --no-verify
set -e
root="$(git rev-parse --show-toplevel)"; hooks="$(git rev-parse --git-path hooks)"
mkdir -p "$hooks"
py='for p in python3 python py; do
  if command -v "$p" >/dev/null 2>&1 && "$p" -c "import sys; sys.exit(0 if sys.version_info >= (3, 8) else 1)" >/dev/null 2>&1; then PY="$p"; break; fi
done
[ -n "$PY" ] || { echo "secret-scan: Python 3 not found - blocked. Install Python 3 (python.org) or use --no-verify if you are sure." >&2; exit 1; }
root="$(git rev-parse --show-toplevel)"'
cat > "$hooks/pre-commit" <<HOOK
#!/bin/sh
# AJ secret guard (tools/install-secret-hooks.sh)
$py
exec "\$PY" "\$root/tools/secret-scan.py" --staged
HOOK
cat > "$hooks/pre-push" <<HOOK
#!/bin/sh
# AJ secret guard (tools/install-secret-hooks.sh)
$py
z=0000000000000000000000000000000000000000
while read -r lref lsha rref rsha; do
  [ "\$lsha" = "\$z" ] && continue                       # deleting a branch
  if [ "\$rsha" = "\$z" ]; then set -- --new "\$lsha"; else set -- --range "\$rsha..\$lsha"; fi
  "\$PY" "\$root/tools/secret-scan.py" "\$@" || exit 1
done
exit 0
HOOK
chmod +x "$hooks/pre-commit" "$hooks/pre-push"
echo "secret guard installed in $root (pre-commit + pre-push)"
