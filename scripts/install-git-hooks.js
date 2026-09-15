/**
 * Copy versioned hooks into .git/hooks (default Git hook path — no git config change).
 * Runs from npm prepare so a fresh clone gets the post-commit version bump.
 */
const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

const root = path.join(__dirname, '..')

function resolveGitDir() {
  try {
    const dir = execSync('git rev-parse --git-dir', { cwd: root, encoding: 'utf8' }).trim()
    return path.resolve(root, dir)
  } catch {
    return null
  }
}

const gitDir = resolveGitDir()
if (!gitDir) {
  process.exit(0)
}

const hooksDir = path.join(gitDir, 'hooks')
fs.mkdirSync(hooksDir, { recursive: true })

const hookBody = `#!/bin/sh
# Auto-installed from scripts/install-git-hooks.js
root="$(git rev-parse --show-toplevel)"
if [ -f "$root/scripts/bump-version.js" ]; then
  node "$root/scripts/bump-version.js" --after-commit
fi
`

const dest = path.join(hooksDir, 'post-commit')
fs.writeFileSync(dest, hookBody.replace(/\r\n/g, '\n'))
try {
  fs.chmodSync(dest, 0o755)
} catch {
  // Windows does not use POSIX execute bits
}

console.log('[hooks] installed post-commit → bump patch version after each commit')
