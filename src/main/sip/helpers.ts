import { createHash, randomBytes } from 'crypto'
import { networkInterfaces } from 'os'
import dgram from 'dgram'
import type { AddressInfo } from 'net'

export function generateBranch(): string {
  return 'z9hG4bK' + randomBytes(12).toString('hex')
}

export function generateTag(): string {
  return randomBytes(8).toString('hex')
}

export function generateCallId(): string {
  return randomBytes(16).toString('hex')
}

export function generateCSeq(): number {
  return Math.floor(Math.random() * 2147483647)
}

export function generateBranchId(): string {
  return 'z9hG4bK' + randomBytes(16).toString('hex')
}

export function generateNonce(): string {
  return randomBytes(16).toString('base64')
}

export function generateOpaque(): string {
  return randomBytes(8).toString('hex')
}

// Parse a SIP URI: sip:user@host:port;params
export interface ParsedUri {
  scheme: string
  user: string
  host: string
  port: number
  params: Record<string, string>
}

export function parseSipUri(uri: string): ParsedUri {
  const result: ParsedUri = { scheme: 'sip', user: '', host: '', port: 5060, params: {} }
  let remaining = uri

  const schemeMatch = remaining.match(/^(\w+):/)
  if (schemeMatch) {
    result.scheme = schemeMatch[1]
    remaining = remaining.slice(schemeMatch[0].length)
  }

  const paramSplit = remaining.split(';')
  remaining = paramSplit[0]
  for (let i = 1; i < paramSplit.length; i++) {
    const [key, val] = paramSplit[i].split('=')
    result.params[key] = val || ''
  }

  if (remaining.startsWith('//')) remaining = remaining.slice(2)

  const atIdx = remaining.lastIndexOf('@')
  if (atIdx !== -1) {
    result.user = remaining.slice(0, atIdx)
    remaining = remaining.slice(atIdx + 1)
  }

  const colonIdx = remaining.indexOf(':')
  if (colonIdx !== -1) {
    result.host = remaining.slice(0, colonIdx)
    result.port = parseInt(remaining.slice(colonIdx + 1), 10) || 5060
  } else {
    result.host = remaining
  }

  return result
}

export function buildSipUri(user: string, host: string, port?: number): string {
  if (port && port !== 5060) {
    return `sip:${user}@${host}:${port}`
  }
  return `sip:${user}@${host}`
}

/**
 * RFC 3581: when responding, the top Via must include received=<src-ip>
 * and rport=<src-port> so the UAC/transaction layer can match the response.
 * PJSIP silently drops responses that omit these when the request had ;rport.
 */
export function rewriteTopVia(
  via: string,
  rinfo: { address: string; port: number }
): string {
  let v = via.trim()
  if (!v) return v

  v = v.replace(/;received=[^;]*/gi, '')
  if (/;rport=\d+/i.test(v)) {
    v = v.replace(/;rport=\d+/i, `;rport=${rinfo.port}`)
  } else if (/;rport(?=[;]|$)/i.test(v)) {
    v = v.replace(/;rport(?=[;]|$)/i, `;rport=${rinfo.port}`)
  } else {
    v += `;rport=${rinfo.port}`
  }
  v += `;received=${rinfo.address}`
  return v
}

/** Rewrite only the top Via; leave any additional Via hops unchanged. */
export function rewriteViasForResponse(
  vias: string[],
  rinfo: { address: string; port: number }
): string | string[] {
  if (!vias.length) return ''
  const out = vias.map((via, i) => (i === 0 ? rewriteTopVia(via, rinfo) : via))
  return out.length === 1 ? out[0] : out
}

// Digest Authentication per RFC 2617
export function computeDigestResponse(
  method: string,
  uri: string,
  realm: string,
  username: string,
  password: string,
  nonce: string,
  qop?: string,
  nc?: string,
  cnonce?: string
): string {
  const ha1 = createHash('md5').update(`${username}:${realm}:${password}`).digest('hex')
  const ha2 = createHash('md5').update(`${method}:${uri}`).digest('hex')

  if (qop) {
    return createHash('md5')
      .update(`${ha1}:${nonce}:${nc || '00000001'}:${cnonce || ''}:${qop}:${ha2}`)
      .digest('hex')
  }
  return createHash('md5').update(`${ha1}:${nonce}:${ha2}`).digest('hex')
}

