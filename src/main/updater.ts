import { app, BrowserWindow, shell } from 'electron'
import https from 'https'
import { autoUpdater, NsisUpdater, type ProgressInfo, type UpdateInfo } from 'electron-updater'
import type { UpdaterStatus } from '../shared/types'

const GITHUB_OWNER = 'mehdi-gandomi'
const GITHUB_REPO = 'electron-softphone'
const RELEASES_URL = `https://github.com/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`
const GITHUB_API_LATEST = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/releases/latest`

let mainWindow: BrowserWindow | null = null
let configured = false

const status: UpdaterStatus = {
  currentVersion: '',
  latestVersion: null,
  releaseNotes: '',
  releaseUrl: RELEASES_URL,
  state: 'idle',
  progress: 0,
  error: null,
  canInstall: false,
  packaged: false,
  portable: false,
}

function isPortable(): boolean {
  return Boolean(process.env.PORTABLE_EXECUTABLE_DIR)
}

function canInstallUpdates(): boolean {
  return app.isPackaged && !isPortable()
}

function broadcast(): void {
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send('updater:status', getUpdaterStatus())
  }
}

function snapshot(): UpdaterStatus {
  return {
    ...status,
    currentVersion: app.getVersion(),
    packaged: app.isPackaged,
    portable: isPortable(),
    canInstall: canInstallUpdates(),
  }
}

export function getUpdaterStatus(): UpdaterStatus {
  return snapshot()
}

function notesFromInfo(info: UpdateInfo): string {
  const notes = info.releaseNotes
  if (!notes) return ''
  if (typeof notes === 'string') return notes
  if (Array.isArray(notes)) {
    return notes
      .map((entry) => {
        if (typeof entry === 'string') return entry
        const version = 'version' in entry ? String(entry.version) : ''
        const note = 'note' in entry ? String(entry.note ?? '') : ''
        return [version, note].filter(Boolean).join('\n')
      })
      .join('\n\n')
  }
  return String(notes)
}

function stripVersionPrefix(version: string): string {
  return version.trim().replace(/^v/i, '')
}

function isNewerVersion(latest: string, current: string): boolean {
  const parse = (value: string) =>
    stripVersionPrefix(value).split('.').map((part) => parseInt(part, 10) || 0)
  const a = parse(latest)
  const b = parse(current)
  const len = Math.max(a.length, b.length)
  for (let i = 0; i < len; i++) {
    const diff = (a[i] || 0) - (b[i] || 0)
    if (diff !== 0) return diff > 0
  }
  return false
}

function fetchGithubLatest(): Promise<{
  version: string
  notes: string
  url: string
} | null> {
  return new Promise((resolve, reject) => {
    const req = https.get(
      GITHUB_API_LATEST,
      {
        headers: {
          'User-Agent': 'EmdadPhone',
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
      },
      (res) => {
        const chunks: Buffer[] = []
        res.on('data', (chunk) => chunks.push(chunk as Buffer))
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8')
          const code = res.statusCode || 0
          if (code === 404) {
            resolve(null)
            return
          }
          if (code < 200 || code >= 300) {
            reject(new Error(`GitHub releases HTTP ${code}`))
            return
          }
          try {
            const json = JSON.parse(body) as {
              tag_name?: string
              name?: string
              body?: string
              html_url?: string
            }
            const version = stripVersionPrefix(json.tag_name || json.name || '')
            if (!version) {
              resolve(null)
              return
            }
            resolve({
              version,
              notes: (json.body || '').trim(),
              url: json.html_url || RELEASES_URL,
            })
          } catch {
            reject(new Error('Could not parse GitHub release'))
          }
        })
      }
    )
    req.on('error', reject)
    req.setTimeout(15000, () => {
      req.destroy(new Error('GitHub release check timed out'))
    })
  })
}

function applyRelease(
  version: string,
  notes: string,
  url?: string
): void {
  status.latestVersion = version
  if (notes) status.releaseNotes = notes
  if (url) status.releaseUrl = url
  if (status.state === 'downloading' || status.state === 'ready') return
  if (isNewerVersion(version, app.getVersion())) {
    status.state = 'available'
  } else {
    status.state = 'unavailable'
  }
}

function configureAutoUpdater(): void {
  if (configured || !canInstallUpdates()) return
  configured = true

  autoUpdater.autoDownload = false
  autoUpdater.autoInstallOnAppQuit = false
  if (process.platform === 'win32' && 'verifyUpdateCodeSignature' in autoUpdater) {
    ;(autoUpdater as NsisUpdater).verifyUpdateCodeSignature = async () => null
  }

  autoUpdater.on('checking-for-update', () => {
    if (status.state !== 'downloading') {
      status.state = 'checking'
      status.error = null
      broadcast()
    }
  })

  autoUpdater.on('update-available', (info: UpdateInfo) => {
    applyRelease(info.version, notesFromInfo(info), info.releaseName ? undefined : status.releaseUrl)
    broadcast()
  })

  autoUpdater.on('update-not-available', (info: UpdateInfo) => {
    if (info?.version) status.latestVersion = info.version
    if (status.state !== 'available') status.state = 'unavailable'
    broadcast()
  })

  autoUpdater.on('download-progress', (progress: ProgressInfo) => {
    status.state = 'downloading'
    status.progress = Math.max(0, Math.min(100, Math.round(progress.percent || 0)))
    broadcast()
  })

  autoUpdater.on('update-downloaded', (info: UpdateInfo) => {
    status.state = 'ready'
    status.progress = 100
    if (info?.version) status.latestVersion = info.version
    const notes = notesFromInfo(info)
    if (notes) status.releaseNotes = notes
    broadcast()
  })

  autoUpdater.on('error', (err: Error) => {
    status.state = 'error'
    status.error = err?.message || String(err)
    broadcast()
  })
}

export function initUpdater(win: BrowserWindow): void {
  mainWindow = win
  status.currentVersion = app.getVersion()
  status.packaged = app.isPackaged
  status.portable = isPortable()
  status.canInstall = canInstallUpdates()
  configureAutoUpdater()
}

export async function checkForAppUpdate(): Promise<UpdaterStatus> {
  status.state = 'checking'
  status.error = null
  status.progress = 0
  broadcast()

  try {
    const release = await fetchGithubLatest()
    if (release) {
      applyRelease(release.version, release.notes, release.url)
    } else {
      status.latestVersion = app.getVersion()
      status.state = 'unavailable'
    }
  } catch (err) {
    status.state = 'error'
    status.error = err instanceof Error ? err.message : String(err)
    broadcast()
    return getUpdaterStatus()
  }

  if (canInstallUpdates()) {
    try {
      configureAutoUpdater()
      await autoUpdater.checkForUpdates()
    } catch (err) {
      // GitHub metadata already applied; keep that result unless we have nothing
      if (status.state === 'checking') {
        status.state = 'error'
        status.error = err instanceof Error ? err.message : String(err)
      }
    }
  }

  if (status.state === 'checking') {
    status.state = status.latestVersion && isNewerVersion(status.latestVersion, app.getVersion())
      ? 'available'
      : 'unavailable'
  }

  broadcast()
  return getUpdaterStatus()
}

export async function downloadAppUpdate(): Promise<UpdaterStatus> {
  if (!canInstallUpdates()) {
    await openReleasePage()
    return getUpdaterStatus()
  }

  if (status.state === 'ready') return getUpdaterStatus()

  status.state = 'downloading'
  status.progress = 0
  status.error = null
  broadcast()

  try {
    configureAutoUpdater()
    const result = await autoUpdater.checkForUpdates()
    if (!result?.updateInfo || !isNewerVersion(result.updateInfo.version, app.getVersion())) {
      status.state = 'unavailable'
      if (result?.updateInfo?.version) status.latestVersion = result.updateInfo.version
      broadcast()
      return getUpdaterStatus()
    }
    applyRelease(result.updateInfo.version, notesFromInfo(result.updateInfo))
    status.state = 'downloading'
    await autoUpdater.downloadUpdate()
  } catch (err) {
    status.state = 'error'
    status.error = err instanceof Error ? err.message : String(err)
    broadcast()
  }

  return getUpdaterStatus()
}

export function installAppUpdate(): { success: boolean; error?: string } {
  if (!canInstallUpdates()) {
    return { success: false, error: 'install-not-available' }
  }
  if (status.state !== 'ready') {
    return { success: false, error: 'update-not-ready' }
  }
  try {
    autoUpdater.quitAndInstall(false, true)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}

export async function openReleasePage(): Promise<{ success: boolean; error?: string }> {
  try {
    await shell.openExternal(status.releaseUrl || RELEASES_URL)
    return { success: true }
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : String(err) }
  }
}
