import { EventEmitter } from 'events'
import { SipTransport, addLog, sipLogBuffer } from './transport'
import {
  generateBranch,
  generateTag,
  generateCallId,
  generateCSeq,
  computeDigestResponse,
  parseAuthHeader,
  buildSdp,
  parseSdp,
  getLocalIp,
  buildSipUri,
  parseSipUri,
  getLocalIpToward,
  isLoopbackHost,
  rewriteViasForResponse,
} from './helpers'
import { getHeader, getHeaderAll, type SipMessage } from './message'
import { AudioSession } from '../rtp/session'
import { getSettings } from '../store'
import type { SipAccount, CallInfo, Codec } from '../../shared/types'

const CODEC_MAP: Record<string, { id: number; clockRate: number; channels?: number }> = {
  PCMU: { id: 0, clockRate: 8000 },
  PCMA: { id: 8, clockRate: 8000 },
  opus: { id: 111, clockRate: 48000, channels: 2 },
}

/** Codecs we can actually encode/decode in RTP today */
const MEDIA_CODECS: Codec[] = ['PCMU', 'PCMA']

export class SipEngine extends EventEmitter {
  private transport: SipTransport
  private account: SipAccount | null = null
  private localIp = ''
  /** UDP bind address; may be 0.0.0.0 while localIp (Contact/SDP) stays specific */
  private bindAddress = '0.0.0.0'
  private localSipPort = 5060
  private localRtpPort = 10000

  // Registration state
  private regBranch = ''
  private regFromTag = ''
  private regCallId = ''
  private regCSeq = 0
  private regExpires = 300
  private regTimer: ReturnType<typeof setTimeout> | null = null
  private regTimeout: ReturnType<typeof setTimeout> | null = null
  private regNonce = ''
  private regRealm = ''
  private regServer = ''
  private regServerPort = 5060
  private registered = false

  // Active calls
  private activeCalls = new Map<string, CallInfo>()
  private callCSeq = 0

  // Track where the INVITE came from (for sending responses back)
  private callSignalingAddr = new Map<string, { host: string; port: number }>()

  // Outbound INVITE context (for digest re-auth and correct ACK CSeq)
  private callInviteCtx = new Map<string, {
    requestUri: string
    toHeader: string
    fromHeader: string
    inviteCSeq: number
    sdp: string
    authAttempted: boolean
    remoteContact?: string
  }>()

  // Inbound dialog info for correct BYE after we answered
  private inboundDialog = new Map<string, {
    fromHeader: string
    toHeader: string
    remoteContact: string
  }>()

  // Original inbound INVITE (needed for correct 200 OK)
  private inboundInvites = new Map<string, SipMessage>()

  // Last provisional / final response for retransmits
  private inboundRinging = new Map<string, SipMessage>()
  private inboundOk = new Map<string, SipMessage>()
  private okRetransmitTimers = new Map<string, ReturnType<typeof setInterval>>()

  // RTP media sessions per call
  private mediaSessions = new Map<string, AudioSession>()
  private mutedCalls = new Set<string>()

  // Blind transfer (REFER) in progress
  private pendingTransfers = new Map<string, {
    target: string
    referCSeq: number
    requestUri: string
    fromHeader: string
    toHeader: string
    sendHost: string
    sendPort: number
    authAttempted: boolean
    timeout: ReturnType<typeof setTimeout>
  }>()

  constructor() {
    super()
    this.localIp = getLocalIp()
    addLog('info', `Local IP detected: ${this.localIp}`)
    this.transport = new SipTransport({ port: 0, address: '0.0.0.0' })
    this.setupTransport()
  }

  private rebuildTransportBoundToLocalIp() {
    // Bind address can be 0.0.0.0 (needed for Docker localhost on Windows);
    // Contact/SDP still use this.localIp.
    this.transport = new SipTransport({
      port: 0,
      address: this.bindAddress || '0.0.0.0',
    })
    this.setupTransport()
  }

  private setupTransport() {
    this.transport.on('message', (msg: SipMessage, rinfo: { address: string; port: number }) => {
      this.handleMessage(msg, rinfo).catch(err => {
        addLog('error', `handleMessage error: ${err.message}`)
      })
    })

    this.transport.on('error', (err: Error) => {
      addLog('error', `Transport error: ${err.message}`)
      this.emit('error', err)
    })

    this.transport.on('listening', () => {
      this.localSipPort = this.transport.getPort()
      addLog('info', `SIP listening on port ${this.localSipPort}`)
    })
  }

  async start(): Promise<void> {
    addLog('info', `Starting SIP engine on ${this.localIp}...`)
    if (this.transport.isStarted()) {
      await this.transport.stop()
    }
    this.rebuildTransportBoundToLocalIp()
    await this.transport.start()
    this.emit('started', { port: this.localSipPort })
  }

  async stop(): Promise<void> {
    addLog('info', 'Stopping SIP engine...')
    this.clearRegTimeout()
    this.stopRegTimer()
    try { await this.unregister() } catch {}
    this.registered = false
    await this.transport.stop()
  }

  /** Host/port used for outbound SIP signaling (proxy if set, else server). */
  private getSignalTarget(): { host: string; port: number } {
    const a = this.account!
    if (a.sipProxy) {
      const proxy = a.sipProxy.includes(':') ? a.sipProxy : `${a.sipProxy}:${a.localPort || 5060}`
      const [host, portStr] = proxy.split(':')
      return { host, port: parseInt(portStr, 10) || a.localPort || 5060 }
    }
    return { host: a.sipServer, port: a.localPort || 5060 }
  }

  getLogBuffer() {
    return sipLogBuffer
  }

  // ============================================================
  // Registration
  // ============================================================

  async configure(account: SipAccount): Promise<void> {
    this.account = account
    this.regExpires = account.registerExpiry || 300
    this.regServer = account.sipServer
    this.regServerPort = account.localPort || 5060

    // Interface that reaches the PBX — must match Contact + SDP + RTP source.
    // For 127.0.0.1/localhost: advertise loopback in Contact, but bind UDP to 0.0.0.0
    // (binding to 127.0.0.1 breaks Docker Desktop UDP port-forward on Windows).
    const targetHost = (account.sipProxy || account.sipServer || '').split(':')[0]
    const toward = getLocalIpToward(targetHost)
    this.localIp = toward || getLocalIp()
    this.bindAddress = isLoopbackHost(targetHost) ? '0.0.0.0' : this.localIp
    addLog('info', `Account configured: ${account.username}@${account.sipServer}`)
    addLog('info', `Local IP for signaling/media (toward PBX): ${this.localIp}`)
    addLog('info', `SIP socket bind address: ${this.bindAddress}`)
  }

  async register(): Promise<void> {
    if (!this.account) {
      addLog('error', 'Cannot register: no account configured')
      throw new Error('No account configured')
    }

    if (!this.transport.isStarted()) {
      addLog('error', 'Cannot register: transport not started')
      throw new Error('Transport not started')
    }

    const a = this.account
    this.registered = false
    this.clearRegTimeout()

    this.regBranch = generateBranch()
    this.regFromTag = generateTag()
    this.regCallId = generateCallId()
    this.regCSeq = generateCSeq()

    const fromUri = buildSipUri(a.username, a.domain || a.sipServer)
    const requestUri = buildSipUri(a.username, a.sipServer, a.localPort || 5060)
    const contactUri = `sip:${a.username}@${this.localIp}:${this.localSipPort}`
    const target = this.getSignalTarget()

    addLog('info', `REGISTER sip:${a.sipServer} via ${target.host}:${target.port} (${a.username}@${a.domain || a.sipServer})`)
    addLog('info', `Contact: ${contactUri} | Local IP: ${this.localIp}`)

    const msg: SipMessage = {
      isRequest: true,
      method: 'REGISTER',
      uri: requestUri,
      headers: {
        'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${this.regBranch};rport`,
        'from': `<${fromUri}>;tag=${this.regFromTag}`,
        'to': `<${fromUri}>`,
        'call-id': this.regCallId,
        'cseq': `${this.regCSeq} REGISTER`,
        'max-forwards': '70',
        'user-agent': 'VoxPhone/1.0',
        'contact': `<${contactUri}>`,
        'expires': String(this.regExpires),
        'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY',
        'content-length': '0',
      },
      body: '',
    }

    this.emit('registration-status', { status: 'connecting', expires: 0 })

    try {
      await this.transport.send(msg, target.host, target.port)
      this.armRegTimeout()
    } catch (err: any) {
      const errorMessage = `Failed to send REGISTER to ${target.host}:${target.port}: ${err.message}`
      addLog('error', errorMessage)
      this.emit('registration-status', { status: 'failed', expires: 0, errorMessage })
      throw err
    }
  }

  private armRegTimeout() {
    this.clearRegTimeout()
    this.regTimeout = setTimeout(() => {
      if (this.registered) return
      const target = this.account ? this.getSignalTarget() : { host: '?', port: 0 }
      const errorMessage = `No response from SIP server ${target.host}:${target.port} (timeout 12s). Check server address, port, firewall, and UDP connectivity.`
      addLog('error', errorMessage)
      this.emit('registration-status', { status: 'failed', expires: 0, errorMessage })
    }, 12000)
  }