export function parseAuthHeader(header: string): Record<string, string> {
  const result: Record<string, string> = {}
  const cleaned = header.replace(/^(Digest|digest)\s+/i, '')
  const parts = cleaned.split(',')
  for (const part of parts) {
    const [key, ...valParts] = part.split('=')
    if (key) {
      result[key.trim()] = valParts.join('=').trim().replace(/"/g, '')
    }
  }
  return result
}

// SDP builder
export interface SdpMedia {
  port: number
  codecs: { id: number; name: string; clockRate: number; channels?: number }[]
}

export function buildSdp(
  localIp: string,
  rtpPort: number,
  codecs: SdpMedia['codecs'],
  sessionId?: number,
  direction: 'sendrecv' | 'sendonly' | 'recvonly' | 'inactive' = 'sendrecv'
): string {
  const sid = sessionId || Math.floor(Date.now() / 1000)
  const lines = [
    'v=0',
    `o=voxphone ${sid} ${sid} IN IP4 ${localIp}`,
    's=VoxPhone',
    `c=IN IP4 ${localIp}`,
    't=0 0',
    `m=audio ${rtpPort} RTP/AVP ${codecs.map(c => c.id).join(' ')}`,
  ]

  for (const codec of codecs) {
    if (codec.name === 'PCMU') {
      lines.push(`a=rtpmap:${codec.id} PCMU/${codec.clockRate}`)
    } else if (codec.name === 'PCMA') {
      lines.push(`a=rtpmap:${codec.id} PCMA/${codec.clockRate}`)
    } else if (codec.name === 'opus') {
      lines.push(`a=rtpmap:${codec.id} opus/${codec.clockRate}/${codec.channels || 2}`)
      lines.push(`a=fmtp:${codec.id} minptime=20;useinbandfec=1`)
    }
  }

  lines.push('a=ptime:20')
  lines.push(`a=${direction}`)
  return lines.join('\r\n')
}

export function parseSdp(body: string): { port: number; address: string; codecs: { id: number; name: string; clockRate: number }[] } | null {
  const lines = body.split('\r\n')
  let address = ''
  let port = 0
  const codecs: { id: number; name: string; clockRate: number }[] = []

  for (const line of lines) {
    if (line.startsWith('c=IN IP4 ')) {
      address = line.slice(9).split(' ')[0]
    }
    if (line.startsWith('m=audio ')) {
      const parts = line.split(' ')
      port = parseInt(parts[1], 10)
      const payloadTypes = parts.slice(3).map(Number)
      for (const pt of payloadTypes) {
        codecs.push({ id: pt, name: '', clockRate: 8000 })
      }
    }
    if (line.startsWith('a=rtpmap:')) {
      const match = line.match(/a=rtpmap:(\d+)\s+(\w+)\/(\d+)/)
      if (match) {
        const id = parseInt(match[1], 10)
        const codec = codecs.find(c => c.id === id)
        if (codec) {
          codec.name = match[2]
          codec.clockRate = parseInt(match[3], 10)
        }
      }
    }
  }

  if (!port) return null
  return { port, address, codecs }
}

// Get local IP (prefer real LAN over Hyper-V / WSL / Docker virtual adapters)
export function getLocalIp(): string {
  try {
    const nets = networkInterfaces()
    const candidates: { address: string; score: number }[] = []

    for (const name of Object.keys(nets)) {
      const lower = name.toLowerCase()
      const virtual =
        lower.includes('vethernet') ||
        lower.includes('hyper-v') ||
        lower.includes('docker') ||
        lower.includes('wsl') ||
        lower.includes('virtualbox') ||
        lower.includes('vmware') ||
        lower.includes('loopback') ||
        lower.includes('default switch')

      for (const net of nets[name] || []) {
        const family = String(net.family)
        if ((family === 'IPv4' || family === '4') && !net.internal) {
          let score = 10
          if (virtual) score -= 20
          // Prefer common private LAN ranges; heavily penalize Hyper-V default 172.25.x / 172.16-31
          if (net.address.startsWith('192.168.')) score += 10
          else if (net.address.startsWith('10.')) score += 8
          else if (net.address.startsWith('172.25.')) score -= 15 // Hyper-V Default Switch
          else if (/^172\.(1[6-9]|2\d|3[0-1])\./.test(net.address)) score -= 5
          candidates.push({ address: net.address, score })
        }
      }
    }

    candidates.sort((a, b) => b.score - a.score)
    if (candidates.length > 0) return candidates[0].address
  } catch {}
  return '127.0.0.1'
}

/**
 * True for loopback hostnames / addresses (local Docker Asterisk, etc.).
 */
export function isLoopbackHost(host: string): boolean {
  const h = (host || '').trim().toLowerCase()
  if (!h) return false
  if (h === 'localhost' || h === '::1') return true
  // 127.0.0.0/8
  if (/^127\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(h)) return true
  return false
}

/**
 * Pick the local IP the OS would use to reach the SIP server.
 * Critical on multi-homed Windows (Hyper-V) so SDP/Contact/RTP use the same interface.
 * For localhost / 127.x, always use 127.0.0.1 — a LAN-bound socket cannot send to loopback (EADDRNOTAVAIL).
 */
export function getLocalIpToward(destination: string): string {
  const host = (destination || '').split(':')[0].trim()
  if (!host || host === '0.0.0.0' || host === '::') {
    return getLocalIp()
  }
  if (isLoopbackHost(host)) {
    return '127.0.0.1'
  }

  try {
    const socket = dgram.createSocket('udp4')
    socket.connect(5060, host)
    const addr = socket.address() as AddressInfo
    socket.close()
    if (addr?.address && addr.address !== '0.0.0.0') {
      // Never bind to loopback when talking to a remote PBX
      if (!isLoopbackHost(addr.address)) {
        return addr.address
      }
    }
  } catch {
    // fall through
  }
  return getLocalIp()
}
