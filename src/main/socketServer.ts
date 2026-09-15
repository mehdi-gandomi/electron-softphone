import http from 'http'
import https from 'https'
import fs from 'fs'
import path from 'path'
import { execFile, execFileSync } from 'child_process'
import { X509Certificate } from 'crypto'
import { app } from 'electron'
import selfsigned from 'selfsigned'
import { Server as SocketIoServer, type Socket } from 'socket.io'
import { getSetting } from './store'
import { addLog } from './sip/transport'
import { normalizeNationalCode } from '../shared/nationalCode'
import type { CallInfo, SocketServerSettings, UserAccessState, UserProfile } from '../shared/types'

let httpServer: http.Server | null = null
let httpsServer: https.Server | null = null
let io: SocketIoServer | null = null
let listeningKey = ''
let lastExternalCheck: { ok: boolean; at: number; detail: string } | null = null
let activeHttpPort = 3920
let activeHttpsPort = 3921

const TLS_PASSPHRASE = 'voxphone-local-socket'
const TLS_FRIENDLY_NAME = 'VoxPhone Local Socket'

type TlsHttpsOptions =
  | { kind: 'pem'; key: Buffer; cert: Buffer }
  | { kind: 'pfx'; pfx: Buffer; passphrase: string }

function getTlsPaths(): {
  dir: string
  pfxPath: string
  keyPath: string
  certPath: string
  cerPath: string
  thumbPath: string
} {
  const dir = path.join(app.getPath('userData'), 'socket-tls')
  return {
    dir,
    pfxPath: path.join(dir, 'localhost.pfx'),
    keyPath: path.join(dir, 'localhost.key'),
    certPath: path.join(dir, 'localhost.crt'),
    cerPath: path.join(dir, 'localhost.cer'),
    thumbPath: path.join(dir, 'thumbprint.txt'),
  }
}

function thumbprintFromCertPem(certPem: string | Buffer): string {
  const x = new X509Certificate(certPem)
  return x.fingerprint.replace(/:/g, '').toUpperCase()
}

function writeThumbprint(thumbPath: string, thumb: string): void {
  fs.writeFileSync(thumbPath, thumb, 'utf8')
}

function runPowerShell(script: string, timeoutMs = 20000): string {
  return execFileSync(
    'powershell.exe',
    ['-NoProfile', '-NonInteractive', '-Command', script],
    { windowsHide: true, timeout: timeoutMs, encoding: 'utf8' }
  )
    .toString()
    .trim()
}

function clearTlsFiles(paths: ReturnType<typeof getTlsPaths>): void {
  for (const p of [paths.pfxPath, paths.keyPath, paths.certPath, paths.cerPath, paths.thumbPath]) {
    try {
      if (fs.existsSync(p)) fs.unlinkSync(p)
    } catch {}
  }
}

/** Firefox rejects CA certs used as TLS server certs (MOZILLA_PKIX_ERROR_CA_CERT_USED_AS_END_ENTITY). */
function existingServerCertIsCa(paths: ReturnType<typeof getTlsPaths>): boolean {
  try {
    const pemPath = fs.existsSync(paths.certPath)
      ? paths.certPath
      : fs.existsSync(paths.cerPath)
        ? paths.cerPath
        : null
    if (!pemPath) return false
    const x = new X509Certificate(fs.readFileSync(pemPath))
    return Boolean(x.ca)
  } catch {
    return false
  }
}

