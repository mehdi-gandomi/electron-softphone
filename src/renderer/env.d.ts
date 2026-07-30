import type { SipAccount, RegistrationInfo, CallInfo, CallState } from '../shared/types'

declare module '*.png' {
  const src: string
  export default src
}

// Expose API type
declare global {
  interface Window {
    api: {
      window: {
        minimize: () => void
        maximize: () => void
        close: () => void
        toggleAlwaysOnTop: () => void
      }
      settings: {
        get: () => Promise<Record<string, unknown>>
        set: (key: string, value: unknown) => Promise<boolean>
        unlockDeveloper: (key: string) => Promise<{ success: boolean }>
        lockDeveloper: () => Promise<boolean>
        isDeveloperUnlocked: () => Promise<boolean>
        resetBuildDefaults: () => Promise<Record<string, unknown>>
      }
      accounts: {
        list: () => Promise<SipAccount[]>
        add: (account: SipAccount) => Promise<boolean>
        update: (id: string, updates: Partial<SipAccount>) => Promise<boolean>
        remove: (id: string) => Promise<boolean>
        setActive: (id: string) => Promise<boolean>
      }
      sip: {
        start: () => Promise<{ success: boolean; error?: string }>
        stop: () => Promise<{ success: boolean }>
        configure: (account: SipAccount) => Promise<{ success: boolean; error?: string }>
        register: () => Promise<{ success: boolean; error?: string }>
        unregister: () => Promise<{ success: boolean; error?: string }>
        makeCall: (number: string) => Promise<{ success: boolean; callId?: string; error?: string }>
        answerCall: (callId: string) => Promise<{ success: boolean }>
        hangupCall: (callId: string) => Promise<{ success: boolean }>
        holdCall: (callId: string) => Promise<{ success: boolean }>
        unholdCall: (callId: string) => Promise<{ success: boolean }>
        transferCall: (callId: string, target: string) => Promise<{ success: boolean }>
        sendDtmf: (callId: string, digit: string) => Promise<{ success: boolean }>
        muteCall: (callId: string, muted: boolean) => Promise<{ success: boolean }>
        getActiveCalls: () => Promise<CallInfo[]>
        getCall: (callId: string) => Promise<CallInfo | null>
        getLog: () => Promise<Array<{ timestamp: number; direction: string; message: string; raw?: string }>>
        clearLog: () => Promise<boolean>
        reconnect: () => Promise<{ success: boolean; error?: string }>
        sendAudio: (callId: string, pcm: ArrayBuffer) => void
        onAudio: (callback: (data: { callId: string; pcm: Uint8Array }) => void) => void
        offAudio: () => void
      }
      api: {
        sendWebhook: (event: string, data: Record<string, unknown>) => Promise<{ success: boolean; error?: string }>
      }
      on: (channel: string, callback: (...args: unknown[]) => void) => void
      off: (channel: string, callback: (...args: unknown[]) => void) => void
      clipboard: {
        writeText: (text: string) => Promise<boolean>
      }
      debug: {
        saveLog: (text: string) => Promise<{ success: boolean; path?: string; error?: string }>
        openLogsFolder: () => Promise<{ success: boolean; path?: string }>
        getLogFilePath: () => Promise<string>
      }
      ringtone: {
        list: () => Promise<Array<{ id: string; name: string; path: string; builtin: boolean }>>
        import: () => Promise<{ success: boolean; path?: string; name?: string; error?: string }>
        readDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
        resolve: (preset: string, customPath: string) => Promise<string>
      }
    }
  }
}

export {}
