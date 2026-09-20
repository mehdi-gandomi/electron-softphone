/**
 * Publish NSIS setup to GitHub Releases.
 * Resolves GH_TOKEN from the environment or `gh auth token` before building.
 */
const { spawnSync } = require('child_process')
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const isWin = process.platform === 'win32'

function run(command, args, extraEnv = {}) {
  const result = spawnSync(command, args, {
    cwd: root,
    env: { ...process.env, ...extraEnv },
    stdio: 'inherit',
    windowsHide: true,
  })
  if (result.status !== 0) {
    process.exit(result.status == null ? 1 : result.status)
  }
}

function tryGhToken(ghBin) {
  const result = spawnSync(ghBin, ['auth', 'token'], {
    cwd: root,
    encoding: 'utf8',
    windowsHide: true,
  })
  if (result.status !== 0) return ''
  return String(result.stdout || '').trim()
}

function findGh() {
  const which = spawnSync(isWin ? 'where.exe' : 'which', ['gh'], {
    encoding: 'utf8',
    windowsHide: true,
  })
  const fromPath = String(which.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .find((line) => /\bgh(\.exe)?$/i.test(line))
  if (fromPath && fs.existsSync(fromPath)) return fromPath

  const fallbacks = [
    'C:\\Program Files\\GitHub CLI\\gh.exe',
    path.join(process.env.LOCALAPPDATA || '', 'GitHub CLI', 'gh.exe'),
    path.join(process.env.ProgramFiles || '', 'GitHub CLI', 'gh.exe'),
  ]
  return fallbacks.find((candidate) => candidate && fs.existsSync(candidate)) || ''
}

function resolveToken() {
  const existing = String(process.env.GH_TOKEN || process.env.GITHUB_TOKEN || '').trim()
  if (existing) return existing

  const gh = findGh()
  if (!gh) return ''
  return tryGhToken(gh)
}

const token = resolveToken()
if (!token) {
  console.error(`
GH_TOKEN is not set, so the release cannot be uploaded.

Do this in a NEW PowerShell window (required after installing gh):

  gh auth login
  $env:GH_TOKEN = (gh auth token)
  npm run release

If gh is still not recognized:

  winget install --id GitHub.cli -e --accept-source-agreements --accept-package-agreements

Then close the terminal and open a new one.

Or create a classic PAT with repo scope:
  https://github.com/settings/tokens
  $env:GH_TOKEN = "ghp_..."
`)
  process.exit(1)
}

process.env.GH_TOKEN = token
process.env.GITHUB_TOKEN = token

const tokenEnv = { GH_TOKEN: token, GITHUB_TOKEN: token }

function resolvePackageBin(packageName, binName) {
  const pkgJsonPath = require.resolve(`${packageName}/package.json`)
  const pkg = require(pkgJsonPath)
  const binField = pkg.bin
  const rel =
    typeof binField === 'string'
      ? binField
      : binField && (binField[binName] || binField[packageName])
  if (!rel) {
    throw new Error(`No bin "${binName}" in ${packageName}`)
  }
  return path.join(path.dirname(pkgJsonPath), rel)
}

const electronViteCli = resolvePackageBin('electron-vite', 'electron-vite')
const electronBuilderCli = resolvePackageBin('electron-builder', 'electron-builder')

run(process.execPath, [path.join(root, 'scripts', 'extract-release-notes.js')], tokenEnv)
run(process.execPath, [electronViteCli, 'build'], tokenEnv)
run(
  process.execPath,
  [electronBuilderCli, '--win', 'nsis', '--config', 'electron-builder.yml', '--publish', 'always'],
  tokenEnv
)
