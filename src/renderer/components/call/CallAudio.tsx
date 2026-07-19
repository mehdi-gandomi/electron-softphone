import { useEffect, useRef } from 'react'
import { useCallStore } from '../../stores/callStore'
import type { CallInfo } from '../../../shared/types'

/**
 * Bridges Web Audio (mic + speaker) to main-process RTP.
 * Mic: capture → downsample to 8kHz Int16 → sip.sendAudio
 * Speaker: sip.onAudio → play Int16 PCM via AudioContext
 */
export function CallAudio() {
  const calls = useCallStore((s) => s.calls)
  const activeCall = Array.from(calls.values()).find((c: CallInfo) => c.state === 'active')
  const callId = activeCall?.id

  const ctxRef = useRef<AudioContext | null>(null)
  const playTimeRef = useRef(0)

  useEffect(() => {
    if (!callId || !window.api?.sip) return

    let cancelled = false
    let mediaStream: MediaStream | null = null
    let processor: ScriptProcessorNode | null = null
    let source: MediaStreamAudioSourceNode | null = null

    const start = async () => {
      try {
        const ctx = new AudioContext({ sampleRate: 48000 })
        ctxRef.current = ctx
        playTimeRef.current = ctx.currentTime

        mediaStream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
            channelCount: 1,
          },
          video: false,
        })
        if (cancelled) {
          mediaStream.getTracks().forEach((t) => t.stop())
          return
        }

        source = ctx.createMediaStreamSource(mediaStream)
        // 2048 samples @ 48kHz ≈ 42ms; downsample to 8kHz for G.711
        processor = ctx.createScriptProcessor(2048, 1, 1)
        processor.onaudioprocess = (e) => {
          if (cancelled || !callId) return
          const input = e.inputBuffer.getChannelData(0)
          const pcm8k = downsampleTo8k(input, ctx.sampleRate)
          const bytes = new Uint8Array(pcm8k.buffer, pcm8k.byteOffset, pcm8k.byteLength)
          const copy = bytes.slice().buffer
          window.api.sip.sendAudio(callId, copy)
        }
        source.connect(processor)
        const mute = ctx.createGain()
        mute.gain.value = 0
        processor.connect(mute)
        mute.connect(ctx.destination)

        window.api.sip.onAudio((data) => {
          if (cancelled || data.callId !== callId || !ctxRef.current) return
          playPcm(ctxRef.current, data.pcm, playTimeRef)
        })
      } catch (err) {
        console.error('CallAudio start failed:', err)
      }
    }

    start()

    return () => {
      cancelled = true
      window.api.sip.offAudio()
      try { processor?.disconnect() } catch {}
      try { source?.disconnect() } catch {}
      mediaStream?.getTracks().forEach((t) => t.stop())
      ctxRef.current?.close().catch(() => {})
      ctxRef.current = null
    }
  }, [callId])

  return null
}

function downsampleTo8k(input: Float32Array, sampleRate: number): Int16Array {
  const ratio = sampleRate / 8000
  const outLen = Math.floor(input.length / ratio)
  const out = new Int16Array(outLen)
  for (let i = 0; i < outLen; i++) {
    const idx = Math.floor(i * ratio)
    const s = Math.max(-1, Math.min(1, input[idx] || 0))
    out[i] = s < 0 ? s * 0x8000 : s * 0x7fff
  }
  return out
}

function playPcm(
  ctx: AudioContext,
  pcm: ArrayBuffer | Uint8Array,
  playTimeRef: { current: number }
) {
  const buf = pcm instanceof ArrayBuffer ? new Int16Array(pcm) : new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2))
  if (buf.length === 0) return

  // Upsample 8kHz → context rate
  const ratio = ctx.sampleRate / 8000
  const frames = Math.floor(buf.length * ratio)
  const audioBuf = ctx.createBuffer(1, frames, ctx.sampleRate)
  const ch = audioBuf.getChannelData(0)
  for (let i = 0; i < frames; i++) {
    const srcIdx = Math.min(buf.length - 1, Math.floor(i / ratio))
    ch[i] = buf[srcIdx] / 32768
  }

  const src = ctx.createBufferSource()
  src.buffer = audioBuf
  src.connect(ctx.destination)

  const now = ctx.currentTime
  const startAt = Math.max(now + 0.02, playTimeRef.current)
  src.start(startAt)
  playTimeRef.current = startAt + audioBuf.duration
}