  private clearRegTimeout() {
    if (this.regTimeout) {
      clearTimeout(this.regTimeout)
      this.regTimeout = null
    }
  }

  async unregister(): Promise<void> {
    if (!this.account) return

    this.clearRegTimeout()
    this.stopRegTimer()
    this.registered = false

    const a = this.account
    const fromUri = buildSipUri(a.username, a.domain || a.sipServer)
    const requestUri = buildSipUri(a.username, a.sipServer, a.localPort || 5060)
    const target = this.getSignalTarget()

    addLog('info', 'Unregistering...')

    const msg: SipMessage = {
      isRequest: true,
      method: 'REGISTER',
      uri: requestUri,
      headers: {
        'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
        'from': `<${fromUri}>;tag=${this.regFromTag}`,
        'to': `<${fromUri}>`,
        'call-id': this.regCallId,
        'cseq': `${++this.regCSeq} REGISTER`,
        'max-forwards': '70',
        'user-agent': 'VoxPhone/1.0',
        'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
        'expires': '0',
        'content-length': '0',
      },
      body: '',
    }

    try {
      await this.transport.send(msg, target.host, target.port)
    } catch {}
    this.emit('registration-status', { status: 'disconnected', expires: 0 })
  }

  private startRegTimer(expires: number) {
    this.stopRegTimer()
    const reRegTime = Math.floor(expires * 0.75) * 1000
    addLog('info', `Re-register in ${Math.floor(reRegTime / 1000)}s (expires=${expires}s)`)
    this.regTimer = setTimeout(() => {
      addLog('info', 'Re-registering (timer)')
      this.register()
    }, reRegTime)
  }

  private stopRegTimer() {
    if (this.regTimer) {
      clearTimeout(this.regTimer)
      this.regTimer = null
    }
  }

  // ============================================================
  // Call Management
  // ============================================================

  async makeCall(number: string): Promise<string> {
    if (!this.account) {
      addLog('error', 'Cannot make call: no account')
      throw new Error('No account configured. Add a SIP account in Settings.')
    }
    if (this.transport.isStarted() === false) {
      addLog('error', 'Cannot make call: transport not started')
      throw new Error('SIP engine not started. Open Settings → Debug and click Reconnect.')
    }
    if (!this.registered) {
      addLog('error', 'Cannot make call: not registered')
      throw new Error('Not registered with SIP server. Check account settings and Debug log.')
    }

    const a = this.account
    const callId = generateCallId()
    const fromTag = generateTag()
    const branch = generateBranch()
    const cseq = ++this.callCSeq

    // Even RTP port
    this.localRtpPort = 10000 + Math.floor(Math.random() * 5000) * 2

    // Resolve the target server — signaling goes via proxy/server; Request-URI is the dialed party
    const signal = this.getSignalTarget()
    let targetHost = a.domain || a.sipServer
    let targetPort = a.localPort || 5060
    let targetUser = number

    if (number.startsWith('sip:')) {
      const parsed = parseSipUri(number)
      targetHost = parsed.host
      targetPort = parsed.port || 5060
      targetUser = parsed.user
    } else if (number.includes('@')) {
      const parsed = parseSipUri(`sip:${number}`)
      targetHost = parsed.host
      targetPort = parsed.port || 5060
      targetUser = parsed.user
    }

    const fromUri = buildSipUri(a.username, a.domain || a.sipServer)
    const toUri = buildSipUri(targetUser, targetHost, targetPort !== 5060 ? targetPort : undefined)
    const requestUri = toUri

    // Build SDP — only codecs we can actually send/receive today
    const preferred = (a.codecs || MEDIA_CODECS).filter((c): c is Codec =>
      MEDIA_CODECS.includes(c as Codec)
    )
    const codecNames = preferred.length > 0 ? preferred : MEDIA_CODECS
    const codecs = codecNames.map(name => {
      const c = CODEC_MAP[name]
      return c ? { id: c.id, name, clockRate: c.clockRate, channels: c.channels } : null
    }).filter(Boolean) as { id: number; name: string; clockRate: number; channels?: number }[]

    if (codecs.length === 0) {
      codecs.push({ id: 0, name: 'PCMU', clockRate: 8000 })
    }

    const sdp = buildSdp(this.localIp, this.localRtpPort, codecs)

    addLog('info', `Making call: ${number} -> Request-URI ${requestUri} via ${signal.host}:${signal.port}`)
    addLog('info', `SDP:\n${sdp}`)

    const msg: SipMessage = {
      isRequest: true,
      method: 'INVITE',
      uri: requestUri,
      headers: {
        'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${branch};rport`,
        'from': `<${fromUri}>;tag=${fromTag}`,
        'to': `<${toUri}>`,
        'call-id': callId,
        'cseq': `${cseq} INVITE`,
        'max-forwards': '70',
        'user-agent': 'VoxPhone/1.0',
        'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
        'content-type': 'application/sdp',
        'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY, UPDATE',
        'supported': 'timer',
        'content-length': String(Buffer.byteLength(sdp)),
      },
      body: sdp,
    }

    const callInfo: CallInfo = {
      id: callId,
      state: 'outgoing',
      direction: 'outbound',
      remoteNumber: number,
      remoteName: '',
      localNumber: a.username,
      issabelId: '',
      startTime: Date.now(),
      answerTime: 0,
      endTime: 0,
      duration: 0,
      isMuted: false,
      isOnHold: false,
      isRecording: false,
      codec: a.codecs?.[0] || 'PCMU',
      remoteRtpPort: 0,
      remoteRtpAddress: '',
      localRtpPort: this.localRtpPort,
      callId,
      fromTag,
      toTag: '',
    }

    this.activeCalls.set(callId, callInfo)
    this.callSignalingAddr.set(callId, { host: signal.host, port: signal.port })
    this.callInviteCtx.set(callId, {
      requestUri,
      toHeader: `<${toUri}>`,
      fromHeader: `<${fromUri}>;tag=${fromTag}`,
      inviteCSeq: cseq,
      sdp,
      authAttempted: false,
    })
    this.emit('outgoing-call', callInfo)
    this.emitCallState(callId, 'outgoing')

    await this.transport.send(msg, signal.host, signal.port)
    return callId
  }

