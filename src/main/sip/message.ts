// SIP Message Parser and Builder per RFC 3261

export interface SipHeaders {
  [key: string]: string | string[]
}

export interface SipMessage {
  isRequest: boolean
  method?: string
  uri?: string
  statusCode?: number
  reasonPhrase?: string
  headers: SipHeaders
  body?: string
  raw?: Buffer
}

const COMPACT_HEADERS: Record<string, string> = {
  v: 'via',
  f: 'from',
  t: 'to',
  i: 'call-id',
  m: 'contact',
  e: 'content-encoding',
  l: 'content-length',
  c: 'content-type',
  k: 'supported',
  o: 'event',
  u: 'allow-events',
  r: 'refer-to',
}

export function parseSipMessage(data: Buffer): SipMessage {
  const str = data.toString('utf8')
  const headerEnd = str.indexOf('\r\n\r\n')
  const headerSection = headerEnd >= 0 ? str.slice(0, headerEnd) : str
  const body = headerEnd >= 0 ? str.slice(headerEnd + 4) : ''

  const headerLines = headerSection.split('\r\n')
  const firstLine = headerLines[0]

  const msg: SipMessage = {
    isRequest: false,
    headers: {},
    body,
    raw: data,
  }

  if (firstLine.startsWith('SIP/')) {
    // Response: SIP/2.0 200 OK
    msg.isRequest = false
    const parts = firstLine.split(' ')
    msg.statusCode = parseInt(parts[1], 10)
    msg.reasonPhrase = parts.slice(2).join(' ')
  } else {
    // Request: INVITE sip:user@host SIP/2.0
    msg.isRequest = true
    const parts = firstLine.split(' ')
    msg.method = parts[0]
    msg.uri = parts[1]
  }

  // Parse headers
  for (let i = 1; i < headerLines.length; i++) {
    const line = headerLines[i]
    if (!line) continue

    if (line.startsWith(' ') || line.startsWith('\t')) {
      // Continuation of previous header
      const lastKey = Object.keys(msg.headers).pop()
      if (lastKey) {
        const lastVal = msg.headers[lastKey]
        if (Array.isArray(lastVal)) {
          lastVal[lastVal.length - 1] += ' ' + line.trim()
        } else if (typeof lastVal === 'string') {
          msg.headers[lastKey] = lastVal + ' ' + line.trim()
        }
      }
      continue
    }

    const colonIdx = line.indexOf(':')
    if (colonIdx === -1) continue

    let key = line.slice(0, colonIdx).trim().toLowerCase()
    key = COMPACT_HEADERS[key] || key
    const value = line.slice(colonIdx + 1).trim()

    if (msg.headers[key] !== undefined) {
      const existing = msg.headers[key]
      if (Array.isArray(existing)) {
        existing.push(value)
      } else {
        msg.headers[key] = [existing, value]
      }
    } else {
      msg.headers[key] = value
    }
  }

  return msg
}

const SIP_HEADER_CANON: Record<string, string> = {
  via: 'Via',
  from: 'From',
  to: 'To',
  'call-id': 'Call-ID',
  cseq: 'CSeq',
  contact: 'Contact',
  'content-type': 'Content-Type',
  'content-length': 'Content-Length',
  'user-agent': 'User-Agent',
  allow: 'Allow',
  supported: 'Supported',
  require: 'Require',
  'record-route': 'Record-Route',
  route: 'Route',
  'session-expires': 'Session-Expires',
  'max-forwards': 'Max-Forwards',
  authorization: 'Authorization',
  'www-authenticate': 'WWW-Authenticate',
  'proxy-authenticate': 'Proxy-Authenticate',
  'proxy-authorization': 'Proxy-Authorization',
  expires: 'Expires',
  'refer-to': 'Refer-To',
  'referred-by': 'Referred-By',
  event: 'Event',
  'subscription-state': 'Subscription-State',
}

function canonHeaderName(key: string): string {
  return SIP_HEADER_CANON[key.toLowerCase()] || key
}

export function buildSipMessage(msg: SipMessage): Buffer {
  let firstLine = ''

  if (msg.isRequest) {
    firstLine = `${msg.method} ${msg.uri} SIP/2.0`
  } else {
    firstLine = `SIP/2.0 ${msg.statusCode} ${msg.reasonPhrase || 'OK'}`
  }

  const headerLines: string[] = [firstLine]

  for (const [key, value] of Object.entries(msg.headers)) {
    const name = canonHeaderName(key)
    if (Array.isArray(value)) {
      for (const v of value) {
        headerLines.push(`${name}: ${v}`)
      }
    } else {
      headerLines.push(`${name}: ${value}`)
    }
  }

  const headerStr = headerLines.join('\r\n') + '\r\n\r\n'
  const bodyStr = msg.body || ''

  return Buffer.from(headerStr + bodyStr, 'utf8')
}

export function getHeader(msg: SipMessage, name: string): string | undefined {
  const val = msg.headers[name.toLowerCase()]
  if (Array.isArray(val)) return val[0]
  return val
}

export function getHeaderAll(msg: SipMessage, name: string): string[] {
  const val = msg.headers[name.toLowerCase()]
  if (Array.isArray(val)) return val
  if (val) return [val]
  return []
}

export function getHeaderValue(header: string, param: string): string | undefined {
  // Extract parameter from header value like: Digest realm="test", nonce="abc"
  const regex = new RegExp(`${param}\\s*=\\s*"?([^",;]+)"?`)
  const match = header.match(regex)
  return match ? match[1] : undefined
}

// Create common request headers
export function createRequestHeaders(
  from: string,
  to: string,
  callId: string,
  cseq: number,
  branch: string,
  fromTag: string,
  extra?: Record<string, string>
): SipHeaders {
  const headers: SipHeaders = {
    'via': `SIP/2.0/UDP ${from.split('@')[1] || from};branch=${branch};rport`,
    'from': `<${from}>;tag=${fromTag}`,
    'to': `<${to}>`,
    'call-id': callId,
    'cseq': `${cseq} ${''}`,
    'max-forwards': '70',
    'user-agent': 'VoxPhone/1.0',
    'contact': `<${from}>`,
    'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY',
    'supported': 'timer',
    'content-length': '0',
  }

  if (extra) {
    Object.assign(headers, extra)
  }

  return headers
}

// Create common response headers
export function createResponseHeaders(
  msg: SipMessage,
  statusCode: number,
  localAddress: string,
  extra?: Record<string, string>
): SipHeaders {
  const via = getHeader(msg, 'via') || ''
  const from = getHeader(msg, 'from') || ''
  const to = getHeader(msg, 'to') || ''
  const callId = getHeader(msg, 'call-id') || ''
  const cseq = getHeader(msg, 'cseq') || ''

  const headers: SipHeaders = {
    'via': via,
    'from': from,
    'to': to,
    'call-id': callId,
    'cseq': cseq,
    'server': 'VoxPhone/1.0',
    'content-length': '0',
  }

  // Add To-tag for final responses to INVITE
  if (!to.includes('tag=') && statusCode >= 200) {
    const { randomBytes } = require('crypto')
    const tag = randomBytes(8).toString('hex')
    headers['to'] = `${to};tag=${tag}`
  }

  if (extra) {
    Object.assign(headers, extra)
  }

  return headers
}
