/**
 * Bump the patch version in package.json + package-lock.json.
 *
 *   node scripts/bump-version.js              # bump working tree only
 *   node scripts/bump-version.js --after-commit
 *       Run from the post-commit hook: bump, then commit the version files.
 *
 * Skip: SKIP_VERSION_BUMP=1  or a commit message containing [skip-version]
 */
const fs = require('fs')
const path = require('path')
const { execSync, spawnSync } = require('child_process')

const root = path.join(__dirname, '..')
const afterCommit = process.argv.includes('--after-commit')

function git(args, opts = {}) {
  const result = spawnSync('git', args, {
    cwd: root,
    encoding: 'utf8',
    ...opts,
  })
  if (result.status !== 0 && opts.throwOnError !== false) {
    const err = (result.stderr || result.stdout || '').trim()
    throw new Error(err || `git ${args.join(' ')} failed`)
  }
  return result
}

function gitOut(args) {
  return execSync(`git ${args}`, { cwd: root, encoding: 'utf8' }).trim()
}

function gitDir() {
  try {
    return path.resolve(root, gitOut('rev-parse --git-dir'))
  } catch {
    return null
  }
}

function shouldSkip(dir) {
  if (process.env.SKIP_VERSION_BUMP === '1' || process.env.CI === 'true') {
    return 'skipped by env'
  }
  if (!dir) return 'not a git repository'
  const busy = ['rebase-merge', 'rebase-apply', 'CHERRY_PICK_HEAD', 'REVERT_HEAD']
  if (busy.some((name) => fs.existsSync(path.join(dir, name)))) {
    return 'rebase/cherry-pick in progress'
  }
  try {
    const head = gitOut('rev-parse --abbrev-ref HEAD')
    if (head === 'HEAD') return 'detached HEAD'
  } catch {
    return 'cannot read HEAD'
  }
  if (afterCommit) {
    const message = gitOut('log -1 --pretty=%B')
    if (/\[skip-version\]/i.test(message)) return 'commit marked [skip-version]'
  }
  return null
}

function bumpPatch(version) {
  const parts = String(version || '0.0.0').split('.')
  const major = Number.parseInt(parts[0], 10) || 0
  const minor = Number.parseInt(parts[1], 10) || 0
  const patch = Number.parseInt(parts[2], 10) || 0
  return `${major}.${minor}.${patch + 1}`
}

function writeVersion(next) {
  const pkgPath = path.join(root, 'package.json')
  const lockPath = path.join(root, 'package-lock.json')
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'))
  const previous = pkg.version
  pkg.version = next
  fs.writeFileSync(pkgPath, `${JSON.stringify(pkg, null, 2)}\n`)

  if (fs.existsSync(lockPath)) {
    let text = fs.readFileSync(lockPath, 'utf8')
    let replaced = 0
    text = text.replace(/"version": "[^"]+"/g, (match) => {
      replaced += 1
      return replaced <= 2 ? `"version": "${next}"` : match
    })
    fs.writeFileSync(lockPath, text)
  }
  return previous
}

function main() {
  const dir = gitDir()
  const reason = shouldSkip(dir)
  if (reason) {
    if (!afterCommit) console.log(`[version] ${reason}`)
    process.exit(0)
  }

  const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
  const next = bumpPatch(pkg.version)
  writeVersion(next)
  console.log(`[version] ${pkg.version} → ${next}`)

  if (!afterCommit) return

  git(['add', 'package.json', 'package-lock.json'])
  const staged = git(['diff', '--cached', '--name-only'], { throwOnError: false })
  const files = String(staged.stdout || '')
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
  if (files.length === 0) return

  git([
    'commit',
    '--no-verify',
    '-m',
    `chore(version): ${next} [skip-version]`,
  ])
}

main()
