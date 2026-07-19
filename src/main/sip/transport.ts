import { EventEmitter } from 'events'
import dgram from 'dgram'
import { parseSipMessage, buildSipMessage, getHeader, type SipMessage, type SipHeaders } from './message'
import { appendSipLogLine } from '../ringtone'

export interface TransportConfig {
  port: number
  address?: string
}

// Global log buffer - all SIP messages stored here
export const sipLogBuffer: Array<{
  timestamp: number
  direction: 'sent' | 'recv' | 'error' | 'info'
  message: string
  raw?: string
}> = []

const MAX_LOG = 500

export function addLog(direction: 'sent' | 'recv' | 'error' | 'info', message: string, raw?: string) {
  const entry = { timestamp: Date.now(), direction, message, raw }
  sipLogBuffer.push(entry)
  if (sipLogBuffer.length > MAX_LOG) sipLogBuffer.shift()
  const tag = direction === 'sent' ? '>>>' : direction === 'recv' ? '<<<' : direction === 'error' ? '!!!' : '---'
  const time = new Date(entry.timestamp).toISOString()
  console.log(`[SIP ${tag}] ${message}`)
  try {
    const line = `[${time}] ${tag} ${message}${raw ? `\n${raw}\n` : ''}`
    appendSipLogLine(line)
  } catch {}
}

export function clearLog() {
  sipLogBuffer.length = 0
}

export class SipTransport extends EventEmitter {
  private socket: dgram.Socket | null = null
  private config: TransportConfig
  private started = false

  constructor(config: TransportConfig) {
    super()
    this.config = config
  }

  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.started) {
        resolve()
        return
      }

      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      this.socket.on('message', (data: Buffer, rinfo: dgram.RemoteInfo) => {
        try {
          const msg = parseSipMessage(data)
          const summary = msg.isRequest
            ? `${msg.method} ${msg.uri}`
            : `${msg.statusCode} ${msg.reasonPhrase}`
          addLog('recv', `From ${rinfo.address}:${rinfo.port} - ${summary}`, data.toString('utf8'))
          this.emit('message', msg, rinfo)
        } catch (err) {
          addLog('error', `Parse error from ${rinfo.address}:${rinfo.port}: ${err}`)
          this.emit('error', err)
        }
      })

      this.socket.on('error', (err) => {
        addLog('error', `Socket error: ${err.message}`)
        this.emit('error', err)
      })

      this.socket.on('close', () => {
        addLog('info', 'Socket closed')
        this.started = false
      })

      this.socket.on('listening', () => {
        const addr = this.socket!.address()
        this.started = true
        addLog('info', `Transport listening on ${addr.address}:${addr.port}`)
        this.emit('listening')
        resolve()
      })

      try {
        this.socket.bind(this.config.port, this.config.address || '0.0.0.0')
      } catch (err: any) {
        addLog('error', `Bind failed on port ${this.config.port}: ${err.message}, trying random port`)
        try {
          this.socket.bind(0, this.config.address || '0.0.0.0')
        } catch (err2: any) {
          addLog('error', `Random port bind also failed: ${err2.message}`)
          reject(err2)
        }
      }
    })
  }

  stop(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket && this.started) {
        addLog('info', 'Stopping transport...')
        this.socket.close(() => {
          this.started = false
          this.socket = null
          resolve()
        })
      } else {
        resolve()
      }
    })
  }

  send(msg: SipMessage, host: string, port: number): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.socket || !this.started) {
        const err = new Error('Transport not started')
        addLog('error', `Send failed: ${err.message}`)
        reject(err)
        return
      }

      const data = buildSipMessage(msg)
      const summary = msg.isRequest
        ? `${msg.method} ${msg.uri}`
        : `${msg.statusCode} ${msg.reasonPhrase}`

      addLog('sent', `To ${host}:${port} - ${summary}`, data.toString('utf8'))

      this.socket.send(data, 0, data.length, port, host, (err) => {
        if (err) {
          addLog('error', `Send error to ${host}:${port}: ${err.message}`)
          reject(err)
        } else {
          resolve()
        }
      })
    })
  }

  getPort(): number {
    if (this.socket) {
      return this.socket.address().port
    }
    return this.config.port
  }

  isStarted(): boolean {
    return this.started
  }
}
