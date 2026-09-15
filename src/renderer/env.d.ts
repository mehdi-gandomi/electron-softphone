import type { SipAccount, RegistrationInfo, CallInfo, CallState } from '../shared/types'

declare module '*.png' {
  const src: string
  export default src
}

interface ImportMetaEnv {
  readonly VITE_AUTH_API_BASE_URL?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
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
      socket: {
        status: () => Promise<{
          running: boolean
          httpsRunning: boolean
          enabled: boolean
          reachable: boolean
          host: string
          port: number
          httpsPort: number
          url: string
          httpsUrl: string
          clients: number
          detail: string
        }>
        tlsStatus: () => Promise<{
          installed: boolean
          thumbprint?: string
          error?: string
        }>
        installTlsCert: () => Promise<{
          success: boolean
          alreadyInstalled?: boolean
          thumbprint?: string
          error?: string
          message?: string
        }>
        firefoxEnterpriseRootsStatus: () => Promise<{
          configured: boolean
          profilesChecked: number
          detail?: string
        }>
        enableFirefoxEnterpriseRoots: () => Promise<{
          success: boolean
          profilesUpdated: number
          profilePaths: string[]
          policyPath?: string
          alreadyConfigured?: boolean
          error?: string
          message?: string
        }>
        restartFirefox: () => Promise<{
          success: boolean
          killed: boolean
          launched: boolean
          exePath?: string
          error?: string
          message?: string
        }>
        openHttpsTrustPage: () => Promise<{ success: boolean; error?: string }>
        emitNuisance: (payload: {
          callId: string
          nuisanceType: number
          nuisanceLabel: string
        }) => Promise<{ success: boolean; error?: string; clients?: number }>
        emitOperator: () => Promise<{ success: boolean; error?: string; clients?: number }>
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
        emulateIncomingCall: (payload?: {
          callerId?: string
          callerName?: string
          issabelId?: string
        }) => Promise<{ success: boolean; callId?: string; error?: string }>
      }
      ringtone: {
        list: () => Promise<Array<{ id: string; name: string; path: string; builtin: boolean }>>
        import: () => Promise<{ success: boolean; path?: string; name?: string; error?: string }>
        readDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
        resolve: (preset: string, customPath: string) => Promise<string>
      }
      recording: {
        getDefaultPath: () => Promise<string>
        getResolvedPath: () => Promise<string>
        pickFolder: () => Promise<{ success: boolean; path?: string; error?: string }>
        openFolder: () => Promise<{ success: boolean; path?: string }>
        revealFile: (filePath: string) => Promise<{ success: boolean; error?: string }>
        readDataUrl: (filePath: string) => Promise<{ success: boolean; dataUrl?: string; error?: string }>
      }
      auth: {
        shiftInfo: (nationalCode: string) => Promise<{
          ok: boolean
          status: number
          json: unknown | null
          error?: string
        }>
        login: (username: string, password: string) => Promise<{
          ok: boolean
          status: number
          json: unknown | null
          error?: string
        }>
      }
      system: {
        checkClock: () => Promise<{
          ok: boolean
          blocked: boolean
          skewMs: number
          maxSkewMs: number
          localTimeMs: number
          trustedTimeMs: number | null
          source: string | null
          localLabel: string
          trustedLabel: string | null
          error?: string
        }>
        openDateSettings: () => Promise<{ success: boolean; error?: string }>
      }
      extensions: {
        status: (provinceId: number) => Promise<{
          ok: boolean
          status: number
          json: unknown | null
          error?: string
        }>
        reserve: (payload: {
          provinceId: number
          nationalCode: string
          extension: string
        }) => Promise<{
          ok: boolean
          status: number
          json: unknown | null
          error?: string
        }>
        logout: (payload: {
          nationalCode: string
          extension: string
          provinceId?: number
        }) => Promise<{
          ok: boolean
          status: number
          json: unknown | null
          error?: string
        }>
      }
      updater: {
        status: () => Promise<import('../shared/types').UpdaterStatus>
        check: () => Promise<import('../shared/types').UpdaterStatus>
        download: () => Promise<import('../shared/types').UpdaterStatus>
        install: () => Promise<{ success: boolean; error?: string }>
        openRelease: () => Promise<{ success: boolean; error?: string }>
        onStatus: (callback: (status: import('../shared/types').UpdaterStatus) => void) => () => void
      }
    }
  }
}

export {}
