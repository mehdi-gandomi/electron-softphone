import fs from 'fs'
import path from 'path'
import os from 'os'
import { execFile, spawn } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

const PREF_NAME = 'security.enterprise_roots.enabled'
const PREF_LINE = `user_pref("${PREF_NAME}", true);`

function firefoxRoot(): string {
  return path.join(os.homedir(), 'AppData', 'Roaming', 'Mozilla', 'Firefox')
}

function parseProfilePaths(iniText: string, root: string): string[] {
  const lines = iniText.split(/\r?\n/)
  const profiles: string[] = []
  let inProfile = false
  let profilePath: string | undefined
  let isRelative = true

  const flush = () => {
    if (inProfile && profilePath) {
      const full = isRelative ? path.join(root, profilePath) : profilePath
      profiles.push(full)
    }
    inProfile = false
    profilePath = undefined
    isRelative = true
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line || line.startsWith(';') || line.startsWith('#')) continue
    if (line.startsWith('[') && line.endsWith(']')) {
      flush()
      inProfile = /^\[Profile\d+\]$/i.test(line)
      continue
    }
    if (!inProfile) continue
    const eq = line.indexOf('=')
    if (eq < 0) continue
    const key = line.slice(0, eq).trim().toLowerCase()
    const value = line.slice(eq + 1).trim()
    if (key === 'path') profilePath = value.replace(/\//g, path.sep)
    if (key === 'isrelative') isRelative = value === '1'
  }
  flush()
  return [...new Set(profiles.filter((p) => fs.existsSync(p)))]
}

