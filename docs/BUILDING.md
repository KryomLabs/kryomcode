# Building KryomCode

## Production renderer

```powershell
npm run build     # tsc -b && vite build -> dist/
```

Output is a self-contained `dist/` (hashed assets, local
Monaco workers/fonts, production CSP injected). No dev
server, no source maps in the shipped bundle (the release
gate fails on `dist/*.map` in the asar).

## Packaged app

```powershell
npm run pack             # Windows unpacked dir -> release/win-unpacked
npm run pack:mac         # macOS unpacked dir (config ready, runtime untested)
npm run pack:linux       # Linux unpacked dir (config ready, runtime untested)
npm run check:release    # validate layout, asar contents, exclusions
```

`check:release` verifies: executable + asar present,
`resources/docs` shipped, required files included,
`.env`/tests/`.kryom`/sourcemaps/key material excluded,
`extraMetadata` channel intact, and the extension worker
unpacked next to the asar (it must be a real file for the
child-process launcher).

## Full installers

```powershell
npm run dist             # Windows nsis installer -> release/
npm run dist:mac         # macOS dmg (unsigned until certs exist)
npm run dist:linux       # Linux AppImage + deb
npm run dist:preview     # Windows installer with baked preview channel
```

## What is NOT in the build

- **No signing.** No Authenticode certificate, no Apple
  Developer ID/notarization configured. Installers work
  but show the OS's standard unknown-publisher warnings.
  Signing is an explicit owner prerequisite — see
  [RELEASING.md](RELEASING.md). Nothing here fakes it.
- **App icons.** Branded assets exist at `assets/branding/`
  (`kryomcode-icon.ico`, `kryomcode-icon.icns`
  `kryomcode-logo-512.png`, `kryomcode-logo.png`) and are wired
  into the electron-builder `win`/`mac`/`linux` config in
  `package.json` (verified 2026-11-02; this section previously
  stated no assets existed).
- **No update publishing.** `electron/updater` is not
  bundled; the in-app updater stages verified downloads
  for manual install. Publishing a feed URL is an owner
  action.

## Reproducibility notes

- `npm ci` + committed `package-lock.json` pin every
  dependency; CI installs exactly that set.
- Vite emits content-hashed asset names; the release gate
  asserts their presence by pattern.
- Byte-identical rebuilds are not claimed (native module
  timestamps, asar ordering). The practical guarantee is:
  same commit + `npm ci` + `npm run build` produces a
  working app that passes `check:release`.
