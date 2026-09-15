# How to release EmdadPhone

Users update from **Settings → Update**. You do **not** email installers. You publish one GitHub Release; the app downloads it.

In-app install works only for the **NSIS Setup** build (`emdadphone-x.y.z-setup.exe`). Portable and `npm run dev` can show the changelog but cannot self-install.

Repo: [mehdi-gandomi/electron-softphone](https://github.com/mehdi-gandomi/electron-softphone)

The repo must be **public**. A private GitHub Release cannot be downloaded by installed apps unless you ship a token (do not do that).

---

## Version on every commit

A `post-commit` hook bumps the **patch** number in `package.json` (and `package-lock.json`) after each successful commit, then creates a small follow-up commit:

```
chore(version): 1.0.4 [skip-version]
```

Install once (also runs on `npm install`):

```powershell
npm run hooks:install
```

Skip a bump for one commit:

```powershell
$env:SKIP_VERSION_BUMP = "1"
git commit -m "docs: only"
```

Or put `[skip-version]` in the commit message. Manual bump without committing:

```powershell
npm run version:patch
```

Before you publish, `package.json` `"version"` and the `## x.y.z` heading in `CHANGELOG.md` must match.

---

## 1. Write the notes

1. Confirm `"version"` in `package.json` (example: `1.0.3`).
2. Put the same heading in `CHANGELOG.md` with the notes users should see in **Settings → Update**.
3. Commit (the hook may add a version commit — that is expected).
4. Push:

```powershell
git push origin HEAD
```

---

## 2. GitHub token (your PC only)

`npm run release` uploads to GitHub Releases. Never put the token in the app, `.env`, or git.

### Option A — GitHub CLI (simplest)

```powershell
gh auth login
$env:GH_TOKEN = (gh auth token)
```

### Option B — classic PAT

1. Open [https://github.com/settings/tokens](https://github.com/settings/tokens)
2. Generate a **classic** token with the `repo` scope.
3. In the same PowerShell window you will publish from:

```powershell
$env:GH_TOKEN = "ghp_your_token_here"
```

The variable lasts only for that terminal session.

---

## 3. Publish

From the repo root, in the **same** PowerShell where `GH_TOKEN` is set:

```powershell
npm run release
```

That extracts changelog notes, runs `electron-vite build`, builds **NSIS only**, and uploads:

| File | Why it matters |
| --- | --- |
| `emdadphone-<version>-setup.exe` | What users install / auto-update |
| `latest.yml` | Required for in-app updates |
| `emdadphone-<version>-setup.exe.blockmap` | Faster delta downloads (if generated) |
| GitHub tag `v<version>` | Created from `package.json` |

The GitHub Release **body** is the `CHANGELOG.md` section for that version (that is what the app shows).

Wait until the GitHub Release page shows the setup exe **and** `latest.yml`. Then check **Settings → Update** on a previous Setup install.

### Manual upload (if `npm run release` fails)

```powershell
node scripts/extract-release-notes.js
npm run build
npx electron-builder --win nsis --config electron-builder.yml --publish never
```

Then, with the version from `package.json`:

```powershell
gh release create v1.0.3 dist/emdadphone-1.0.3-setup.exe dist/latest.yml dist/emdadphone-1.0.3-setup.exe.blockmap --title "1.0.3" --notes-file release-notes.md
```

If `latest.yml` is missing, in-app update will not work.

---

## 4. What users do

1. They must already have a previous **Setup** install (not portable).
2. Open **Settings → Update**.
3. See current version, latest version, and changelog.
4. Click **Download and install**, then **Restart and install**.

First-time users download the setup exe once from the release page.

---

## Other commands (not a full GitHub release)

| Command | What it does |
| --- | --- |
| `npm run package` | Local Setup + portable, **does not** upload |
| `npm run package:portable` | Portable exe only, **does not** upload |
| `npm run release` | Setup only, **uploads** to GitHub Releases |
| `npm run hooks:install` | Install the post-commit version hook |

---

## When the repo is private

GitHub Releases on a private repo are not downloadable by the installed app unless you ship a token (do not do that).

Change `publish` in `electron-builder.yml` to a **generic** HTTPS folder you control (S3, R2, nginx) that is publicly readable, and host `latest.yml` + the setup exe there. The Update tab stays the same.
