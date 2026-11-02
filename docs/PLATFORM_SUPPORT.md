# Platform Support

Honest per-OS status. "Configured" means the code and
packaging handle the platform; "Validated" means someone
ran it there. Only Windows is validated today.

## Matrix

| Area | Windows | macOS | Linux |
| ---- | ------- | ----- | ----- |
| Implementation (paths, spawning, kill, data dirs) | Done | Done | Done |
| Dev-mode runtime testing | Validated | Pending (no hardware) | Pending (no hardware) |
| Packaged runtime testing | Partial (unpacked dir) | Pending | Pending |
| Installer packaging | nsis configured | dmg configured (untested) | AppImage + deb configured (untested) |
| Code signing | Blocked (no cert) | Blocked (no cert) | N/A (checksums) |
| CI build | Configured (3-OS matrix in `ci.yml`) | Configured (3-OS matrix in `ci.yml`) | Configured (3-OS matrix in `ci.yml`) |
| CI runs recorded | None recorded in-repo | None recorded in-repo | None recorded in-repo |

## What the code does per platform

- **Paths**: `node:path` everywhere; workspace and storage
  containment validated per call. Spaces and special
  characters are safe (argument arrays, no shell
  interpolation) except the terminal's intentional
  user-command shell.
- **Shells**: terminal runs the platform shell
  (`cmd.exe`/PowerShell on Windows via `shell: true`,
  `/bin/sh` on POSIX). Never assume one from the other.
- **Process trees**: Windows kills via
  `taskkill /T /F`; POSIX children spawn detached and
  die by process-group signal. Unmarked children never
  receive group signals.
- **Executable lookup**: `where` on Windows, `which`
  elsewhere, via `utils/platform.cjs` — no shell
  involved.
- **Git**: `shell: false` + arg arrays on all platforms;
  missing binaries produce an explicit install-Git error.
- **App data**: Electron `userData` on all platforms
  (roaming `%APPDATA%` on Windows, `~/Library/Application
  Support` on macOS, `~/.config` on Linux).
- **Line endings / permissions**: text I/O is UTF-8;
  generated scripts keep owner permissions (no chmod
  games); template output is data, never executed.

## Known platform gaps

- macOS Gatekeeper will block the unsigned dmg until
  signing/notarization exists (owner action).
- Linux desktop-file integration ships with the deb via
  electron-builder defaults; menu icons need the icon
  set (owner action).
- No platform has verified auto-update end-to-end (no
  feed configured); the staging/verify path is unit +
  integration tested with injected fixtures.

## Verifying a new platform (owner runbook)

1. `npm ci && npm test && npm run build` on the machine.
2. `npm run pack:<mac|linux>` + manual launch; run
   `SMOKE_TEST.md` steps 1–10.
3. Update this matrix with the date and result. Do not
   mark Validated from CI logs alone — someone must
   click through the app.
