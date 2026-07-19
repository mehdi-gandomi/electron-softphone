// G.711 A-law Decoder (ITU-T G.711)
// Converts 8-bit A-law samples to 16-bit linear PCM

const A_LAW_MAX = 0x7FFF
const A_LAW_BIAS = 0x84

// A-law to linear lookup table
const ALAW_TO_LINEAR: Int16Array = (() => {
  const table = new Int16Array(256)
  for (let i = 0; i < 256; i++) {
    let val = i ^ 0x55 // Toggle even bits
    const sign = val & 0x80
    let exponent = (val >> 4) & 0x07
    let mantissa = val & 0x0F

    if (exponent === 0) {
      mantissa = (mantissa << 1) | 1
    } else {
      mantissa = (mantissa << 1) | 0x21
      mantissa <<= exponent - 1
    }

    if (sign) {
      table[i] = -mantissa
    } else {
      table[i] = mantissa
    }
  }
  return table
})()

export function pcmaDecode(data: Buffer): Buffer {
  const samples = data.length
  const result = Buffer.alloc(samples * 2)
  for (let i = 0; i < samples; i++) {
    result.writeInt16LE(ALAW_TO_LINEAR[data[i]], i * 2)
  }
  return result
}

export function pcmaEncode(data: Buffer): Buffer {
  const samples = data.length / 2
  const result = Buffer.alloc(samples)
  for (let i = 0; i < samples; i++) {
    const sample = data.readInt16LE(i * 2)
    const absVal = Math.abs(sample)
    const sign = sample < 0 ? 0x80 : 0

    if (absVal > A_LAW_MAX) {
      result[i] = sign | 0x7F
      continue
    }

    let val = absVal + A_LAW_BIAS
    if (val > 0x7FFF) val = 0x7FFF

    let exponent = 0
    if (val >= 0x100) {
      exponent = 1
      if (val >= 0x200) {
        exponent = 2
        if (val >= 0x400) {
          exponent = 3
          if (val >= 0x800) {
            exponent = 4
            if (val >= 0x1000) {
              exponent = 5
              if (val >= 0x2000) {
                exponent = 6
                if (val >= 0x4000) {
                  exponent = 7
                }
              }
            }
          }
        }
      }
    }

    let mantissa = (val >> (exponent + 3)) & 0x0F
    const encoded = sign | (exponent << 4) | mantissa
    result[i] = encoded ^ 0x55 // Toggle even bits
  }
  return result
}
