# Remote Access: compiled, closed-source release

Goal: clients install AJ Netweb Remote Access from the add-on store as usual, but the add-on contains
**no readable source** for the agent. Nobody can copy or change it from GitHub or from the device.

## What is ready (version 1.3.0)

| Piece | Where | What it does |
|---|---|---|
| Compile option | `ajnetweb_tunnel/Dockerfile`, build arg `AJN_COMPILE=true` | Compiles `agent.py`, `features.py` and `attest.py` with **Nuitka 4.2.2** into native `.so` modules. Docstrings and asserts are stripped; no `.py` files go into the image. |
| Release workflow | `.github/workflows/remote-access-image.yml` | Builds compiled images for amd64 and aarch64, pushes them to `ghcr.io/ajnetworksa/{arch}-addon-ajnetweb_tunnel:<version>`, and fails if any `.py` is left in the agent folder |
| Default local build | `AJN_COMPILE` unset | Plain Python as before, so Supervisor builds on a Pi stay quick while you test |

I checked that the three modules compile with Nuitka 4.2.2, and that the compiled `attest` module produces a
licence signal the other add-ons accept. Comments and docstrings no longer appear in the binary. The
full image build runs in GitHub Actions, because this development sandbox can't download the HA base
image.

`run.sh` (the bash start-up script) is still readable inside the image. It holds no secrets: activation
needs the client's licence key and your server, and the device key is generated on the device. If you
want, the next step is to move its logic into the compiled agent.

## Steps to go closed-source

1. **Build the images.** GitHub → Actions → *Remote Access image* → *Run workflow*, or push a tag
   `remote-access-v1.3.0`. Wait for both architectures to finish.
2. **Make the images downloadable.** GitHub → your profile/organisation → Packages →
   `amd64-addon-ajnetweb_tunnel` → Package settings → Change visibility → **Public**. Do the same for aarch64.
   - The images contain compiled code only.
   - Home Assistant can't pull private images without registry logins on every client.
3. **Point the add-on at the images.** Add to `ajnetweb_tunnel/config.json`:
   ```json
   "image": "ghcr.io/ajnetworksa/{arch}-addon-ajnetweb_tunnel",
   ```
   Commit and push. From now on the Supervisor downloads the image instead of building from source.
4. **Remove the source from the public repository.**
   - Create a **private** repository, e.g. `ajnetworksa/ajnetweb-remote-access`.
   - Move `ajnetweb_tunnel/` (Dockerfile, `*.py`, `run.sh`, `www/`, `build.json`) and the workflow there,
     and build from it.
   - In the public add-on repository keep only `config.json` (with `image`), `README.md`, `DOCS.md`,
     `CHANGELOG.md`, `icon.png`, `logo.png` and `translations/`.
   - The old source remains in the public repository's git history. If that matters, rotate anything
     sensitive; the server-side keys were never in the repo.
5. **Every release:** bump `version` in `config.json` (and `AJN_AGENT_VERSION`), run the workflow, then push
   the public `config.json`. Clients see the update in Home Assistant as usual.

## About an "embedded secret key"

A secret baked into software that runs on the client's own hardware can always be extracted by someone
with enough time. Compiling only makes it slower. So the protection does **not** depend on a hidden key:

- The **device key** is created on each Home Assistant during activation and never leaves it. A copy of the
  add-on, or of its files, has no valid device key.
- Your **CA key** and subscription records stay on your server. The add-ons only contain the CA's public
  certificate.
- Every licence signal is **short-lived (72 h)** and bound to one **Install ID**. A copied signal goes stale
  and can't be refreshed.

If you also want the server to accept only genuine agent builds, the server would need to check a build
secret. That's possible (an HMAC header added by the compiled agent), but anyone who extracts the secret
can fake it. It needs a server change and isn't added yet.
