import { EventEmitter } from 'events'
import { parseRtpPacket, buildRtpPacket } from './packet'
import { pcmuDecode, pcmuEncode } from './pcmu'
import { pcmaDecode, pcmaEncode } from './pcma'
import type { Codec } from '../../shared/types'
import dgram from 'dgram'

export interface AudioSessionConfig {
  localPort: number
  localAddress?: string
  remoteAddress: string
  remotePort: number
  codec: Codec
  ssrc: number
}

export class AudioSession extends EventEmitter {
  private socket: dgram.Socket | null = null
  private config: AudioSessionConfig
  private running = false
  private sendingPaused = false
  private seqNum = 0
  private timestamp = 0
  private clockRate: number

  constructor(config: AudioSessionConfig) {
    super()
    this.config = {
      ...config,
      ssrc: (config.ssrc >>> 0) || ((Math.random() * 0xffffffff) >>> 0),
    }
    this.clockRate = config.codec === 'opus' ? 48000 : 8000
    this.seqNum = Math.floor(Math.random() * 65535)
    this.timestamp = (Math.random() * 0xffffffff) >>> 0
  }

  // Bind UDP socket — if preferred port busy, let OS pick and update call
  start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

      this.socket.on('message', (data: Buffer) => {
        this.handleIncomingPacket(data)
      })

      this.socket.on('error', (err) => {
        this.emit('error', err)
      })

      const onListen = () => {
        this.running = true
        this.emit('started')
        resolve()
      }

      this.socket.once('listening', onListen)

      try {
        // Bind to specific LAN IP so RTP source matches SDP (avoids Hyper-V 172.25.x)
        this.socket.bind(this.config.localPort, this.config.localAddress || undefined)
      } catch (err: any) {
        try {
          this.socket.bind(0, this.config.localAddress || undefined)
        } catch (err2: any) {
          reject(err2)
        }
      }
    })
  }

  stop() {
    this.running = false
    if (this.socket) {
      this.socket.close()
      this.socket = null
    }
    this.emit('stopped')
  }

  setSendingPaused(paused: boolean) {
    this.sendingPaused = paused
  }

  sendAudio(pcmData: Buffer) {
    if (!this.socket || !this.running || this.sendingPaused) return

    try {
      let encoded: Buffer
      switch (this.config.codec) {
        case 'PCMU':
          encoded = pcmuEncode(pcmData)
          break
        case 'PCMA':
          encoded = pcmaEncode(pcmData)
          break
        default:
          encoded = pcmuEncode(pcmData)
      }

      const pt = this.config.codec === 'PCMA' ? 8 : 0
      const pkt = buildRtpPacket(
        pt,
        this.seqNum,
        this.timestamp,
        this.config.ssrc,
        encoded
      )

      this.socket.send(pkt, 0, pkt.length, this.config.remotePort, this.config.remoteAddress)
      this.seqNum = (this.seqNum + 1) & 0xffff
      // >>> 0 keeps unsigned 32-bit (JS & is signed and crashes writeUInt32BE)
      this.timestamp = (this.timestamp + (this.clockRate === 8000 ? 160 : 960)) >>> 0
    } catch (err) {
      this.emit('error', err instanceof Error ? err : new Error(String(err)))
    }
  }

  private handleIncomingPacket(data: Buffer) {
    const pkt = parseRtpPacket(data)
    if (!pkt) return

    let decoded: Buffer
    switch (pkt.header.payloadType) {
      case 0:
        decoded = pcmuDecode(pkt.payload)
        break
      case 8:
        decoded = pcmaDecode(pkt.payload)
        break
      default:
        decoded = pcmuDecode(pkt.payload)
    }

    this.emit('audio', decoded)
  }

  getLocalPort(): number {
    if (this.socket) {
      return this.socket.address().port
    }
    return this.config.localPort
  }

  updateRemoteAddress(address: string, port: number) {
    this.config.remoteAddress = address
    this.config.remotePort = port
  }
}
