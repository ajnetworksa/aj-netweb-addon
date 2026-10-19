# Releasing the add-ons

How a change gets from a pull request to client Home Assistant boxes.

## In short

1. In the pull request, bump every add-on you changed:
   ```bash
   python3 tools/release.py bump ajnetweb_adhan 1.2.0 "Iqamah reminder"
   ```
   This sets the version in every file that carries it and opens a `## 1.2.0 - Iqamah reminder` entry at the
   top of the add-on's `CHANGELOG.md`; write what changed under it. For the Dashboard Suite, run
   `npm run build` in `ajnetweb-ui` afterwards so the bundled card suite carries the new version.
2. CI fails the pull request if an add-on changed but kept its version (the *versions* job in
   `checks.yml`), because Home Assistant only offers an update when the version goes up. Changes to
   `README.md` and `DOCS.md`, and to the UI kit's `docs/` and `dev/` folders, don't need a bump.
3. Merge into **`beta`** first to try it on pilot sites, then merge `beta` into **`main`** for everyone.
4. When a version changes on `main` or `beta`, the *Add-on images* workflow builds that add-on for amd64 and
   aarch64 and pushes `ghcr.io/ajnetworksa/{arch}-addon-<add-on>:<version>`. On `main` it also tags
   `<add-on>-v<version>` and publishes a GitHub release with that version's changelog section.

## Channels

| Channel | Branch | Repository URL in Home Assistant |
|---|---|---|
| Stable | `main` | `https://github.com/ajnetworksa/aj-netweb-addon` |
| Beta | `beta` | `https://github.com/ajnetworksa/aj-netweb-addon#beta` |

Put 2–3 friendly sites (and the office test box) on the beta URL. A site changes channel by removing the
repository in *Settings → Add-ons → Add-on store → ⋮ → Repositories* and adding the other URL; installed
add-ons and their settings stay.

Rules that keep this safe:
- **A version is built once.** The workflow never overwrites an existing image. If a beta needs a fix, bump
  again (1.2.0 → 1.2.1) rather than reusing the number.
- **Promote by merging `beta` into `main`.** The version doesn't change, so stable sites get the exact image
  the pilot sites ran.
- **Hotfix on stable:** branch from `main`, bump, merge into `main`, then merge `main` back into `beta`.

One-time setup: create the `beta` branch from `main` (GitHub → Branches → New branch).

## Switching sites to the ready-made images

Until an add-on's `config.json` has an `image` line, each Home Assistant box still builds it from source,
which is slow on a Raspberry Pi and depends on Alpine and PyPI being reachable. To switch an add-on over:

1. Make sure its images exist: GitHub → Actions → *Add-on images* → *Run workflow* (leave the box blank to
   build every add-on's current version).
2. Make both packages public: GitHub → Packages → `amd64-addon-<add-on>` → Package settings → Change
   visibility → **Public**, and the same for `aarch64-addon-<add-on>`. Home Assistant can't log in to a
   private registry.
3. Add to the add-on's `config.json`, in the same pull request as a version bump:
   ```json
   "image": "ghcr.io/ajnetworksa/{arch}-addon-<add-on>",
   ```
   From that version on, the Supervisor downloads the image instead of building it.

Do one add-on first (for example Prayer & Adhan on the beta channel) and check that it installs and updates
before switching the rest. Remote Access has extra steps, see
[remote-access-closed-source.md](remote-access-closed-source.md).
