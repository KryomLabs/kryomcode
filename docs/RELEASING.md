# Releasing KryomCode

Cutting a release is a maintainer action. Nothing publishes
automatically: the `release` workflow is manual-dispatch
only, and every signing/upload step needs owner credentials
that do not exist in this repository.

## Versioning policy

- Semver, currently `0.x` prerelease: `0.MINOR.PATCH`.
- PATCH: fixes only. MINOR: features (may break
  prerelease APIs — noted in the changelog). MAJOR stays
  `0` until the 1.0 readiness review.
- The version lives in `package.json` `version` only.
  The app reads it via `app.getVersion()`; the update
  feed compares it as strict semver.
- Every release gets a dated `docs/CHANGELOG.md` entry
  moved out of Unreleased plus a GitHub Release with the
  same notes and artifact checksums.

## Pre-release checklist

1. `main` is green: `npm test`, `npm run test:renderer`,
   `check:syntax`, `check:test-manifest`, `check:workbench`,
   `npx tsc -b`, `npm run build`, `npm run pack`,
   `npm run check:release`. (Renderer suite + workbench gate
   added 2026-11-02; both exist in `package.json`.)
2. `docs/CHANGELOG.md` Unreleased section is complete
   and accurate; move it under the new version + date.
3. Bump `package.json` version (no `v` prefix in the
   file; tags use `v1.2.3` form).
4. Smoke-test the packed app per `docs/SMOKE_TEST.md`
   (at minimum steps 1–10 + anything the release
   touches).
5. Build installers (`npm run dist`, plus mac/linux when
   signing exists) and record sha256 checksums.

## Channels

- **stable** (default): `npm run dist`. Update feed
  channel `stable`.
- **preview**: `npm run dist:preview` bakes
  `kryomChannel: preview` via electron-builder
  extraMetadata. Preview keeps verbose errors and
  DevTools available; production does not.

## Publishing an update feed (owner setup)

1. Host a `stable.json` (and optionally `preview.json`)
   over **https** following the schema in
   `electron/services/update/update.service.cjs`
   (`version`, `channel`, `artifacts[]` with https
   `url` + `sha512` + `size`).
2. Set the feed URL for the pipeline via
   `KRYOM_UPDATE_FEED` (documented; no default URL is
   baked into the repo).
3. The app checks on demand, downloads into staging,
   verifies sha512, and reports the staged path. Users
   install manually. Failures clear staging; the running
   install is never modified.

## External prerequisites (blocked until the owner acts)

| Item | Status | Unblocks |
| ---- | ------ | -------- |
| Windows Authenticode cert | Not configured | Trusted Windows installs |
| Apple Developer ID + notarization | Not configured | macOS Gatekeeper installs |
| App icon set (`assets/branding/` ico + icns + logos) | Present and wired (verified 2026-11-02) | Branded installers |
| Update feed hosting + URL | Not configured | In-app update checks |
| Security contact email | Not configured | Faster vulnerability intake |
| macOS/Linux test hardware or runners | Not available | Verified cross-platform releases |

## After publishing

1. Create the GitHub Release from the tag with notes +
   checksums.
2. Keep the previous installer available for one cycle so
   users can roll back manually if a release regresses.
3. Watch for Security Advisories filed against the
   release version.
