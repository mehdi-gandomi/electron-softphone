/**
 * Write release-notes.md from the CHANGELOG section that matches package.json version.
 * Used by electron-builder as the GitHub Release body (in-app changelog).
 */
const fs = require('fs')
const path = require('path')

const root = path.join(__dirname, '..')
const pkg = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8'))
const changelog = fs.readFileSync(path.join(root, 'CHANGELOG.md'), 'utf8')
const version = String(pkg.version)

const escaped = version.replace(/\./g, '\\.')
const match = changelog.match(
  new RegExp(`##\\s+${escaped}\\s*\\r?\\n([\\s\\S]*?)(?=\\r?\\n##\\s+|$)`)
)
const body = match
  ? match[1].trim()
  : `- EmdadPhone ${version}`

const notes = `## ${version}\n\n${body}\n`
fs.writeFileSync(path.join(root, 'release-notes.md'), notes)
console.log(`[release-notes] wrote notes for ${version}`)
