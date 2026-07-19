import dgram from 'dgram'

// RTP Packet Parser/Builder per RFC 3550

export interface RtpHeader {
  version: number
  padding: boolean
  extension: boolean
  csrcCount: number
  marker: boolean
  payloadType: number
  sequenceNumber: number
  timestamp: number
  ssrc: number
  csrc: number[]
}

export interface RtpPacket {
  header: RtpHeader
  payload: Buffer
}

const RTP_HEADER_SIZE = 12

export function parseRtpPacket(data: Buffer): RtpPacket | null {
  if (data.length < RTP_HEADER_SIZE) return null

  const firstByte = data[0]
  const secondByte = data[1]

  const header: RtpHeader = {
    version: (firstByte >> 6) & 0x03,
    padding: (firstByte >> 5) & 0x01 === 1,
    extension: (firstByte >> 4) & 0x01 === 1,
    csrcCount: firstByte & 0x0F,
    marker: (secondByte >> 7) & 0x01 === 1,
    payloadType: secondByte & 0x7F,
    sequenceNumber: data.readUInt16BE(2),
    timestamp: data.readUInt32BE(4),
    ssrc: data.readUInt32BE(8),
    csrc: [],
  }

  let offset = RTP_HEADER_SIZE
  for (let i = 0; i < header.csrcCount; i++) {
    header.csrc.push(data.readUInt32BE(offset))
    offset += 4
  }

  // Handle extension header
  if (header.extension) {
    if (data.length < offset + 4) return null
    const extLength = data.readUInt16BE(offset + 2) * 4
    offset += 4 + extLength
  }

  // Handle padding
  let payloadEnd = data.length
  if (header.padding) {
    const padLen = data[data.length - 1]
    payloadEnd -= padLen
  }

  const payload = data.slice(offset, payloadEnd)
  return { header, payload }
}

export function buildRtpPacket(
  payloadType: number,
  sequenceNumber: number,
  timestamp: number,
  ssrc: number,
  payload: Buffer,
  marker = false
): Buffer {
  const totalSize = RTP_HEADER_SIZE + payload.length
  const packet = Buffer.alloc(totalSize)

  // First byte: V=2, P=0, X=0, CC=0
  packet[0] = 0x80

  // Second byte: M + PT
  packet[1] = (marker ? 0x80 : 0x00) | (payloadType & 0x7F)

  // JS bitwise ops are signed 32-bit — force unsigned for RTP fields
  packet.writeUInt16BE(sequenceNumber & 0xffff, 2)
  packet.writeUInt32BE(timestamp >>> 0, 4)
  packet.writeUInt32BE(ssrc >>> 0, 8)

  payload.copy(packet, RTP_HEADER_SIZE)

  return packet
}

export function createRtpSession(
  localPort: number,
  remoteAddress: string,
  remotePort: number,
  ssrc: number,
  payloadType: number
) {
  const socket = dgram.createSocket({ type: 'udp4', reuseAddr: true })

  let seqNum = Math.floor(Math.random() * 65535)
  let timestamp = Math.floor(Math.random() * 0xffffffff) >>> 0
  const clockRate = payloadType === 0 || payloadType === 8 ? 8000 : 48000

  socket.bind(localPort)

  return {
    socket,
    getLocalPort() {
      return socket.address().port
    },
    send(payload: Buffer) {
      const pkt = buildRtpPacket(payloadType, seqNum, timestamp, ssrc >>> 0, payload, false)
      socket.send(pkt, 0, pkt.length, remotePort, remoteAddress)
      seqNum = (seqNum + 1) & 0xffff
      timestamp = (timestamp + (clockRate === 8000 ? 160 : 960)) >>> 0
    },
    close() {
      socket.close()
    },
  }
}
