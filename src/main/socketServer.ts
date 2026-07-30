import http from 'http'
import { Server as SocketIoServer } from 'socket.io'
import { getSettings } from './store'
import type { CallInfo, SocketServerSettings } from '../shared/types'

let httpServer: http.Server | null = null
let io: SocketIoServer | null = null
let listeningKey = ''

function configKey(cfg: SocketServerSettings): string {
  return `${cfg.enabled}|${cfg.host}|${cfg.port}|${cfg.authToken}`
}

function buildIncomingPayload(call: CallInfo) {
  return {
    event: 'incoming_call',
    call_id: call.id,
    caller_id: call.remoteNumber,
    caller_name: call.remoteName,
    extension: call.localNumber,
    direction: call.direction,
    issabel_id: call.issabelId || '',
    duration: call.duration,
    timestamp: new Date().toISOString(),
  }
}

export async function stopSocketServer(): Promise<void> {
  const currentIo = io
  const currentHttp = httpServer
  io = null
  httpServer = null
  listeningKey = ''

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
}

export async function startSocketServer(cfg?: SocketServerSettings): Promise<void> {
  const settings = cfg ?? getSettings().socketServer
  if (!settings?.enabled) {
    await stopSocketServer()
    return
  }

  const host = (settings.host || '127.0.0.1').trim() || '127.0.0.1'
  const port = Number(settings.port) > 0 ? Number(settings.port) : 3920
  const authToken = (settings.authToken || '').trim()
  const nextKey = configKey({ ...settings, host, port, authToken })

  if (io && httpServer && listeningKey === nextKey) {
    return
  }

  await stopSocketServer()

  const server = http.createServer((_req, res) => {
    res.writeHead(200, { 'Content-Type': 'text/plain; charset=utf-8' })
    res.end('امدادفون socket server')
  })

  const socketServer = new SocketIoServer(server, {
    cors: { origin: '*' },
  })

  socketServer.use((socket, next) => {
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
    next(new Error('unauthorized'))
  })

  await new Promise<void>((resolve, reject) => {
    server.once('error', reject)
    server.listen(port, host, () => {
      server.off('error', reject)
      resolve()
    })
  })

  httpServer = server
  io = socketServer
  listeningKey = nextKey
  console.log(`[socket] listening on http://${host}:${port}`)
}

export async function syncSocketServerFromSettings(): Promise<void> {
  try {
    await startSocketServer(getSettings().socketServer)
  } catch (err) {
    console.error('[socket] failed to start:', err)
    await stopSocketServer().catch(() => {})
  }
}

export function emitIncomingCall(call: CallInfo): void {
  const settings = getSettings().socketServer
  if (!settings?.enabled || !io) return
  io.emit('incoming_call', buildIncomingPayload(call))
}
