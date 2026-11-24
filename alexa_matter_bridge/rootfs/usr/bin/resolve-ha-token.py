#!/usr/bin/env python3
import json
import os
import sys
import time
import base64
import hmac
import hashlib

def b64url(data):
    if isinstance(data, str):
        data = data.encode('utf-8')
    return base64.urlsafe_b64encode(data).decode('utf-8').rstrip('=')

def get_token():
    # 1. Check options.json first
    opt_file = "/data/options.json"
    if os.path.exists(opt_file):
        try:
            with open(opt_file, "r") as f:
                opts = json.load(f)
                custom_token = opts.get("ha_token", "").strip()
                if custom_token:
                    return custom_token
        except Exception:
            pass

    # 2. Reconstruct from /config/.storage/auth
    auth_paths = [
        "/config/.storage/auth",
        "/homeassistant/.storage/auth",
        "/mnt/data/supervisor/homeassistant/.storage/auth"
    ]
    for path in auth_paths:
        if os.path.exists(path):
            try:
                with open(path, "r") as f:
                    auth_data = json.load(f)
                rts = auth_data.get("data", {}).get("refresh_tokens", [])
                
                # Look for existing long-lived access token
                for rt in rts:
                    if rt.get("token_type") == "long_lived_access_token":
                        rt_id = rt.get("id")
                        jwt_key = rt.get("jwt_key")
                        exp_delta = rt.get("access_token_expiration", 315360000)
                        now = int(time.time())
                        payload_data = {
                            "iss": rt_id,
                            "iat": now,
                            "exp": now + int(exp_delta)
                        }
                        header = b64url(json.dumps({'alg': 'HS256', 'typ': 'JWT'}, separators=(',', ':')))
                        payload = b64url(json.dumps(payload_data, separators=(',', ':')))
                        signing_input = f"{header}.{payload}".encode('utf-8')
                        sig = hmac.new(jwt_key.encode('utf-8'), signing_input, hashlib.sha256).digest()
                        return f"{header}.{payload}.{b64url(sig)}"
            except Exception as e:
                sys.stderr.write(f"[resolve-ha-token] Error reading {path}: {e}\n")

    # 3. Fallback to SUPERVISOR_TOKEN if nothing else
    return os.environ.get("SUPERVISOR_TOKEN", "")

if __name__ == "__main__":
    token = get_token()
    sys.stdout.write(token.strip())
