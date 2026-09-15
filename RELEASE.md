# EmdadPhone release

Users update from **Settings → Update**. Do not email installers. Publish one GitHub Release; the app downloads it.

| | |
| --- | --- |
| Repo | [mehdi-gandomi/electron-softphone](https://github.com/mehdi-gandomi/electron-softphone) |
| What auto-update installs | `emdadphone-<version>-setup.exe` (NSIS Setup only) |
| What cannot self-install | Portable exe, `npm run dev` |
| Repo visibility | Must be **public**, or installed apps cannot download updates |

Never put `GH_TOKEN` in the app, `.env`, or git.

---

## Quick publish (Windows)

Do this in **PowerShell**, from the repo root.

### 1. Install GitHub CLI (once)

If `gh` is not recognized:

```powershell
winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements
```

**Close PowerShell and open a new window** so `gh` is on PATH.

### 2. Login (once per machine)

```powershell
gh auth login
```

Choose GitHub.com → HTTPS → login with a browser.

### 3. Match version and notes

1. Read `"version"` in `package.json` (example: `1.0.3`).
2. Add the same heading in `CHANGELOG.md` (`## 1.0.3`) with notes users will see in Settings → Update.

### 4. Commit and push

The post-commit hook bumps the patch version after every commit. **Skip that bump** when you want to publish the version already in `package.json`:

```powershell
cd C:\Users\Mehdi\Desktop\softphone
$env:SKIP_VERSION_BUMP = "1"
git add -A
git commit -m "Release 1.0.3"
git push origin HEAD
Remove-Item Env:SKIP_VERSION_BUMP
```

### 5. Upload to GitHub

You are already logged in with `gh`. From the repo root:

```powershell
npm run release
```

`npm run release` reads the token from `gh` automatically (even if `gh` is not on PATH in that window). You do **not** need to set `GH_TOKEN` yourself unless `gh auth login` was never run.

Optional, same as before:

```powershell
$env:GH_TOKEN = (gh auth token)
npm run release
```

Wait until the GitHub Release page shows **both**:

- `emdadphone-<version>-setup.exe`
- `latest.yml`

Then test **Settings → Update** on a PC that already has a previous Setup install.

---

## If you do not want GitHub CLI

Create a [classic PAT](https://github.com/settings/tokens) with the `repo` scope, then:

```powershell
$env:GH_TOKEN = "ghp_your_token_here"
npm run release
```

The token lasts only for that terminal session.

---

## Version on every commit

After each successful `git commit`, a hook bumps the **patch** in `package.json` and `package-lock.json`, then creates:

```
chore(version): 1.0.4 [skip-version]
```

Install the hook (also runs on `npm install`):

```powershell
npm run hooks:install
```

Skip one bump:

```powershell
$env:SKIP_VERSION_BUMP = "1"
git commit -m "docs: only"
```

Or put `[skip-version]` in the commit message.

Manual bump without committing:

```powershell
npm run version:patch
```

Before `npm run release`, `package.json` `"version"` and the `## x.y.z` heading in `CHANGELOG.md` must match.

---

## What `npm run release` uploads

| File | Why it matters |
| --- | --- |
| `emdadphone-<version>-setup.exe` | What users install / auto-update |
| `latest.yml` | Required for in-app updates |
| `emdadphone-<version>-setup.exe.blockmap` | Faster delta downloads (if generated) |
| GitHub tag `v<version>` | Created from `package.json` |

The GitHub Release body is the matching section of `CHANGELOG.md` (that is the in-app changelog).

---

## Manual upload if `npm run release` fails

```powershell
node scripts/extract-release-notes.js
npm run build
npx electron-builder --win nsis --config electron-builder.yml --publish never
```

Replace `1.0.3` with the version in `package.json`:

```powershell
gh release create v1.0.3 dist/emdadphone-1.0.3-setup.exe dist/latest.yml dist/emdadphone-1.0.3-setup.exe.blockmap --title "1.0.3" --notes-file release-notes.md
```

If `latest.yml` is missing, in-app update will not work.

---

## Commands

| Command | What it does |
| --- | --- |
| `npm run release` | Build Setup and **upload** to GitHub Releases |
| `npm run package` | Local Setup + portable, does **not** upload |
| `npm run package:portable` | Portable exe only, does **not** upload |
| `npm run hooks:install` | Install the post-commit version hook |
| `npm run version:patch` | Bump patch in working tree only |

---

## What users do

1. They must already have a previous **Setup** install (not portable).
2. Open **Settings → Update**.
3. See current version, latest version, and changelog.
4. Click **Download and install**, then **Restart and install**.

First-time users download the setup exe once from the [Releases](https://github.com/mehdi-gandomi/electron-softphone/releases) page.

---

## Private repo

Do not ship a GitHub token inside the app. Host `latest.yml` and the setup exe on a public HTTPS folder (S3, R2, nginx) and point `publish` in `electron-builder.yml` at that URL. The Update tab stays the same.