  async answerCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) {
      addLog('error', `Cannot answer call ${callId}: not found or no account`)
      return
    }

    const invite = this.inboundInvites.get(callId)
    if (!invite) {
      addLog('error', `Cannot answer call ${callId}: missing original INVITE`)
      return
    }

    // Already answered — just retransmit 200 OK
    if (call.state === 'active' && this.inboundOk.has(callId)) {
      await this.retransmitOk(callId)
      return
    }

    const a = this.account
    this.localRtpPort = 10000 + Math.floor(Math.random() * 5000) * 2

    const remoteSdp = invite.body ? parseSdp(invite.body) : null
    const remoteNames = new Set((remoteSdp?.codecs || []).map(c => c.name.toUpperCase()))
    let chosen: Codec = 'PCMU'
    if (remoteNames.has('PCMU') || remoteNames.has('G711U')) chosen = 'PCMU'
    else if (remoteNames.has('PCMA') || remoteNames.has('G711A')) chosen = 'PCMA'

    const codecDef = CODEC_MAP[chosen]
    const codecs = [{ id: codecDef.id, name: chosen, clockRate: codecDef.clockRate }]
    const sig = this.callSignalingAddr.get(callId)

    const vias = getHeaderAll(invite, 'via')
    const fromHeader = getHeader(invite, 'from') || ''
    const toHeader = getHeader(invite, 'to') || ''
    const cseq = getHeader(invite, 'cseq') || ''
    const recordRoutes = getHeaderAll(invite, 'record-route')
    const sessionExpires = getHeader(invite, 'session-expires')

    if (!vias.length || !fromHeader || !cseq) {
      addLog('error', `Cannot answer ${callId}: incomplete INVITE headers (via=${vias.length} from=${!!fromHeader} cseq=${cseq})`)
      return
    }

    // Keep the same To-tag used in 180 Ringing
    const toWithTag = toHeader.includes('tag=')
      ? toHeader
      : `${toHeader};tag=${call.toTag}`

    // CSeq in 2xx must remain "<num> INVITE"
    const cseqInvite = /\bINVITE\b/i.test(cseq) ? cseq : `${cseq.split(/\s+/)[0] || '1'} INVITE`

    call.codec = chosen
    call.localRtpPort = this.localRtpPort
    await this.startMedia(callId, call)
    this.localRtpPort = call.localRtpPort
    const sdp = buildSdp(this.localIp, call.localRtpPort, codecs)
    addLog('info', `Answering call ${callId} codec=${chosen} rtp=${this.localIp}:${call.localRtpPort}`)

    const sendHost = sig?.host || a.sipServer
    const sendPort = sig?.port || 5060
    const viaHeader = rewriteViasForResponse(vias, { address: sendHost, port: sendPort })

    const headers: Record<string, string | string[]> = {
      'via': viaHeader,
      'from': fromHeader,
      'to': toWithTag,
      'call-id': callId,
      'cseq': cseqInvite,
      'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
      'content-type': 'application/sdp',
      'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY, UPDATE',
      'supported': 'timer, replaces',
      'user-agent': 'VoxPhone/1.0',
      'content-length': String(Buffer.byteLength(sdp, 'utf8')),
    }
    if (recordRoutes.length === 1) headers['record-route'] = recordRoutes[0]
    else if (recordRoutes.length > 1) headers['record-route'] = recordRoutes
    if (sessionExpires) {
      const se = sessionExpires.split(';')[0].trim()
      headers['session-expires'] = `${se};refresher=uas`
    }

    const msg: SipMessage = {
      isRequest: false,
      statusCode: 200,
      reasonPhrase: 'OK',
      headers,
      body: sdp,
    }

    call.state = 'active'
    call.answerTime = Date.now()

    // Save dialog for BYE (must match INVITE From/To tags + remote Contact)
    const inviteContact = getHeader(invite, 'contact') || ''
    const contactMatch = inviteContact.match(/<([^>]+)>/) || inviteContact.match(/(sip:[^\s;>]+)/i)
    const remoteContact = contactMatch
      ? contactMatch[1]
      : `sip:${call.remoteNumber}@${sendHost}`
    this.inboundDialog.set(callId, {
      fromHeader,
      toHeader: toWithTag,
      remoteContact,
    })

    this.inboundOk.set(callId, msg)
    addLog('info', `Sending 200 OK to ${sendHost}:${sendPort} (cseq=${cseqInvite})`)
    await this.transport.send(msg, sendHost, sendPort)
    this.startOkRetransmit(callId, sendHost, sendPort)
    this.emitCallState(callId, 'active')
  }

  private startOkRetransmit(callId: string, host: string, port: number) {
    this.stopOkRetransmit(callId)
    let interval = 500
    const timer = setInterval(() => {
      const msg = this.inboundOk.get(callId)
      const call = this.activeCalls.get(callId)
      if (!msg || !call || call.state !== 'active') {
        this.stopOkRetransmit(callId)
        return
      }
      addLog('info', `Retransmitting 200 OK for ${callId}`)
      this.transport.send(msg, host, port).catch(() => {})
      interval = Math.min(interval * 2, 4000)
    }, 500)
    // Store; clear on ACK or after ~32s
    this.okRetransmitTimers.set(callId, timer)
    setTimeout(() => this.stopOkRetransmit(callId), 32000)
  }

  private stopOkRetransmit(callId: string) {
    const t = this.okRetransmitTimers.get(callId)
    if (t) {
      clearInterval(t)
      this.okRetransmitTimers.delete(callId)
    }
  }

  private async retransmitOk(callId: string) {
    const msg = this.inboundOk.get(callId)
    const sig = this.callSignalingAddr.get(callId)
    if (!msg || !sig) return
    addLog('info', `Retransmitting stored 200 OK for ${callId}`)
    await this.transport.send(msg, sig.host, sig.port)
  }

  async hangupCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) {
      addLog('error', `Cannot hangup ${callId}: not found`)
      return
    }

    const a = this.account
    const sig = this.callSignalingAddr.get(callId)
    const sendHost = sig?.host || a.sipServer
    const sendPort = sig?.port || a.localPort || 5060
    const ctx = this.callInviteCtx.get(callId)
    const inbound = this.inboundDialog.get(callId)

    addLog('info', `Hangup call ${callId} (state=${call.state})`)

    // Prefer exact dialog headers from the established session
    let fromHdr: string
    let toHdr: string
    let requestUri: string

    if (call.direction === 'inbound' && inbound) {
      // UAS BYE: From = our To (with to-tag), To = their From (with from-tag)
      fromHdr = inbound.toHeader
      toHdr = inbound.fromHeader
      requestUri = inbound.remoteContact
    } else if (call.direction === 'inbound') {
      const localUri = buildSipUri(a.username, a.domain || a.sipServer)
      const remoteUri = buildSipUri(call.remoteNumber, a.domain || a.sipServer)
      fromHdr = `<${localUri}>;tag=${call.toTag}`
      toHdr = `<${remoteUri}>;tag=${call.fromTag}`
      requestUri = `sip:${call.remoteNumber}@${sendHost}`
    } else {
      const localUri = buildSipUri(a.username, a.domain || a.sipServer)
      const remoteUri = buildSipUri(call.remoteNumber, a.domain || a.sipServer)
      fromHdr = `<${localUri}>;tag=${call.fromTag}`
      toHdr = `<${remoteUri}>;tag=${call.toTag}`
      requestUri = ctx?.remoteContact || `sip:${call.remoteNumber}@${sendHost}`
    }

    if (call.state === 'active' || call.state === 'holding' || call.state === 'held') {
      const msg: SipMessage = {
        isRequest: true,
        method: 'BYE',
        uri: requestUri,
        headers: {
          'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
          'from': fromHdr,
          'to': toHdr,
          'call-id': callId,
          'cseq': `${++this.callCSeq} BYE`,
          'max-forwards': '70',
          'user-agent': 'VoxPhone/1.0',
          'content-length': '0',
        },
        body: '',
      }
      addLog('info', `Sending BYE to ${sendHost}:${sendPort} uri=${requestUri}`)
      await this.transport.send(msg, sendHost, sendPort)
    } else if (call.state === 'outgoing' || call.state === 'connecting' || call.state === 'ringing') {
      if (call.direction === 'outbound') {
        const localUri = buildSipUri(a.username, a.domain || a.sipServer)
        const remoteUri = buildSipUri(call.remoteNumber, a.domain || a.sipServer)
        const cancelFrom = `<${localUri}>;tag=${call.fromTag}`
        const msg: SipMessage = {
          isRequest: true,
          method: 'CANCEL',
          uri: ctx?.requestUri || `sip:${call.remoteNumber}@${sendHost}`,
          headers: {
            'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
            'from': cancelFrom,
            'to': `<${remoteUri}>`,
            'call-id': callId,
            'cseq': `${ctx?.inviteCSeq || ++this.callCSeq} CANCEL`,
            'max-forwards': '70',
            'user-agent': 'VoxPhone/1.0',
            'content-length': '0',
          },
          body: '',
        }
        await this.transport.send(msg, sendHost, sendPort)
      } else {
        // Reject incoming
        const invite = this.inboundInvites.get(callId)
        if (invite) {
          const toHdrInvite = getHeader(invite, 'to') || ''
          const toWithTag = toHdrInvite.includes('tag=')
            ? toHdrInvite
            : `${toHdrInvite};tag=${call.toTag}`
          const decline: SipMessage = {
            isRequest: false,
            statusCode: 603,
            reasonPhrase: 'Decline',
            headers: {
              'via': rewriteViasForResponse(getHeaderAll(invite, 'via'), { address: sendHost, port: sendPort }),
              'from': getHeader(invite, 'from') || '',
              'to': toWithTag,
              'call-id': callId,
              'cseq': getHeader(invite, 'cseq') || '',
              'content-length': '0',
            },
            body: '',
          }
          await this.transport.send(decline, sendHost, sendPort)
        }
      }
    }

    this.stopMedia(callId)
    this.stopOkRetransmit(callId)
    this.clearPendingTransfer(callId)
    this.inboundOk.delete(callId)
    this.inboundRinging.delete(callId)
    const wasAnswered = call.answerTime > 0
    const wasRejected = call.direction === 'inbound' && !wasAnswered
    call.state = 'ended'
    call.endTime = Date.now()
    call.duration = wasAnswered
      ? Math.floor((call.endTime - call.answerTime) / 1000)
      : 0
    this.emitCallEnded(callId, wasRejected ? 'rejected' : undefined)
  }

  async holdCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) return
    if (call.state !== 'active' && call.state !== 'holding') return
    addLog('info', `Hold call ${callId}`)
    try {
      await this.sendReInvite(callId, true)
      call.isOnHold = true
      call.state = 'holding'
      this.mediaSessions.get(callId)?.setSendingPaused(true)
      this.emitCallState(callId, 'holding')
    } catch (err: any) {
      addLog('error', `Hold failed: ${err.message}`)
    }
  }

  async unholdCall(callId: string): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) return
    addLog('info', `Unhold call ${callId}`)
    try {
      await this.sendReInvite(callId, false)
      call.isOnHold = false
      call.state = 'active'
      this.mediaSessions.get(callId)?.setSendingPaused(false)
      this.emitCallState(callId, 'active')
    } catch (err: any) {
      addLog('error', `Unhold failed: ${err.message}`)
    }
  }

  async sendDtmf(callId: string, digit: string): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) return
    if (!/^[0-9A-D*#]$/i.test(digit)) return

    const dialog = this.getDialogHeaders(callId)
    if (!dialog) {
      addLog('error', `DTMF: no dialog for ${callId}`)
      return
    }

    const body = `Signal=${digit}\r\nDuration=160\r\n`
    const msg: SipMessage = {
      isRequest: true,
      method: 'INFO',
      uri: dialog.requestUri,
      headers: {
        'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
        'from': dialog.fromHeader,
        'to': dialog.toHeader,
        'call-id': callId,
        'cseq': `${++this.callCSeq} INFO`,
        'max-forwards': '70',
        'user-agent': 'VoxPhone/1.0',
        'contact': `<sip:${this.account.username}@${this.localIp}:${this.localSipPort}>`,
        'content-type': 'application/dtmf-relay',
        'content-length': String(Buffer.byteLength(body, 'utf8')),
      },
      body,
    }

    addLog('info', `DTMF INFO ${digit} on call ${callId}`)
    await this.transport.send(msg, dialog.sendHost, dialog.sendPort)
    this.emit('dtmf-sent', { callId, digit })
  }

  async muteCall(callId: string, muted: boolean): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call) return
    addLog('info', `Mute=${muted} on call ${callId}`)
    call.isMuted = muted
    if (muted) this.mutedCalls.add(callId)
    else this.mutedCalls.delete(callId)
    this.emitCallState(callId, call.state)
  }

  /** PCM Int16LE @ 8kHz from renderer mic → RTP */
  sendPcmAudio(callId: string, pcm: Buffer): void {
    if (this.mutedCalls.has(callId)) return
    const call = this.activeCalls.get(callId)
    if (call?.isOnHold) return
    const session = this.mediaSessions.get(callId)
    if (!session) return
    session.sendAudio(pcm)
  }

  private emitCallState(callId: string, state: CallInfo['state']) {
    const call = this.activeCalls.get(callId)
    this.emit('call-state', {
      callId,
      state,
      answerTime: call?.answerTime,
      isMuted: call?.isMuted,
      isOnHold: call?.isOnHold,
      duration: call?.duration,
      call: call ? { ...call, state } : undefined,
    })
  }

  private emitCallEnded(callId: string, forcedResult?: 'rejected' | 'missed' | 'no-answer' | 'answered') {
    const call = this.activeCalls.get(callId)
    if (!call) {
      this.emit('call-ended', { callId, duration: 0 })
      return
    }

    const answered = call.answerTime > 0
    let result: 'answered' | 'missed' | 'rejected' | 'no-answer' =
      forcedResult || (answered ? 'answered' : call.direction === 'inbound' ? 'missed' : 'no-answer')

    this.emitCallState(callId, 'ended')
    this.emit('call-ended', {
      callId,
      duration: call.duration,
      direction: call.direction,
      remoteNumber: call.remoteNumber,
      remoteName: call.remoteName,
      answered,
      result,
      codec: call.codec,
      timestamp: call.startTime,
    })

    setTimeout(() => {
      this.activeCalls.delete(callId)
      this.callSignalingAddr.delete(callId)
      this.callInviteCtx.delete(callId)
      this.inboundInvites.delete(callId)
      this.inboundOk.delete(callId)
      this.inboundRinging.delete(callId)
      this.inboundDialog.delete(callId)
    }, 2000)
  }

  private getDialogHeaders(callId: string): {
    fromHeader: string
    toHeader: string
    requestUri: string
    sendHost: string
    sendPort: number
  } | null {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) return null
    const a = this.account
    const sig = this.callSignalingAddr.get(callId)
    const sendHost = sig?.host || a.sipServer
    const sendPort = sig?.port || a.localPort || 5060
    const inbound = this.inboundDialog.get(callId)
    const ctx = this.callInviteCtx.get(callId)

    if (call.direction === 'inbound' && inbound) {
      return {
        fromHeader: inbound.toHeader,
        toHeader: inbound.fromHeader,
        requestUri: inbound.remoteContact,
        sendHost,
        sendPort,
      }
    }

    const localUri = buildSipUri(a.username, a.domain || a.sipServer)
    const remoteUri = buildSipUri(call.remoteNumber, a.domain || a.sipServer)
    if (call.direction === 'inbound') {
      return {
        fromHeader: `<${localUri}>;tag=${call.toTag}`,
        toHeader: `<${remoteUri}>;tag=${call.fromTag}`,
        requestUri: `sip:${call.remoteNumber}@${sendHost}`,
        sendHost,
        sendPort,
      }
    }

    return {
      fromHeader: `<${localUri}>;tag=${call.fromTag}`,
      toHeader: `<${remoteUri}>;tag=${call.toTag}`,
      requestUri: ctx?.remoteContact || `sip:${call.remoteNumber}@${sendHost}`,
      sendHost,
      sendPort,
    }
  }

  private async sendReInvite(callId: string, hold: boolean): Promise<void> {
    const call = this.activeCalls.get(callId)
    const a = this.account
    const dialog = this.getDialogHeaders(callId)
    if (!call || !a || !dialog) throw new Error('No dialog')

    const codecDef = CODEC_MAP[call.codec === 'PCMA' ? 'PCMA' : 'PCMU']
    const codecs = [{ id: codecDef.id, name: call.codec === 'PCMA' ? 'PCMA' : 'PCMU', clockRate: codecDef.clockRate }]
    const sdp = buildSdp(
      this.localIp,
      call.localRtpPort,
      codecs,
      undefined,
      hold ? 'sendonly' : 'sendrecv'
    )

    const msg: SipMessage = {
      isRequest: true,
      method: 'INVITE',
      uri: dialog.requestUri,
      headers: {
        'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
        'from': dialog.fromHeader,
        'to': dialog.toHeader,
        'call-id': callId,
        'cseq': `${++this.callCSeq} INVITE`,
        'max-forwards': '70',
        'user-agent': 'VoxPhone/1.0',
        'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
        'content-type': 'application/sdp',
        'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY, UPDATE',
        'supported': 'timer, replaces',
        'content-length': String(Buffer.byteLength(sdp, 'utf8')),
      },
      body: sdp,
    }

    addLog('info', `Sending re-INVITE (${hold ? 'hold' : 'unhold'}) to ${dialog.sendHost}:${dialog.sendPort}`)
    await this.transport.send(msg, dialog.sendHost, dialog.sendPort)
  }

  private async startMedia(callId: string, call: CallInfo): Promise<void> {
    this.stopMedia(callId)

    if (!call.remoteRtpAddress || !call.remoteRtpPort) {
      addLog('error', `Cannot start media for ${callId}: missing remote RTP address`)
      return
    }

    const codec: Codec = call.codec === 'PCMA' ? 'PCMA' : 'PCMU'
    const session = new AudioSession({
      localPort: call.localRtpPort,
      localAddress: this.localIp,
      remoteAddress: call.remoteRtpAddress,
      remotePort: call.remoteRtpPort,
      codec,
      ssrc: (Math.random() * 0xffffffff) >>> 0,
    })

    session.on('audio', (pcm: Buffer) => {
      this.emit('audio-out', { callId, pcm })
    })

    session.on('error', (err: Error) => {
      addLog('error', `RTP error on ${callId}: ${err.message}`)
    })

    try {
      await session.start()
      // If OS rebound to ephemeral port, keep call in sync
      const bound = session.getLocalPort()
      if (bound && bound !== call.localRtpPort) {
        call.localRtpPort = bound
      }
      this.mediaSessions.set(callId, session)
      addLog('info', `RTP started ${this.localIp}:${call.localRtpPort} ↔ ${call.remoteRtpAddress}:${call.remoteRtpPort} (${codec})`)
    } catch (err: any) {
      addLog('error', `RTP bind failed on ${this.localIp}:${call.localRtpPort}: ${err.message}`)
    }
  }

  private stopMedia(callId: string): void {
    const session = this.mediaSessions.get(callId)
    if (session) {
      session.stop()
      this.mediaSessions.delete(callId)
      addLog('info', `RTP stopped for ${callId}`)
    }
    this.mutedCalls.delete(callId)
  }

  async transferCall(callId: string, target: string): Promise<void> {
    const call = this.activeCalls.get(callId)
    if (!call || !this.account) return
    if (call.state !== 'active' && call.state !== 'holding' && call.state !== 'held') {
      addLog('error', `Transfer: call ${callId} not established (state=${call.state})`)
      this.emit('transfer-status', { callId, status: 'failed', message: 'Call not established' })
      return
    }

    const a = this.account
    const dialog = this.getDialogHeaders(callId)
    if (!dialog) {
      addLog('error', `Transfer: no dialog for ${callId}`)
      this.emit('transfer-status', { callId, status: 'failed', message: 'No dialog' })
      return
    }

    const dest = target.trim().includes('@')
      ? target.trim()
      : `${target.trim()}@${a.domain || a.sipServer}`
    if (!dest || dest.startsWith('@')) {
      addLog('error', 'Transfer: empty target')
      this.emit('transfer-status', { callId, status: 'failed', message: 'Empty target' })
      return
    }

    this.clearPendingTransfer(callId)
    const referCSeq = ++this.callCSeq
    addLog('info', `Blind transfer call ${callId} to ${dest} (cseq=${referCSeq})`)

    const timeout = setTimeout(() => {
      if (!this.pendingTransfers.has(callId)) return
      addLog('error', `Transfer timeout waiting for NOTIFY on ${callId}`)
      this.clearPendingTransfer(callId)
      this.emit('transfer-status', { callId, status: 'failed', message: 'Transfer timed out' })
    }, 45000)

    this.pendingTransfers.set(callId, {
      target: dest,
      referCSeq,
      requestUri: dialog.requestUri,
      fromHeader: dialog.fromHeader,
      toHeader: dialog.toHeader,
      sendHost: dialog.sendHost,
      sendPort: dialog.sendPort,
      authAttempted: false,
      timeout,
    })

    this.emit('transfer-status', { callId, status: 'started', message: dest })
    await this.sendRefer(callId)
  }

  private async sendRefer(callId: string, authHeader?: { name: string; value: string }): Promise<void> {
    const pending = this.pendingTransfers.get(callId)
    const a = this.account
    if (!pending || !a) return

    const headers: Record<string, string> = {
      'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
      'from': pending.fromHeader,
      'to': pending.toHeader,
      'call-id': callId,
      'cseq': `${pending.referCSeq} REFER`,
      'max-forwards': '70',
      'user-agent': 'VoxPhone/1.0',
      'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
      'refer-to': `<sip:${pending.target}>`,
      'referred-by': `<sip:${a.username}@${a.domain || a.sipServer}>`,
      'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY, UPDATE',
      'supported': 'replaces, timer',
      'content-length': '0',
    }
    if (authHeader) headers[authHeader.name] = authHeader.value

    const msg: SipMessage = {
      isRequest: true,
      method: 'REFER',
      uri: pending.requestUri,
      headers,
      body: '',
    }

    addLog('info', `Sending REFER to ${pending.sendHost}:${pending.sendPort} Refer-To=<sip:${pending.target}>`)
    await this.transport.send(msg, pending.sendHost, pending.sendPort)
  }

  private clearPendingTransfer(callId: string) {
    const pending = this.pendingTransfers.get(callId)
    if (pending) {
      clearTimeout(pending.timeout)
      this.pendingTransfers.delete(callId)
    }
  }

  private async completeBlindTransfer(callId: string, reason: string) {
    if (!this.pendingTransfers.has(callId)) return
    this.clearPendingTransfer(callId)
    addLog('info', `Transfer complete for ${callId}: ${reason}`)
    this.emit('transfer-status', { callId, status: 'complete', message: reason })
    const call = this.activeCalls.get(callId)
    if (call && call.state !== 'ended') {
      await this.hangupCall(callId)
    }
  }

  getActiveCalls(): CallInfo[] {
    return Array.from(this.activeCalls.values())
  }

  getCall(callId: string): CallInfo | undefined {
    return this.activeCalls.get(callId)
  }

  // ============================================================
  // Message Handling
  // ============================================================

  private async handleMessage(msg: SipMessage, rinfo: { address: string; port: number }) {
    if (msg.isRequest) {
      await this.handleRequest(msg, rinfo)
    } else {
      await this.handleResponse(msg, rinfo)
    }
  }

  private responseVia(msg: SipMessage, rinfo: { address: string; port: number }): string | string[] {
    return rewriteViasForResponse(getHeaderAll(msg, 'via'), rinfo)
  }

  private async handleRequest(msg: SipMessage, rinfo: { address: string; port: number }) {
    const method = msg.method || 'UNKNOWN'
    addLog('info', `Handling request: ${method} from ${rinfo.address}:${rinfo.port}`)

    if (method === 'OPTIONS') {
      // Keep-alive response
      const response: SipMessage = {
        isRequest: false,
        statusCode: 200,
        reasonPhrase: 'OK',
        headers: {
          'via': this.responseVia(msg, rinfo),
          'from': getHeader(msg, 'from') || '',
          'to': getHeader(msg, 'to') || '',
          'call-id': getHeader(msg, 'call-id') || '',
          'cseq': getHeader(msg, 'cseq') || '',
          'user-agent': 'VoxPhone/1.0',
          'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY',
          'content-length': '0',
        },
        body: '',
      }
      await this.transport.send(response, rinfo.address, rinfo.port)
      return
    }

    if (method === 'INVITE') {
      await this.handleIncomingInvite(msg, rinfo)
      return
    }

    if (method === 'ACK') {
      const ackCallId = getHeader(msg, 'call-id')
      addLog('info', `ACK received for call ${ackCallId}`)
      if (ackCallId) this.stopOkRetransmit(ackCallId)
      return
    }

    if (method === 'BYE') {
      await this.handleBye(msg, rinfo)
      return
    }

    if (method === 'CANCEL') {
      await this.handleCancel(msg, rinfo)
      return
    }

    if (method === 'NOTIFY' || method === 'SUBSCRIBE') {
      const callId = getHeader(msg, 'call-id') || ''
      const eventHdr = (getHeader(msg, 'event') || '').toLowerCase()
      const isReferNotify = method === 'NOTIFY' && (eventHdr.startsWith('refer') || this.pendingTransfers.has(callId))

      // Always ACK NOTIFY/SUBSCRIBE with 200 first
      const response: SipMessage = {
        isRequest: false,
        statusCode: 200,
        reasonPhrase: 'OK',
        headers: {
          'via': this.responseVia(msg, rinfo),
          'from': getHeader(msg, 'from') || '',
          'to': getHeader(msg, 'to') || '',
          'call-id': callId,
          'cseq': getHeader(msg, 'cseq') || '',
          'content-length': '0',
        },
        body: '',
      }
      await this.transport.send(response, rinfo.address, rinfo.port)

      if (isReferNotify) {
        await this.handleReferNotify(callId, msg)
      }
      return
    }

    addLog('info', `Unhandled request: ${method}`)
  }

  private async handleReferNotify(callId: string, msg: SipMessage) {
    const body = (msg.body || '').trim()
    const subState = (getHeader(msg, 'subscription-state') || '').toLowerCase()
    const statusMatch = body.match(/SIP\/2\.0\s+(\d{3})/i)
    const sipStatus = statusMatch ? parseInt(statusMatch[1], 10) : 0
    addLog('info', `REFER NOTIFY for ${callId}: status=${sipStatus || 'n/a'} sub=${subState || 'n/a'} body=${body.slice(0, 80)}`)

    if (!this.pendingTransfers.has(callId)) return

    if (sipStatus >= 200 && sipStatus < 300) {
      await this.completeBlindTransfer(callId, `Transfer target answered (${sipStatus})`)
      return
    }

    if (sipStatus >= 300) {
      this.clearPendingTransfer(callId)
      const reason = `Transfer failed: ${sipStatus}`
      addLog('error', reason)
      this.emit('transfer-status', { callId, status: 'failed', message: reason })
      return
    }

    if (sipStatus > 0 && sipStatus < 200) {
      this.emit('transfer-status', {
        callId,
        status: 'progress',
        message: body.split(/\r?\n/)[0] || `SIP ${sipStatus}`,
      })
      return
    }

    // Subscription ended without an embedded SIP status — often means PBX finished its side
    if (subState.startsWith('terminated') && /reason\s*=\s*noresource|reason\s*=\s*timeout/i.test(subState)) {
      this.clearPendingTransfer(callId)
      this.emit('transfer-status', { callId, status: 'failed', message: 'Transfer subscription terminated' })
    }
  }

  private async handleIncomingInvite(msg: SipMessage, rinfo: { address: string; port: number }) {
    const callId = getHeader(msg, 'call-id') || generateCallId()
    const fromHeader = getHeader(msg, 'from') || ''
    const toHeader = getHeader(msg, 'to') || ''
    const vias = getHeaderAll(msg, 'via')
    const viaHeader = rewriteViasForResponse(vias, rinfo)
    const cseq = getHeader(msg, 'cseq') || ''

    this.callSignalingAddr.set(callId, { host: rinfo.address, port: rinfo.port })

    // INVITE retransmit — do NOT invent a new To-tag or re-emit UI events
    const existing = this.activeCalls.get(callId)
    if (existing) {
      addLog('info', `INVITE retransmit for ${callId} (state=${existing.state})`)
      if (existing.state === 'active' || existing.state === 'holding') {
        await this.retransmitOk(callId)
        return
      }
      if (existing.state === 'incoming' || existing.state === 'ringing') {
        const ringing = this.inboundRinging.get(callId)
        if (ringing) {
          await this.transport.send(ringing, rinfo.address, rinfo.port)
        }
        return
      }
    }

    addLog('info', `Incoming INVITE: callId=${callId} from=${fromHeader}`)

    const fromMatch = fromHeader.match(/<sip:([^@>]+)@([^>]+)>/)
    const remoteUser = fromMatch ? fromMatch[1] : rinfo.address
    const displayNameMatch = fromHeader.match(/"([^"]+)"/)
    const remoteName = displayNameMatch ? displayNameMatch[1] : remoteUser

    let remoteRtpPort = 0
    let remoteRtpAddress = rinfo.address
    if (msg.body) {
      const sdp = parseSdp(msg.body)
      if (sdp) {
        remoteRtpPort = sdp.port
        remoteRtpAddress = sdp.address || rinfo.address
        addLog('info', `Remote SDP: ${remoteRtpAddress}:${remoteRtpPort} codecs=${sdp.codecs.map(c => c.name).join(',')}`)
      }
    }

    const fromTag = fromHeader.match(/tag=([^;>]+)/)?.[1] || generateTag()
    const toTag = generateTag()

    const issabelHeader = getSettings().screenPop?.issabelHeader || 'X-UniqueID'
    const issabelId = (issabelHeader ? getHeader(msg, issabelHeader) : '') || ''

    const callInfo: CallInfo = {
      id: callId,
      state: 'incoming',
      direction: 'inbound',
      remoteNumber: remoteUser,
      remoteName: remoteName,
      localNumber: this.account?.username || '',
      issabelId,
      startTime: Date.now(),
      answerTime: 0,
      endTime: 0,
      duration: 0,
      isMuted: false,
      isOnHold: false,
      isRecording: false,
      codec: this.account?.codecs?.[0] || 'PCMU',
      remoteRtpPort,
      remoteRtpAddress,
      localRtpPort: this.localRtpPort,
      callId,
      fromTag,
      toTag,
    }

    this.activeCalls.set(callId, callInfo)
    this.inboundInvites.set(callId, msg)

    const tryingMsg: SipMessage = {
      isRequest: false,
      statusCode: 100,
      reasonPhrase: 'Trying',
      headers: {
        'via': viaHeader,
        'from': fromHeader,
        'to': toHeader,
        'call-id': callId,
        'cseq': cseq,
        'user-agent': 'VoxPhone/1.0',
        'content-length': '0',
      },
      body: '',
    }
    await this.transport.send(tryingMsg, rinfo.address, rinfo.port)

    const ringingMsg: SipMessage = {
      isRequest: false,
      statusCode: 180,
      reasonPhrase: 'Ringing',
      headers: {
        'via': viaHeader,
        'from': fromHeader,
        'to': `${toHeader};tag=${toTag}`,
        'call-id': callId,
        'cseq': cseq,
        'user-agent': 'VoxPhone/1.0',
        'contact': `<sip:${this.account?.username || 'voxphone'}@${this.localIp}:${this.localSipPort}>`,
        'content-length': '0',
      },
      body: '',
    }
    this.inboundRinging.set(callId, ringingMsg)
    addLog('info', `Sending 180 Ringing to ${rinfo.address}:${rinfo.port}`)
    await this.transport.send(ringingMsg, rinfo.address, rinfo.port)

    addLog('info', `Emitted incoming-call event for ${remoteName} (${remoteUser})`)
    this.emit('incoming-call', callInfo)
    this.emitCallState(callId, 'incoming')
  }

  private async handleBye(msg: SipMessage, rinfo: { address: string; port: number }) {
    const callId = getHeader(msg, 'call-id')
    addLog('info', `BYE received (remote hangup) for call ${callId}`)

    // Always ACK the BYE with 200 OK first so Asterisk can clear the channel
    const response: SipMessage = {
      isRequest: false,
      statusCode: 200,
      reasonPhrase: 'OK',
      headers: {
        'via': this.responseVia(msg, rinfo),
        'from': getHeader(msg, 'from') || '',
        'to': getHeader(msg, 'to') || '',
        'call-id': callId || '',
        'cseq': getHeader(msg, 'cseq') || '',
        'user-agent': 'VoxPhone/1.0',
        'content-length': '0',
      },
      body: '',
    }
    try {
      await this.transport.send(response, rinfo.address, rinfo.port)
      addLog('info', `200 OK sent for BYE to ${rinfo.address}:${rinfo.port}`)
    } catch (err: any) {
      addLog('error', `Failed to send 200 OK for BYE: ${err.message}`)
    }

    if (!callId) return
    if (this.pendingTransfers.has(callId)) {
      this.clearPendingTransfer(callId)
      this.emit('transfer-status', { callId, status: 'complete', message: 'Remote hung up after transfer' })
    }
    this.terminateCallLocally(callId, 'Remote party hung up')
  }

  /** Tear down local call state (media, maps, UI events) without sending SIP. */
  private terminateCallLocally(callId: string, reason?: string) {
    this.clearPendingTransfer(callId)
    const call = this.activeCalls.get(callId)
    if (!call || call.state === 'ended') {
      this.stopOkRetransmit(callId)
      this.stopMedia(callId)
      this.inboundOk.delete(callId)
      this.inboundRinging.delete(callId)
      this.inboundDialog.delete(callId)
      this.inboundInvites.delete(callId)
      return
    }

    if (reason) addLog('info', `Ending call ${callId}: ${reason}`)
    this.stopOkRetransmit(callId)
    this.stopMedia(callId)
    const answered = call.answerTime > 0
    call.state = 'ended'
    call.endTime = Date.now()
    call.duration = answered ? Math.floor((call.endTime - call.answerTime) / 1000) : 0

    let result: 'rejected' | 'missed' | 'no-answer' | 'answered' | undefined
    if (answered) result = 'answered'
    else if (call.direction === 'inbound') {
      result = reason?.toLowerCase().includes('cancel') ? 'missed' : 'missed'
    } else {
      result = 'no-answer'
    }

    this.emitCallEnded(callId, result)
  }

  private async handleCancel(msg: SipMessage, rinfo: { address: string; port: number }) {
    const callId = getHeader(msg, 'call-id')
    addLog('info', `CANCEL received for call ${callId}`)
    const call = callId ? this.activeCalls.get(callId) : undefined
    const invite = callId ? this.inboundInvites.get(callId) : undefined

    if (call) {
      this.terminateCallLocally(callId!, 'Remote cancelled')
    }

    // 200 OK for CANCEL
    const response: SipMessage = {
      isRequest: false,
      statusCode: 200,
      reasonPhrase: 'OK',
      headers: {
        'via': this.responseVia(msg, rinfo),
        'from': getHeader(msg, 'from') || '',
        'to': getHeader(msg, 'to')
          || (call && invite ? `${getHeader(invite, 'to') || ''};tag=${call.toTag}` : getHeader(msg, 'to') || ''),
        'call-id': callId || '',
        'cseq': getHeader(msg, 'cseq') || '',
        'content-length': '0',
      },
      body: '',
    }
    await this.transport.send(response, rinfo.address, rinfo.port)

    // RFC 3261: also terminate the INVITE with 487
    if (invite && call) {
      const toHeader = getHeader(invite, 'to') || ''
      const toWithTag = toHeader.includes('tag=') ? toHeader : `${toHeader};tag=${call.toTag}`
      const gone: SipMessage = {
        isRequest: false,
        statusCode: 487,
        reasonPhrase: 'Request Terminated',
        headers: {
          'via': rewriteViasForResponse(getHeaderAll(invite, 'via'), rinfo),
          'from': getHeader(invite, 'from') || '',
          'to': toWithTag,
          'call-id': callId || '',
          'cseq': getHeader(invite, 'cseq') || '',
          'content-length': '0',
        },
        body: '',
      }
      await this.transport.send(gone, rinfo.address, rinfo.port)
    }
  }

  private async handleResponse(msg: SipMessage, rinfo: { address: string; port: number }) {
    const callId = getHeader(msg, 'call-id') || ''
    const cseqHeader = getHeader(msg, 'cseq') || ''
    const method = cseqHeader.split(' ')[1] || ''
    const statusCode = msg.statusCode || 0

    addLog('info', `Response: ${statusCode} ${msg.reasonPhrase} for ${method} (callId=${callId})`)

    if (method === 'REGISTER') {
      await this.handleRegisterResponse(msg, rinfo)
      return
    }

    if (method === 'INVITE' && callId) {
      await this.handleInviteResponse(msg, callId, statusCode, rinfo)
      return
    }

    // Handle ACK responses (2xx to ACK)
    if (method === 'ACK') {
      addLog('info', `ACK response ${statusCode} received`)
      return
    }

    // Handle BYE responses
    if (method === 'BYE') {
      addLog('info', `BYE response ${statusCode} received for ${callId}`)
      return
    }

    if (method === 'REFER' && callId) {
      await this.handleReferResponse(msg, callId, statusCode)
      return
    }

    addLog('info', `Unhandled response: ${statusCode} for ${method}`)
  }

  private async handleReferResponse(msg: SipMessage, callId: string, statusCode: number) {
    const pending = this.pendingTransfers.get(callId)
    if (!pending) {
      addLog('info', `REFER response ${statusCode} with no pending transfer for ${callId}`)
      return
    }

    const cseqHeader = getHeader(msg, 'cseq') || ''
    const respCSeq = parseInt(cseqHeader.split(/\s+/)[0], 10) || 0
    if (respCSeq > 0 && respCSeq !== pending.referCSeq) {
      addLog('info', `Ignoring stale REFER ${statusCode} CSeq ${respCSeq} (pending=${pending.referCSeq})`)
      return
    }

    if (statusCode === 401 || statusCode === 407) {
      if (pending.authAttempted || !this.account) {
        this.clearPendingTransfer(callId)
        addLog('error', `REFER auth failed for ${callId}`)
        this.emit('transfer-status', { callId, status: 'failed', message: 'Transfer authentication failed' })
        return
      }

      const wwwAuth = getHeader(msg, 'www-authenticate') || getHeader(msg, 'proxy-authenticate') || ''
      const parsed = parseAuthHeader(wwwAuth)
      const nonce = parsed.nonce || ''
      const realm = parsed.realm || ''
      const opaque = parsed.opaque || ''
      const qopRaw = parsed.qop || ''
      const qop = qopRaw.split(/[,\s]+/).includes('auth') ? 'auth' : (qopRaw || undefined)
      if (!nonce || !realm) {
        this.clearPendingTransfer(callId)
        this.emit('transfer-status', { callId, status: 'failed', message: 'Invalid REFER auth challenge' })
        return
      }

      const a = this.account
      const nc = '00000001'
      const cnonce = generateTag()
      const authResponse = computeDigestResponse(
        'REFER',
        pending.requestUri,
        realm,
        a.authUser || a.username,
        a.password,
        nonce,
        qop,
        nc,
        cnonce
      )
      const authHeaderName = statusCode === 407 ? 'proxy-authorization' : 'authorization'
      let authValue = `Digest username="${a.authUser || a.username}", realm="${realm}", nonce="${nonce}", uri="${pending.requestUri}", response="${authResponse}", algorithm=MD5`
      if (opaque) authValue += `, opaque="${opaque}"`
      if (qop) authValue += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`

      pending.authAttempted = true
      pending.referCSeq = ++this.callCSeq
      addLog('info', `Re-sending authenticated REFER (cseq=${pending.referCSeq})`)
      await this.sendRefer(callId, { name: authHeaderName, value: authValue })
      return
    }

    if (statusCode === 202 || (statusCode >= 200 && statusCode < 300)) {
      addLog('info', `REFER accepted (${statusCode}) for ${callId} — waiting for NOTIFY / remote BYE`)
      this.emit('transfer-status', { callId, status: 'accepted', message: `REFER ${statusCode}` })
      return
    }

    // Final failure
    this.clearPendingTransfer(callId)
    const reason = `Transfer rejected: ${statusCode} ${msg.reasonPhrase || ''}`.trim()
    addLog('error', reason)
    this.emit('transfer-status', { callId, status: 'failed', message: reason })
  }

  private async handleRegisterResponse(msg: SipMessage, rinfo: { address: string; port: number }) {
    const statusCode = msg.statusCode || 0
    const cseqHeader = getHeader(msg, 'cseq') || ''
    const respCSeq = parseInt(cseqHeader.split(/\s+/)[0], 10) || 0
    addLog('info', `REGISTER response: ${statusCode} ${msg.reasonPhrase} from ${rinfo.address}:${rinfo.port}`)

    if (statusCode === 401 || statusCode === 407) {
      // Duplicate/stale challenge after we already registered successfully
      if (this.registered && respCSeq > 0 && respCSeq < this.regCSeq) {
        addLog('info', `Ignoring stale REGISTER ${statusCode} CSeq ${respCSeq}`)
        return
      }
      if (this.registered && respCSeq < this.regCSeq) {
        addLog('info', `Ignoring late REGISTER ${statusCode} (already registered)`)
        return
      }

      const wwwAuth = getHeader(msg, 'www-authenticate') || getHeader(msg, 'proxy-authenticate') || ''
      addLog('info', `Auth challenge: ${wwwAuth}`)

      const parsed = parseAuthHeader(wwwAuth)
      this.regNonce = parsed.nonce || ''
      this.regRealm = parsed.realm || ''
      const algorithm = parsed.algorithm || 'MD5'
      const opaque = parsed.opaque || ''
      const qopRaw = parsed.qop || ''
      const qop = qopRaw.split(/[,\s]+/).includes('auth') ? 'auth' : (qopRaw || undefined)

      addLog('info', `Parsed auth: realm=${this.regRealm} nonce=${this.regNonce.substring(0, 10)}... algo=${algorithm}`)

      if (!this.regNonce || !this.regRealm || !this.account) {
        this.clearRegTimeout()
        addLog('error', `Auth failed: nonce=${!!this.regNonce} realm=${!!this.regRealm} account=${!!this.account}`)
        this.emit('registration-status', {
          status: 'failed',
          expires: 0,
          errorMessage: 'Authentication failed: missing nonce or realm in challenge',
        })
        return
      }

      const a = this.account
      const fromUri = buildSipUri(a.username, a.domain || a.sipServer)
      const requestUri = buildSipUri(a.username, a.sipServer, a.localPort || 5060)
      const target = this.getSignalTarget()
      const nc = '00000001'
      const cnonce = generateTag()

      const authResponse = computeDigestResponse(
        'REGISTER',
        requestUri,
        this.regRealm,
        a.authUser || a.username,
        a.password,
        this.regNonce,
        qop,
        nc,
        cnonce
      )

      addLog('info', `Digest response computed for user=${a.authUser || a.username}`)

      this.regBranch = generateBranch()
      this.regCSeq++

      const authHeaderName = statusCode === 407 ? 'proxy-authorization' : 'authorization'
      let authValue = `Digest username="${a.authUser || a.username}", realm="${this.regRealm}", nonce="${this.regNonce}", uri="${requestUri}", response="${authResponse}", algorithm=MD5`
      if (opaque) authValue += `, opaque="${opaque}"`
      if (qop) authValue += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`

      const msg2: SipMessage = {
        isRequest: true,
        method: 'REGISTER',
        uri: requestUri,
        headers: {
          'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${this.regBranch};rport`,
          'from': `<${fromUri}>;tag=${this.regFromTag}`,
          'to': `<${fromUri}>`,
          'call-id': this.regCallId,
          'cseq': `${this.regCSeq} REGISTER`,
          'max-forwards': '70',
          'user-agent': 'VoxPhone/1.0',
          'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
          [authHeaderName]: authValue,
          'expires': String(this.regExpires),
          'content-length': '0',
        },
        body: '',
      }

      addLog('info', `Sending authenticated REGISTER to ${target.host}:${target.port}`)
      try {
        await this.transport.send(msg2, target.host, target.port)
        this.armRegTimeout()
      } catch (err: any) {
        this.clearRegTimeout()
        const errorMessage = `Failed to send authenticated REGISTER: ${err.message}`
        addLog('error', errorMessage)
        this.emit('registration-status', { status: 'failed', expires: 0, errorMessage })
      }
      return
    }

    this.clearRegTimeout()

    if (statusCode >= 200 && statusCode < 300) {
      const expiresHeader = getHeader(msg, 'expires')
      const contactHeader = getHeader(msg, 'contact') || ''
      let expires = this.regExpires

      const contactExpiresMatch = contactHeader.match(/expires=(\d+)/)
      if (contactExpiresMatch) {
        expires = parseInt(contactExpiresMatch[1], 10)
      } else if (expiresHeader) {
        expires = parseInt(expiresHeader, 10)
      }

      addLog('info', `Registration SUCCESS (expires=${expires}s)`)
      this.registered = true
      this.startRegTimer(expires)
      this.emit('registration-status', { status: 'registered', expires })
      return
    }

    this.registered = false
    const errorMessage = `Registration failed: ${statusCode} ${msg.reasonPhrase || 'Unknown error'}`
    addLog('error', errorMessage)
    this.emit('registration-status', {
      status: 'failed',
      expires: 0,
      errorMessage,
    })
  }

  private async handleInviteResponse(
    msg: SipMessage,
    callId: string,
    statusCode: number,
    rinfo: { address: string; port: number }
  ) {
    const call = this.activeCalls.get(callId)
    if (!call) {
      addLog('info', `No call found for INVITE response: ${callId}`)
      return
    }

    if (call.state === 'ended') {
      addLog('info', `Ignoring ${statusCode} for ended call ${callId}`)
      return
    }

    const ctx = this.callInviteCtx.get(callId)
    const cseqHeader = getHeader(msg, 'cseq') || ''
    const respCSeq = parseInt(cseqHeader.split(/\s+/)[0], 10) || 0

    addLog('info', `INVITE response ${statusCode} for call ${callId} (cseq=${respCSeq})`)

    if (statusCode === 100) {
      return
    }

    // Digest challenge — ACK then re-INVITE with credentials (PBX common path)
    if (statusCode === 401 || statusCode === 407) {
      // Stale retransmits (e.g. duplicate 401 from another UDP path) must not kill an established call
      if (
        call.state === 'active' ||
        call.state === 'ringing' ||
        call.state === 'holding' ||
        call.state === 'held'
      ) {
        addLog('info', `Ignoring late ${statusCode} for call ${callId} (already ${call.state})`)
        await this.sendInviteAck(msg, callId, rinfo, respCSeq || ctx?.inviteCSeq)
        return
      }

      if (ctx && respCSeq > 0 && respCSeq < ctx.inviteCSeq) {
        addLog('info', `Ignoring stale ${statusCode} CSeq ${respCSeq} (current INVITE cseq=${ctx.inviteCSeq})`)
        await this.sendInviteAck(msg, callId, rinfo, respCSeq)
        return
      }

      if (ctx?.authAttempted) {
        // 401 for the authenticated INVITE itself = real auth failure
        if (respCSeq === ctx.inviteCSeq) {
          await this.sendInviteAck(msg, callId, rinfo, respCSeq)
          addLog('error', `INVITE auth failed for ${callId} (${statusCode}) — wrong credentials?`)
          await this.failCall(callId, `Call authentication failed: ${statusCode} Unauthorized`)
        } else {
          addLog('info', `Ignoring duplicate ${statusCode} after auth already sent (cseq=${respCSeq})`)
          await this.sendInviteAck(msg, callId, rinfo, respCSeq)
        }
        return
      }

      await this.sendInviteAck(msg, callId, rinfo, respCSeq || ctx?.inviteCSeq)

      if (!this.account || !ctx) {
        addLog('error', `Cannot authenticate INVITE ${callId}: missing account or context`)
        await this.failCall(callId, `${statusCode} ${msg.reasonPhrase}`)
        return
      }

      const wwwAuth = getHeader(msg, 'www-authenticate') || getHeader(msg, 'proxy-authenticate') || ''
      addLog('info', `INVITE auth challenge: ${wwwAuth}`)
      const parsed = parseAuthHeader(wwwAuth)
      const nonce = parsed.nonce || ''
      const realm = parsed.realm || ''
      const opaque = parsed.opaque || ''
      const qopRaw = parsed.qop || ''
      const qop = qopRaw.split(/[,\s]+/).includes('auth') ? 'auth' : (qopRaw || undefined)
      if (!nonce || !realm) {
        addLog('error', 'INVITE auth challenge missing nonce/realm')
        await this.failCall(callId, 'Call authentication failed: invalid challenge')
        return
      }

      const a = this.account
      const nc = '00000001'
      const cnonce = generateTag()
      const authResponse = computeDigestResponse(
        'INVITE',
        ctx.requestUri,
        realm,
        a.authUser || a.username,
        a.password,
        nonce,
        qop,
        nc,
        cnonce
      )
      const authHeaderName = statusCode === 407 ? 'proxy-authorization' : 'authorization'
      let authValue = `Digest username="${a.authUser || a.username}", realm="${realm}", nonce="${nonce}", uri="${ctx.requestUri}", response="${authResponse}", algorithm=MD5`
      if (opaque) authValue += `, opaque="${opaque}"`
      if (qop) authValue += `, qop=${qop}, nc=${nc}, cnonce="${cnonce}"`

      const newCSeq = ++this.callCSeq
      ctx.inviteCSeq = newCSeq
      ctx.authAttempted = true

      const signal = this.callSignalingAddr.get(callId) || this.getSignalTarget()
      const branch = generateBranch()

      const reInvite: SipMessage = {
        isRequest: true,
        method: 'INVITE',
        uri: ctx.requestUri,
        headers: {
          'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${branch};rport`,
          'from': ctx.fromHeader,
          'to': ctx.toHeader,
          'call-id': callId,
          'cseq': `${newCSeq} INVITE`,
          'max-forwards': '70',
          'user-agent': 'VoxPhone/1.0',
          'contact': `<sip:${a.username}@${this.localIp}:${this.localSipPort}>`,
          [authHeaderName]: authValue,
          'content-type': 'application/sdp',
          'allow': 'INVITE, ACK, CANCEL, BYE, OPTIONS, INFO, REFER, NOTIFY, UPDATE',
          'supported': 'timer',
          'content-length': String(Buffer.byteLength(ctx.sdp)),
        },
        body: ctx.sdp,
      }

      addLog('info', `Sending authenticated INVITE to ${signal.host}:${signal.port} (cseq=${newCSeq})`)
      call.state = 'outgoing'
      this.emitCallState(callId, 'outgoing')
      try {
        await this.transport.send(reInvite, signal.host, signal.port)
      } catch (err: any) {
        addLog('error', `Authenticated INVITE send failed: ${err.message}`)
        await this.failCall(callId, err.message)
      }
      return
    }

    // Ignore responses for older INVITE transactions (after re-auth bumped CSeq)
    if (ctx && respCSeq > 0 && respCSeq < ctx.inviteCSeq) {
      addLog('info', `Ignoring stale INVITE response ${statusCode} CSeq ${respCSeq} (current=${ctx.inviteCSeq})`)
      return
    }

    if (statusCode === 180 || statusCode === 183) {
      if (call.state === 'active' || call.state === 'holding') return
      call.state = 'ringing'
      this.emitCallState(callId, 'ringing')
      return
    }

    if (statusCode >= 200 && statusCode < 300) {
      const toHeader = getHeader(msg, 'to') || ''
      call.toTag = toHeader.match(/tag=([^;>]+)/)?.[1] || ''

      if (msg.body) {
        const sdp = parseSdp(msg.body)
        if (sdp) {
          call.remoteRtpPort = sdp.port
          call.remoteRtpAddress = sdp.address || rinfo.address
          addLog('info', `Remote SDP: ${call.remoteRtpAddress}:${call.remoteRtpPort}`)
        }
      }

      const contact = getHeader(msg, 'contact') || ''
      const contactUri = contact.match(/<(sip:[^>]+)>/i)?.[1] || contact.match(/(sip:[^\s;>]+)/i)?.[1]
      if (ctx && contactUri) {
        ctx.remoteContact = contactUri
      }

      // re-INVITE (hold/unhold) — ACK only, keep existing media
      if (call.state === 'active' || call.state === 'holding' || call.state === 'held') {
        await this.sendInviteAck(msg, callId, rinfo, respCSeq || this.callCSeq, contactUri)
        addLog('info', `ACK sent for re-INVITE on ${callId} (state=${call.state})`)
        return
      }

      call.state = 'active'
      if (!call.answerTime) call.answerTime = Date.now()

      // Pick negotiated codec from answer SDP (prefer PCMU/PCMA)
      if (msg.body) {
        const answerSdp = parseSdp(msg.body)
        if (answerSdp) {
          const names = answerSdp.codecs.map(c => c.name.toUpperCase())
          if (names.includes('PCMU')) call.codec = 'PCMU'
          else if (names.includes('PCMA')) call.codec = 'PCMA'
        }
      }

      await this.startMedia(callId, call)
      await this.sendInviteAck(msg, callId, rinfo, respCSeq || ctx?.inviteCSeq, contactUri)
      addLog('info', `ACK sent, call ${callId} now ACTIVE (media ${call.codec} ${call.remoteRtpAddress}:${call.remoteRtpPort})`)
      this.emitCallState(callId, 'active')
      return
    }

    // Other error responses (3xx, 4xx, 5xx, 6xx) — not auth challenges
    if (statusCode >= 300) {
      if (call.state === 'active' || call.state === 'ringing') {
        addLog('info', `Ignoring late error ${statusCode} for call ${callId} (already ${call.state})`)
        await this.sendInviteAck(msg, callId, rinfo, respCSeq || ctx?.inviteCSeq)
        return
      }
      addLog('info', `Call ${callId} rejected/failed: ${statusCode} ${msg.reasonPhrase}`)
      await this.sendInviteAck(msg, callId, rinfo, respCSeq || ctx?.inviteCSeq)
      await this.failCall(callId, `${statusCode} ${msg.reasonPhrase || 'Call failed'}`)
    }
  }

  /** ACK for INVITE final responses — CSeq number must match the INVITE (RFC 3261). */
  private async sendInviteAck(
    msg: SipMessage,
    callId: string,
    rinfo: { address: string; port: number },
    inviteCSeq?: number,
    contactUri?: string
  ) {
    const call = this.activeCalls.get(callId)
    const ctx = this.callInviteCtx.get(callId)
    const cseqNum = inviteCSeq ?? ctx?.inviteCSeq ?? this.callCSeq
    // 2xx ACK Request-URI should be the Contact from the 200; otherwise original Request-URI
    const requestUri =
      contactUri ||
      ctx?.remoteContact ||
      ctx?.requestUri ||
      `sip:${call?.remoteNumber}@${rinfo.address}`

    const ackMsg: SipMessage = {
      isRequest: true,
      method: 'ACK',
      uri: requestUri,
      headers: {
        'via': `SIP/2.0/UDP ${this.localIp}:${this.localSipPort};branch=${generateBranch()};rport`,
        'from': getHeader(msg, 'from') || ctx?.fromHeader || '',
        'to': getHeader(msg, 'to') || ctx?.toHeader || '',
        'call-id': callId,
        'cseq': `${cseqNum} ACK`,
        'max-forwards': '70',
        'user-agent': 'VoxPhone/1.0',
        'content-length': '0',
      },
      body: '',
    }

    await this.transport.send(ackMsg, rinfo.address, rinfo.port)
  }

  private async failCall(callId: string, reason: string) {
    const call = this.activeCalls.get(callId)
    if (!call) return
    addLog('error', `Call ${callId} ended: ${reason}`)
    this.stopMedia(callId)
    call.state = 'ended'
    call.endTime = Date.now()
    call.duration = 0
    this.emitCallEnded(callId, call.direction === 'inbound' ? 'missed' : 'no-answer')
  }

  private extractDisplayName(fromHeader: string): string {
    const match = fromHeader.match(/"([^"]+)"/)
    if (match) return match[1]
    const sipMatch = fromHeader.match(/<sip:([^@]+)@/)
    if (sipMatch) return sipMatch[1]
    return ''
  }
}