function tryCreateTlsViaPowerShell(paths: ReturnType<typeof getTlsPaths>): boolean {
  try {
    const pfxEsc = paths.pfxPath.replace(/'/g, "''")
    const cerEsc = paths.cerPath.replace(/'/g, "''")
    const thumbEsc = paths.thumbPath.replace(/'/g, "''")
    // End-entity SSL server cert (not a CA) — required for Firefox
    const ps = `
      $ErrorActionPreference = 'Stop'
      $cert = New-SelfSignedCertificate -Type Custom -Subject 'CN=localhost' -DnsName @('localhost','127.0.0.1') -CertStoreLocation 'Cert:\\CurrentUser\\My' -KeyExportPolicy Exportable -KeySpec KeyExchange -KeyUsage DigitalSignature,KeyEncipherment -TextExtension @('2.5.29.37={text}1.3.6.1.5.5.7.3.1','2.5.29.19={text}false') -NotAfter (Get-Date).AddYears(10) -FriendlyName '${TLS_FRIENDLY_NAME}'
      $pwd = ConvertTo-SecureString -String '${TLS_PASSPHRASE}' -Force -AsPlainText
      Export-PfxCertificate -Cert $cert -FilePath '${pfxEsc}' -Password $pwd | Out-Null
      Export-Certificate -Cert $cert -FilePath '${cerEsc}' -Type CERT | Out-Null
      Set-Content -Path '${thumbEsc}' -Value $cert.Thumbprint -Encoding ASCII
      Write-Output 'OK'
    `
    runPowerShell(ps, 6000)
    return fs.existsSync(paths.pfxPath)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logSocket('warn', `PowerShell TLS create unavailable, will use Node fallback: ${message}`)
    return false
  }
}

async function createTlsViaSelfsigned(paths: ReturnType<typeof getTlsPaths>): Promise<boolean> {
  const notAfter = new Date()
  notAfter.setFullYear(notAfter.getFullYear() + 10)
  const pems = await selfsigned.generate([{ name: 'commonName', value: 'localhost' }], {
    keySize: 2048,
    algorithm: 'sha256',
    notAfterDate: notAfter,
    extensions: [
      // Must be end-entity (cA:false). Firefox rejects CA-as-server with MOZILLA_PKIX_ERROR_CA_CERT_USED_AS_END_ENTITY.
      { name: 'basicConstraints', cA: false, critical: true },
      {
        name: 'keyUsage',
        digitalSignature: true,
        keyEncipherment: true,
        critical: true,
      },
      { name: 'extKeyUsage', serverAuth: true },
      {
        name: 'subjectAltName',
        altNames: [
          { type: 2, value: 'localhost' },
          { type: 7, ip: '127.0.0.1' },
        ],
      },
    ],
  })

  fs.writeFileSync(paths.keyPath, pems.private, 'utf8')
  fs.writeFileSync(paths.certPath, pems.cert, 'utf8')
  fs.writeFileSync(paths.cerPath, pems.cert, 'utf8')
  writeThumbprint(paths.thumbPath, thumbprintFromCertPem(pems.cert))
  return true
}

function ensureSideArtifacts(paths: ReturnType<typeof getTlsPaths>): void {
  // Derive .cer + thumbprint from existing PEM or PFX when missing
  if (fs.existsSync(paths.certPath) && (!fs.existsSync(paths.cerPath) || !fs.existsSync(paths.thumbPath))) {
    try {
      const cert = fs.readFileSync(paths.certPath)
      if (!fs.existsSync(paths.cerPath)) fs.writeFileSync(paths.cerPath, cert)
      if (!fs.existsSync(paths.thumbPath)) writeThumbprint(paths.thumbPath, thumbprintFromCertPem(cert))
    } catch {}
  }

  if (fs.existsSync(paths.pfxPath) && (!fs.existsSync(paths.cerPath) || !fs.existsSync(paths.thumbPath))) {
    const pfxEsc = paths.pfxPath.replace(/'/g, "''")
    const cerEsc = paths.cerPath.replace(/'/g, "''")
    const thumbEsc = paths.thumbPath.replace(/'/g, "''")
    const ps = `
      $ErrorActionPreference = 'Stop'
      $pwd = ConvertTo-SecureString -String '${TLS_PASSPHRASE}' -Force -AsPlainText
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${pfxEsc}', $pwd, 'Exportable')
      Export-Certificate -Cert $cert -FilePath '${cerEsc}' -Type CERT | Out-Null
      Set-Content -Path '${thumbEsc}' -Value $cert.Thumbprint -Encoding ASCII
      Write-Output 'OK'
    `
    try {
      runPowerShell(ps, 20000)
    } catch {}
  }
}

async function ensureTlsMaterial(): Promise<TlsHttpsOptions | null> {
  try {
    const paths = getTlsPaths()
    if (!fs.existsSync(paths.dir)) fs.mkdirSync(paths.dir, { recursive: true })

    // Old Node-generated certs were marked CA=true; Firefox rejects those as server certs.
    if (existingServerCertIsCa(paths)) {
      logSocket(
        'warn',
        'Existing TLS cert is a CA certificate — regenerating as server (end-entity) cert for Firefox compatibility'
      )
      clearTlsFiles(paths)
    }

    let hasPem = fs.existsSync(paths.keyPath) && fs.existsSync(paths.certPath)
    let hasPfx = fs.existsSync(paths.pfxPath)

    if (!hasPem && !hasPfx) {
      // Prefer Node certs: correct end-entity extensions; PowerShell often times out on this PC.
      try {
        await createTlsViaSelfsigned(paths)
        logSocket('info', `Created local TLS certificate via Node (selfsigned) at ${paths.certPath}`)
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err)
        logSocket('warn', `Node TLS create failed, trying PowerShell: ${message}`)
        const viaPs = tryCreateTlsViaPowerShell(paths)
        if (!viaPs) {
          logSocket('error', 'TLS cert create failed (Node and PowerShell)')
          return null
        }
        logSocket('info', `Created local TLS certificate via PowerShell at ${paths.pfxPath}`)
      }
    }

    ensureSideArtifacts(paths)

    // If side artifacts reveal a CA cert from PFX, regenerate via Node
    if (existingServerCertIsCa(paths)) {
      logSocket('warn', 'Regenerated material still looks like CA — forcing Node end-entity cert')
      clearTlsFiles(paths)
      await createTlsViaSelfsigned(paths)
      ensureSideArtifacts(paths)
    }

    hasPem = fs.existsSync(paths.keyPath) && fs.existsSync(paths.certPath)
    hasPfx = fs.existsSync(paths.pfxPath)

    if (hasPem) {
      return {
        kind: 'pem',
        key: fs.readFileSync(paths.keyPath),
        cert: fs.readFileSync(paths.certPath),
      }
    }
    if (hasPfx) {
      return {
        kind: 'pfx',
        pfx: fs.readFileSync(paths.pfxPath),
        passphrase: TLS_PASSPHRASE,
      }
    }
    return null
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logSocket('error', `TLS cert create failed: ${message}`)
    return null
  }
}

function readLocalThumbprint(): string | null {
  const { thumbPath, certPath, cerPath } = getTlsPaths()
  try {
    if (fs.existsSync(thumbPath)) {
      const t = fs.readFileSync(thumbPath, 'utf8').trim()
      if (t) return t.toUpperCase().replace(/[^0-9A-F]/g, '')
    }
    const certFile = fs.existsSync(certPath) ? certPath : fs.existsSync(cerPath) ? cerPath : null
    if (certFile) {
      const thumb = thumbprintFromCertPem(fs.readFileSync(certFile))
      writeThumbprint(thumbPath, thumb)
      return thumb
    }
  } catch {}
  return null
}

function isTrustedViaPowerShell(thumb: string): boolean | null {
  try {
    const ps = `
      $ErrorActionPreference = 'Stop'
      $thumb = '${thumb.replace(/'/g, "''")}'
      $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
      $store.Open('ReadOnly')
      $hit = $store.Certificates | Where-Object { $_.Thumbprint -eq $thumb }
      $store.Close()
      if ($hit) { Write-Output 'YES' } else { Write-Output 'NO' }
    `
    const out = runPowerShell(ps, 15000)
    if (out === 'YES') return true
    if (out === 'NO') return false
    return null
  } catch {
    return null
  }
}

function isTrustedViaCertutil(thumb: string): boolean {
  try {
    const out = execFileSync(
      'certutil.exe',
      ['-user', '-store', 'Root'],
      { windowsHide: true, timeout: 20000, encoding: 'utf8' }
    ).toString()
    const normalized = thumb.toUpperCase().replace(/[^0-9A-F]/g, '')
    // certutil prints thumbprints with spaces: "a1 b2 c3 ..."
    const spaced = normalized.match(/.{1,2}/g)?.join(' ') ?? normalized
    return (
      out.toUpperCase().replace(/[^0-9A-F]/g, '').includes(normalized) ||
      out.toUpperCase().includes(spaced)
    )
  } catch {
    return false
  }
}

/** Whether the local cert is already in Current User Trusted Root. */
export async function isTlsCertificateTrusted(): Promise<{
  installed: boolean
  thumbprint?: string
  error?: string
}> {
  try {
    await ensureTlsMaterial()
    const thumb = readLocalThumbprint()
    if (!thumb) return { installed: false, error: 'Certificate not created yet' }

    const viaPs = isTrustedViaPowerShell(thumb)
    if (viaPs !== null) return { installed: viaPs, thumbprint: thumb }

    return { installed: isTrustedViaCertutil(thumb), thumbprint: thumb }
  } catch (err) {
    return {
      installed: false,
      error: err instanceof Error ? err.message : String(err),
    }
  }
}

function installViaPowerShell(): string | null {
  const { pfxPath, cerPath, thumbPath } = getTlsPaths()
  try {
    if (fs.existsSync(pfxPath)) {
      const pfxEsc = pfxPath.replace(/'/g, "''")
      const thumbEsc = thumbPath.replace(/'/g, "''")
      const ps = `
        $ErrorActionPreference = 'Stop'
        $pwd = ConvertTo-SecureString -String '${TLS_PASSPHRASE}' -Force -AsPlainText
        $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2(
          '${pfxEsc}',
          $pwd,
          [System.Security.Cryptography.X509Certificates.X509KeyStorageFlags]::Exportable
        )
        $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
        $store.Open('ReadWrite')
        $hit = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
        if (-not $hit) { $store.Add($cert) }
        $store.Close()
        Set-Content -Path '${thumbEsc}' -Value $cert.Thumbprint -Encoding ASCII
        Write-Output $cert.Thumbprint
      `
      return runPowerShell(ps, 30000)
    }

    const certFile = fs.existsSync(cerPath) ? cerPath : null
    if (!certFile) return null
    const cerEsc = certFile.replace(/'/g, "''")
    const thumbEsc = thumbPath.replace(/'/g, "''")
    const ps = `
      $ErrorActionPreference = 'Stop'
      $cert = New-Object System.Security.Cryptography.X509Certificates.X509Certificate2('${cerEsc}')
      $store = New-Object System.Security.Cryptography.X509Certificates.X509Store('Root','CurrentUser')
      $store.Open('ReadWrite')
      $hit = $store.Certificates | Where-Object { $_.Thumbprint -eq $cert.Thumbprint }
      if (-not $hit) { $store.Add($cert) }
      $store.Close()
      Set-Content -Path '${thumbEsc}' -Value $cert.Thumbprint -Encoding ASCII
      Write-Output $cert.Thumbprint
    `
    return runPowerShell(ps, 30000)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logSocket('warn', `PowerShell TLS install unavailable, will try certutil: ${message}`)
    return null
  }
}

function installViaCertutil(): { ok: boolean; detail: string } {
  const { cerPath, certPath } = getTlsPaths()
  const certFile = fs.existsSync(cerPath) ? cerPath : fs.existsSync(certPath) ? certPath : null
  if (!certFile) return { ok: false, detail: 'No certificate file to install' }
  try {
    const out = execFileSync(
      'certutil.exe',
      ['-user', '-addstore', 'Root', certFile],
      { windowsHide: true, timeout: 30000, encoding: 'utf8' }
    ).toString()
    const ok = /added|already|succeeded|certificate/i.test(out) || !/ERROR|FAILED/i.test(out)
    return { ok, detail: out.trim().slice(0, 400) }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, detail: message }
  }
}

/**
 * Install the softphone localhost cert into Windows Current User → Trusted Root.
 * Prefers PowerShell; falls back to certutil (works on older Windows without PowerShell cmdlets).
 * Windows may show its own security confirmation dialog.
 */
export async function installTlsCertificateToWindows(): Promise<{
  success: boolean
  alreadyInstalled?: boolean
  thumbprint?: string
  error?: string
  message?: string
}> {
  try {
    const material = await ensureTlsMaterial()
    if (!material) {
      return { success: false, error: 'Could not create TLS certificate' }
    }

    const existing = await isTlsCertificateTrusted()
    if (existing.installed) {
      return {
        success: true,
        alreadyInstalled: true,
        thumbprint: existing.thumbprint,
        message: 'Certificate already installed in Trusted Root',
      }
    }

    const viaPs = installViaPowerShell()
    if (viaPs) {
      logSocket('info', `Installed TLS cert via PowerShell thumbprint=${viaPs}`)
      return {
        success: true,
        thumbprint: viaPs,
        message: 'Certificate installed into Windows Trusted Root (Current User)',
      }
    }

    const viaCu = installViaCertutil()
    if (viaCu.ok) {
      const thumb = readLocalThumbprint() || undefined
      logSocket('info', `Installed TLS cert via certutil: ${viaCu.detail}`)
      return {
        success: true,
        thumbprint: thumb,
        message: 'Certificate installed into Windows Trusted Root (via certutil)',
      }
    }

    return {
      success: false,
      error: viaCu.detail || 'Could not install certificate (PowerShell and certutil both failed)',
    }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logSocket('error', `TLS cert install failed: ${message}`)
    return { success: false, error: message }
  }
}

function tlsToHttpsOptions(tls: TlsHttpsOptions): https.ServerOptions {
  if (tls.kind === 'pem') return { key: tls.key, cert: tls.cert }
  return { pfx: tls.pfx, passphrase: tls.passphrase }
}

/** Read socket settings without applyBuildIntegrations side effects. */
function peekSocketSettings(): SocketServerSettings {
  try {
    const raw = getSetting('socketServer')
    if (raw && typeof raw === 'object') {
      return {
        enabled: Boolean(raw.enabled),
        host: String(raw.host || '0.0.0.0'),
        port: Number(raw.port) > 0 ? Number(raw.port) : 3920,
        authToken: String(raw.authToken || ''),
      }
    }
  } catch {}
  return { enabled: false, host: '0.0.0.0', port: 3920, authToken: '' }
}

function configKey(cfg: SocketServerSettings): string {
  return `${cfg.enabled}|0.0.0.0|${cfg.port}|${cfg.authToken}`
}

function verifyExternalReachability(url: string): Promise<boolean> {
  return new Promise((resolve) => {
    let settled = false
    const finish = (ok: boolean, detail: string) => {
      if (settled) return
      settled = true
      lastExternalCheck = { ok, at: Date.now(), detail }
      resolve(ok)
    }

    try {
      const lib = url.startsWith('https:') ? https : http
      const req = lib.get(
        url,
        {
          timeout: 2500,
          // Local self-signed HTTPS — do not fail the probe on cert trust
          rejectUnauthorized: false,
          headers: { Connection: 'close' },
        },
        (res) => {
          res.resume()
          const code = res.statusCode || 0
          const ok = code >= 200 && code < 500
          finish(ok, ok ? `probe ${code} ${url}` : `probe status ${code} ${url}`)
        }
      )
      req.on('timeout', () => {
        req.destroy()
        finish(false, `probe timeout ${url}`)
      })
      req.on('error', (err) => {
        finish(false, `probe error ${url}: ${err.message}`)
      })
    } catch (err) {
      finish(false, err instanceof Error ? err.message : String(err))
    }
  })
}

function clientLabel(socket: Socket): string {
  const addr = socket.handshake.address || '?'
  const origin = (socket.handshake.headers.origin as string) || 'no-origin'
  return `${addr} origin=${origin} id=${socket.id}`
}

function logSocket(
  direction: 'sent' | 'recv' | 'error' | 'info',
  message: string,
  raw?: string
): void {
  addLog(direction, `[socket] ${message}`, raw)
}

/** Identity is User + Member; occupancy is keyed by national_code. */
function resolveOperatorFromProfile(profile: UserProfile | null | undefined): {
  operator_code: string
  operator_name: string
  national_code: string
  member_id: number | null
} | null {
  if (!profile) return null
  const operator_name = `${profile.firstName || ''} ${profile.lastName || ''}`.trim()
  const memberId =
    typeof profile.memberId === 'number' && Number.isFinite(profile.memberId) && profile.memberId > 0
      ? profile.memberId
      : null
  const national_code = normalizeNationalCode(profile.nationalCode)
  const operator_code = national_code || (memberId != null ? String(memberId) : '')
  if (!operator_name && !operator_code) return null
  return {
    operator_code,
    operator_name,
    national_code,
    member_id: memberId,
  }
}

function buildOperatorPayload(userAccess?: UserAccessState | null): Record<string, unknown> | null {
  const access = userAccess ?? getSetting('userAccess')
  if (!access || access.status !== 'logged_in') return null
  const resolved = resolveOperatorFromProfile(access.profile)
  if (!resolved) return null
  return {
    event: 'operator_info',
    ...resolved,
  }
}

function buildCallPayload(event: string, call: CallInfo, extra?: Record<string, unknown>) {
  const durationSec =
    call.answerTime > 0
      ? Math.max(0, Math.floor((Date.now() - call.answerTime) / 1000))
      : call.duration
  return {
    event,
    call_id: call.id,
    sip_call_id: call.callId || '',
    caller_id: call.remoteNumber,
    caller_name: call.remoteName,
    extension: call.localNumber,
    direction: call.direction,
    issabel_id: call.issabelId || '',
    duration: durationSec,
    timestamp: new Date().toISOString(),
    ...(extra || {}),
  }
}

function attachSocketHandlers(socketServer: SocketIoServer, authToken: string): void {
  socketServer.use((socket, next) => {
    const label = clientLabel(socket)
    logSocket(
      'recv',
      `Client connecting — ${label}`,
      JSON.stringify(
        {
          address: socket.handshake.address,
          origin: socket.handshake.headers.origin || null,
          userAgent: socket.handshake.headers['user-agent'] || null,
          transport: socket.conn?.transport?.name,
        },
        null,
        2
      )
    )

    if (!authToken) {
      next()
      return
    }
    const fromAuth = typeof socket.handshake.auth?.token === 'string'
      ? socket.handshake.auth.token
      : ''
    const header = socket.handshake.headers.authorization || ''
    const fromHeader = header.startsWith('Bearer ')
      ? header.slice(7).trim()
      : header.trim()
    if (fromAuth === authToken || fromHeader === authToken) {
      next()
      return
    }
    logSocket('error', `Client rejected (unauthorized) — ${label}`)
    next(new Error('unauthorized'))
  })

  socketServer.on('connection', (socket) => {
    const label = clientLabel(socket)
    logSocket('info', `Client connected — ${label}`)

    const operatorPayload = buildOperatorPayload()
    if (operatorPayload) {
      logSocket(
        'sent',
        `Emit operator_info → ${label}`,
        JSON.stringify(operatorPayload, null, 2)
      )
      socket.emit('operator_info', operatorPayload)
    }

    socket.on('disconnect', (reason) => {
      logSocket('info', `Client disconnected — ${label} reason=${reason}`)
    })

    socket.on('error', (err) => {
      logSocket('error', `Client error — ${label}: ${err.message}`)
    })
  })
}

function createHealthHandler() {
  return (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*')
    res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, POST, OPTIONS')
    res.setHeader(
      'Access-Control-Allow-Headers',
      'Content-Type, Authorization, X-Requested-With'
    )
    if (req.method === 'OPTIONS') {
      res.writeHead(204)
      res.end()
      return
    }
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end(
      'امدادفون socket server\n' +
        `HTTP:  http://127.0.0.1:${activeHttpPort}\n` +
        `HTTPS: https://127.0.0.1:${activeHttpsPort}  (for https websites / wss)\n`
    )
  }
}

function listenServer(
  server: http.Server | https.Server,
  port: number,
  label: string
): Promise<void> {
  return new Promise((resolve, reject) => {
    server.once('error', (err) => {
      logSocket('error', `${label} listen failed on 0.0.0.0:${port}: ${err.message}`)
      reject(err)
    })
    server.listen(port, '0.0.0.0', () => {
      server.off('error', reject)
      resolve()
    })
  })
}

export async function stopSocketServer(): Promise<void> {
  const currentIo = io
  const currentHttp = httpServer
  const currentHttps = httpsServer
  const wasRunning = Boolean(currentIo || currentHttp || currentHttps)
  io = null
  httpServer = null
  httpsServer = null
  listeningKey = ''
  lastExternalCheck = null

  if (currentIo) {
    await new Promise<void>((resolve) => {
      currentIo.close(() => resolve())
    })
  }
  if (currentHttp) {
    await new Promise<void>((resolve) => {
      currentHttp.close(() => resolve())
    })
  }
  if (currentHttps) {
    await new Promise<void>((resolve) => {
      currentHttps.close(() => resolve())
    })
  }
  if (wasRunning) {
    logSocket(
      'info',
      `Socket.IO server stopped (HTTP :${activeHttpPort} and HTTPS/WSS :${activeHttpsPort})`
    )
  }
}

export async function startSocketServer(cfg?: SocketServerSettings): Promise<void> {
  const settings = cfg ?? peekSocketSettings()
  if (!settings?.enabled) {
    await stopSocketServer()
    return
  }

  const displayHost = (settings.host || '0.0.0.0').trim() || '0.0.0.0'
  const port = Number(settings.port) > 0 ? Number(settings.port) : 3920
  const httpsPort = port + 1
  const authToken = (settings.authToken || '').trim()
  const secureNeeded = true
  const nextKey = configKey({
    enabled: true,
    host: '0.0.0.0',
    port,
    authToken,
  })

  if (
    io &&
    httpServer &&
    listeningKey === nextKey &&
    httpServer.listening &&
    (!secureNeeded || (httpsServer?.listening ?? false))
  ) {
    logSocket('info', `Socket.IO already running — HTTP :${port}` + (secureNeeded ? ` HTTPS :${httpsPort}` : ''))
    return
  }

  await stopSocketServer()
  activeHttpPort = port
  activeHttpsPort = httpsPort

  const health = createHealthHandler()
  const plain = http.createServer(health)

  const tls = await ensureTlsMaterial()
  let secure: https.Server | null = null
  if (tls) {
    secure = https.createServer(tlsToHttpsOptions(tls), health)
  } else {
    logSocket(
      'error',
      'HTTPS/WSS unavailable (cert failed). https://emdad.rcs.ir needs WSS — fix cert generation or use http://127.0.0.1 from pages that allow it.'
    )
  }

  const socketServer = new SocketIoServer({
    cors: {
      origin: true,
      methods: ['GET', 'POST'],
      allowedHeaders: ['Authorization', 'Content-Type'],
      credentials: false,
    },
    allowEIO3: true,
    transports: ['polling', 'websocket'],
  })
  attachSocketHandlers(socketServer, authToken)
  socketServer.attach(plain)
  if (secure) socketServer.attach(secure)

  await listenServer(plain, port, 'HTTP')
  if (secure) {
    try {
      await listenServer(secure, httpsPort, 'HTTPS')
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      logSocket('error', `HTTPS listen failed: ${message}`)
      try {
        secure.close()
      } catch {}
      secure = null
    }
  }

  httpServer = plain
  httpsServer = secure
  io = socketServer
  listeningKey = nextKey

  logSocket(
    'info',
    `Socket.IO HTTP listening — http://127.0.0.1:${port}/  (local tests / socket.html)`
  )
  if (secure) {
    logSocket(
      'info',
      `Socket.IO HTTPS/WSS listening — https://127.0.0.1:${httpsPort}/  (use from https websites)`
    )
  } else {
    logSocket('error', `Socket.IO HTTPS/WSS NOT running on :${httpsPort}`)
  }
  logSocket('info', `displayHost=${displayHost}`)

  const httpOk = await verifyExternalReachability(`http://127.0.0.1:${port}/`)
  if (httpOk) {
    logSocket('info', `HTTP reachability OK — http://127.0.0.1:${port}/`)
  } else {
    logSocket(
      'error',
      `HTTP ${port} not reachable (${lastExternalCheck?.detail || 'unknown'})`
    )
  }

  if (secure) {
    const httpsOk = await verifyExternalReachability(`https://127.0.0.1:${httpsPort}/`)
    if (httpsOk) {
      logSocket('info', `HTTPS reachability OK — https://127.0.0.1:${httpsPort}/`)
    } else {
      logSocket(
        'error',
        `HTTPS ${httpsPort} not reachable (${lastExternalCheck?.detail || 'unknown'})`
      )
    }
  }
}

export function getSocketServerStatus(): {
  running: boolean
  httpsRunning: boolean
  enabled: boolean
  reachable: boolean
  host: string
  port: number
  httpsPort: number
  url: string
  httpsUrl: string
  clients: number
  detail: string
} {
  const settings = peekSocketSettings()
  const port = Number(settings?.port) > 0 ? Number(settings.port) : 3920
  const httpsPort = port + 1
  const running = Boolean(io && httpServer && httpServer.listening)
  const httpsRunning = Boolean(io && httpsServer && httpsServer.listening)
  const reachable = Boolean(running && lastExternalCheck?.ok)
  return {
    running,
    httpsRunning,
    enabled: Boolean(settings?.enabled),
    reachable,
    host: settings?.host || '0.0.0.0',
    port,
    httpsPort,
    url: `http://127.0.0.1:${port}`,
    httpsUrl: `https://127.0.0.1:${httpsPort}`,
    clients: running ? io?.engine?.clientsCount ?? 0 : 0,
    detail: lastExternalCheck?.detail
      || (running
        ? httpsRunning
          ? `listening HTTP :${port} + HTTPS/WSS :${httpsPort}`
          : `listening HTTP :${port} (HTTPS/WSS down)`
        : 'stopped'),
  }
}

export async function syncSocketServerFromSettings(): Promise<void> {
  try {
    // Always use the stored socketServer value (do not fall back to getSettings()
    // which may re-apply build.json and undo a disable toggle).
    const cfg = peekSocketSettings()
    logSocket(
      'info',
      cfg.enabled
        ? `Sync socket server — starting (port ${cfg.port}, https ${cfg.port + 1})`
        : 'Sync socket server — disabled, stopping HTTP/HTTPS'
    )
    await startSocketServer(cfg)
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    logSocket('error', `Failed to start Socket.IO: ${message}`)
    await stopSocketServer().catch(() => {})
  }
}

function emitSocketEvent(
  event: string,
  call: CallInfo,
  extra?: Record<string, unknown>
): boolean {
  const settings = peekSocketSettings()
  if (!settings?.enabled || !io) return false
  const payload = buildCallPayload(event, call, extra)
  const clients = io.engine?.clientsCount ?? 0
  logSocket(
    'sent',
    `Emit ${event} → ${clients} client(s) call=${call.id} caller=${call.remoteNumber}`,
    JSON.stringify(payload, null, 2)
  )
  io.emit(event, payload)
  return true
}

export function emitIncomingCall(call: CallInfo): void {
  emitSocketEvent('incoming_call', call)
}

export function emitCallAnswered(call: CallInfo): void {
  emitSocketEvent('call_answered', call)
}

export function emitCallEnded(call: CallInfo): void {
  emitSocketEvent('call_ended', call)
}

export function emitNuisanceReport(
  call: CallInfo,
  nuisanceType: number,
  nuisanceLabel: string
): { success: boolean; error?: string; clients?: number } {
  const settings = peekSocketSettings()
  if (!settings?.enabled) {
    return { success: false, error: 'Socket server disabled' }
  }
  if (!io) {
    return { success: false, error: 'Socket server not running' }
  }
  const ok = emitSocketEvent('nuisance_report', call, {
    nuisance_type: nuisanceType,
    nuisance_label: nuisanceLabel,
  })
  return {
    success: ok,
    clients: io.engine?.clientsCount ?? 0,
    error: ok ? undefined : 'Emit failed',
  }
}

/** Broadcast logged-in operator to all form clients (call after login). */
export function emitOperatorInfo(
  userAccess?: UserAccessState | null
): { success: boolean; error?: string; clients?: number } {
  const settings = peekSocketSettings()
  if (!settings?.enabled) {
    return { success: false, error: 'Socket server disabled' }
  }
  if (!io) {
    return { success: false, error: 'Socket server not running' }
  }
  const payload = buildOperatorPayload(userAccess)
  if (!payload) {
    return { success: false, error: 'No operator profile to emit' }
  }
  const clients = io.engine?.clientsCount ?? 0
  logSocket(
    'sent',
    `Emit operator_info → ${clients} client(s)`,
    JSON.stringify(payload, null, 2)
  )
  io.emit('operator_info', payload)
  return { success: true, clients }
}