function ensureUserJs(profileDir: string): { ok: boolean; path: string; error?: string } {
  const userJsPath = path.join(profileDir, 'user.js')
  try {
    let text = ''
    if (fs.existsSync(userJsPath)) {
      text = fs.readFileSync(userJsPath, 'utf8')
    }
    // Remove any existing lines for this pref (true/false)
    const cleaned = text
      .split(/\r?\n/)
      .filter((line) => !/user_pref\s*\(\s*["']security\.enterprise_roots\.enabled["']/i.test(line))
      .join('\n')
      .replace(/\s+$/, '')
    const next = cleaned ? `${cleaned}\n${PREF_LINE}\n` : `${PREF_LINE}\n`
    fs.writeFileSync(userJsPath, next, 'utf8')
    return { ok: true, path: userJsPath }
  } catch (err) {
    return {
      ok: false,
      path: userJsPath,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function tryWriteInstallPolicies(): { ok: boolean; path?: string; error?: string } {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Mozilla Firefox', 'distribution'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox', 'distribution'),
  ]
  for (const dir of candidates) {
    const firefoxExe = path.join(path.dirname(dir), 'firefox.exe')
    if (!fs.existsSync(firefoxExe) && !fs.existsSync(dir)) continue
    try {
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true })
      const policyPath = path.join(dir, 'policies.json')
      let existing: Record<string, unknown> = {}
      if (fs.existsSync(policyPath)) {
        try {
          existing = JSON.parse(fs.readFileSync(policyPath, 'utf8')) as Record<string, unknown>
        } catch {
          existing = {}
        }
      }
      const policies = {
        ...(typeof existing.policies === 'object' && existing.policies
          ? (existing.policies as Record<string, unknown>)
          : {}),
        ImportEnterpriseRoots: true,
      }
      fs.writeFileSync(policyPath, JSON.stringify({ ...existing, policies }, null, 2), 'utf8')
      return { ok: true, path: policyPath }
    } catch (err) {
      return {
        ok: false,
        path: path.join(dir, 'policies.json'),
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }
  // No install found or all failed — not fatal; user.js is enough
  return { ok: false, error: 'Firefox install policies.json not writable (admin may be required)' }
}

/**
 * Enable Firefox to trust Windows certificate store
 * (security.enterprise_roots.enabled / ImportEnterpriseRoots).
 * Writes user.js into all Firefox profiles; optionally policies.json if writable.
 * Firefox must be restarted for the change to apply.
 */
export function enableFirefoxEnterpriseRoots(): {
  success: boolean
  profilesUpdated: number
  profilePaths: string[]
  policyPath?: string
  alreadyConfigured?: boolean
  error?: string
  message?: string
} {
  try {
    const root = firefoxRoot()
    const iniPath = path.join(root, 'profiles.ini')
    if (!fs.existsSync(iniPath)) {
      return {
        success: false,
        profilesUpdated: 0,
        profilePaths: [],
        error: 'Firefox profiles not found. Is Firefox installed for this Windows user?',
      }
    }

    const profiles = parseProfilePaths(fs.readFileSync(iniPath, 'utf8'), root)
    if (profiles.length === 0) {
      return {
        success: false,
        profilesUpdated: 0,
        profilePaths: [],
        error: 'No Firefox profile directories found',
      }
    }

    const updated: string[] = []
    const errors: string[] = []
    for (const profile of profiles) {
      const result = ensureUserJs(profile)
      if (result.ok) updated.push(result.path)
      else errors.push(`${profile}: ${result.error}`)
    }

    const policy = tryWriteInstallPolicies()

    if (updated.length === 0) {
      return {
        success: false,
        profilesUpdated: 0,
        profilePaths: [],
        error: errors.join('; ') || 'Could not update Firefox user.js',
      }
    }

    return {
      success: true,
      profilesUpdated: updated.length,
      profilePaths: updated,
      policyPath: policy.ok ? policy.path : undefined,
      message:
        `Firefox will trust Windows certificates (${updated.length} profile(s) updated).` +
        (policy.ok ? ' Enterprise policy also written.' : '') +
        ' Restart Firefox completely, then reconnect to https://127.0.0.1:3921.',
    }
  } catch (err) {
    return {
      success: false,
      profilesUpdated: 0,
      profilePaths: [],
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

export function isFirefoxEnterpriseRootsConfigured(): {
  configured: boolean
  profilesChecked: number
  detail?: string
} {
  try {
    const root = firefoxRoot()
    const iniPath = path.join(root, 'profiles.ini')
    if (!fs.existsSync(iniPath)) {
      return { configured: false, profilesChecked: 0, detail: 'Firefox not found' }
    }
    const profiles = parseProfilePaths(fs.readFileSync(iniPath, 'utf8'), root)
    if (profiles.length === 0) {
      return { configured: false, profilesChecked: 0, detail: 'No profiles' }
    }
    let okCount = 0
    for (const profile of profiles) {
      const userJsPath = path.join(profile, 'user.js')
      if (!fs.existsSync(userJsPath)) continue
      const text = fs.readFileSync(userJsPath, 'utf8')
      if (/user_pref\s*\(\s*["']security\.enterprise_roots\.enabled["']\s*,\s*true\s*\)/i.test(text)) {
        okCount += 1
      }
    }
    return {
      configured: okCount > 0,
      profilesChecked: profiles.length,
      detail: okCount > 0 ? `${okCount}/${profiles.length} profile(s) configured` : 'Not configured',
    }
  } catch (err) {
    return {
      configured: false,
      profilesChecked: 0,
      detail: err instanceof Error ? err.message : String(err),
    }
  }
}

function findFirefoxExe(): string | null {
  const candidates = [
    path.join(process.env['ProgramFiles'] || 'C:\\Program Files', 'Mozilla Firefox', 'firefox.exe'),
    path.join(process.env['ProgramFiles(x86)'] || 'C:\\Program Files (x86)', 'Mozilla Firefox', 'firefox.exe'),
    path.join(process.env.LOCALAPPDATA || '', 'Mozilla Firefox', 'firefox.exe'),
  ]
  for (const exe of candidates) {
    if (exe && fs.existsSync(exe)) return exe
  }
  return null
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

/**
 * Force-quit all Firefox processes, then launch Firefox again.
 * Unsaved tabs/forms may be lost — caller should confirm with the user.
 */
export async function restartFirefox(): Promise<{
  success: boolean
  killed: boolean
  launched: boolean
  exePath?: string
  error?: string
  message?: string
}> {
  try {
    const exe = findFirefoxExe()
    if (!exe) {
      return {
        success: false,
        killed: false,
        launched: false,
        error: 'firefox.exe not found. Is Mozilla Firefox installed?',
      }
    }

    let killed = false
    try {
      await execFileAsync(
        'taskkill.exe',
        ['/IM', 'firefox.exe', '/F', '/T'],
        { windowsHide: true, timeout: 15000 }
      )
      killed = true
    } catch (err) {
      // taskkill exits non-zero when no process was running — that is fine
      const message = err instanceof Error ? err.message : String(err)
      if (!/not found|no tasks|not running|ERROR: /i.test(message)) {
        // still try to launch
      }
      killed = /SUCCESS/i.test(message) || /pid/i.test(message)
    }

    // Give Windows a moment to release profile locks
    await sleep(1200)

    spawn(exe, [], {
      detached: true,
      stdio: 'ignore',
      windowsHide: false,
    }).unref()

    return {
      success: true,
      killed,
      launched: true,
      exePath: exe,
      message: 'Firefox was quit and reopened. Wait a few seconds, then reconnect the socket.',
    }
  } catch (err) {
    return {
      success: false,
      killed: false,
      launched: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}
