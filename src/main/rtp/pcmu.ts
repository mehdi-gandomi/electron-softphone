// G.711 μ-law (ITU-T G.711)

const BIAS = 0x84
const CLIP = 32635

const MULAW_DECODE: Int16Array = (() => {
  const table = new Int16Array(256)
  for (let i = 0; i < 256; i++) {
    const mu = ~i & 0xff
    const sign = mu & 0x80
    const exponent = (mu >> 4) & 0x07
    const mantissa = mu & 0x0f
    let sample = ((mantissa << 3) + BIAS) << exponent
    sample -= BIAS
    table[i] = sign ? -sample : sample
  }
  return table
})()

export function pcmuDecode(data: Buffer): Buffer {
  const out = Buffer.alloc(data.length * 2)
  for (let i = 0; i < data.length; i++) {
    out.writeInt16LE(MULAW_DECODE[data[i]], i * 2)
  }
  return out
}

export function pcmuEncode(data: Buffer): Buffer {
  const samples = data.length / 2
  const out = Buffer.alloc(samples)
  for (let i = 0; i < samples; i++) {
    let sample = data.readInt16LE(i * 2)
    const sign = sample < 0 ? 0x80 : 0
    if (sample < 0) sample = -sample
    if (sample > CLIP) sample = CLIP
    sample += BIAS

    let exponent = 7
    for (let mask = 0x4000; (sample & mask) === 0 && exponent > 0; mask >>= 1) {
      exponent--
    }
    const mantissa = (sample >> (exponent + 3)) & 0x0f
    out[i] = ~(sign | (exponent << 4) | mantissa) & 0xff
  }
  return out
}
