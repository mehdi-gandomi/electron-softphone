// ============================================================
// Shared Types
// ============================================================

// --- SIP Account ---
export interface SipAccount {
  id: string
  displayName: string
  username: string
  authUser: string
  password: string
  domain: string
  sipServer: string
  sipProxy: string
  transport: 'udp' | 'tcp' | 'tls'
  localPort: number
  registerExpiry: number
  stunServer: string
  codecs: Codec[]
  enabled: boolean
}

export type Codec = 'PCMU' | 'PCMA' | 'opus'

/** Nuisance / مزاحم report categories (emdad contact form). */
export const NuisanceType = {
  INSULT: 1,
  ENTERTAINMENT: 2,
  SILENCE: 3,
  EMERGENCY_TEST: 4,
} as const

export type NuisanceTypeId = (typeof NuisanceType)[keyof typeof NuisanceType]

export const NUISANCE_TYPE_IDS: NuisanceTypeId[] = [
  NuisanceType.INSULT,
  NuisanceType.ENTERTAINMENT,
  NuisanceType.SILENCE,
  NuisanceType.EMERGENCY_TEST,
]

// --- SIP Registration ---
export type RegistrationStatus = 'disconnected' | 'connecting' | 'registered' | 'failed' | 'expired'

export interface RegistrationInfo {
  status: RegistrationStatus
  expires: number
  errorMessage?: string
}

// --- Call ---
export type CallState =
  | 'idle'
  | 'outgoing'
  | 'incoming'
  | 'connecting'
  | 'ringing'
  | 'active'
  | 'holding'
  | 'held'
  | 'ended'

export interface CallInfo {
  id: string
  state: CallState
  direction: 'inbound' | 'outbound'
  remoteNumber: string
  remoteName: string
  localNumber: string
  /** Value from configured Issabel/Asterisk SIP header (inbound INVITE), if present */
  issabelId: string
  startTime: number
  answerTime: number
  endTime: number
  duration: number
  isMuted: boolean
  isOnHold: boolean
  isRecording: boolean
  codec: Codec
  remoteRtpPort: number
  remoteRtpAddress: string
  localRtpPort: number
  callId: string
  fromTag: string
  toTag: string
}

// --- Contact ---
export interface Contact {
  id: string
  name: string
  number: string
  email: string
  company: string
  notes: string
  starred: boolean
  createdAt: number
  updatedAt: number
}

// --- Call History ---
export type CallDirection = 'inbound' | 'outbound'
export type CallResult = 'answered' | 'missed' | 'rejected' | 'no-answer'

export interface CallRecord {
  id: string
  contactId?: string
  number: string
  name: string
  direction: CallDirection
  result: CallResult
  duration: number
  timestamp: number
  codec?: Codec
  /** Absolute path to mixed WAV when auto-record captured this call */
  recordingPath?: string
}

// --- Settings ---
export type Locale = 'fa' | 'en'

export interface AppSettings {
  accounts: SipAccount[]
  activeAccountId: string
  /** UI language — defaults to Farsi */
  locale: Locale
  ringtonePath: string
  /** classic | soft | urgent | chime | custom */
  ringtonePreset: string
  ringtoneVolume: number
  micVolume: number
  speakerVolume: number
  inputDevice: string
  outputDevice: string
  dndEnabled: boolean
  callForwardEnabled: boolean
  callForwardNumber: string
  autoAnswer: boolean
  autoAnswerDelay: number
  /** When true, answered calls are recorded to WAV automatically */
  autoRecordCalls: boolean
  /** When true, record stereo (L=local, R=remote); false = mixed mono (default) */
  recordingStereo: boolean
  /** Custom recordings folder; empty = use {userData}/recordings */
  recordingPath: string
  enableLogging: boolean
  enableTray: boolean
  minimizeToTray: boolean
  hotkeys: HotkeyConfig
  apiIntegration: ApiIntegration
  screenPop: ScreenPopSettings
  socketServer: SocketServerSettings
  /**
   * When false, apiIntegration / screenPop / socketServer are re-applied from config/build.json on load.
   * Set true after a developer unlocks and saves those sections.
   */
  developerOverrides: boolean
  /**
   * How often (minutes) to re-fetch shift info from the API while logged in.
   * When the assigned shift has ended, the user is logged out.
   * Editable in developer mode. Default: 10.
   */
  shiftCheckIntervalMinutes: number
  userAccess: UserAccessState
  latestShiftLookup: LatestShiftLookup | null
  authSession: AuthSession | null
}

export interface UserProfile {
  nationalCode: string
  firstName: string
  lastName: string
  imageUrl: string
  shiftHour: string
  startDateTime: string
  endDateTime: string
  position: string
  provinceId?: number
  provinceTitle?: string
  branchId?: number
  branchTitle?: string
  memberId?: number
  postId?: number
  postTitleId?: number
  operationalCenterId?: number
}

export interface UserAccessState {
  status: 'needs_login' | 'skipped' | 'logged_in'
  profile: UserProfile | null
  selectedExtensionId: string
  reservedExtension?: ReservedExtensionState | null
}

export interface ShiftAssignment {
  personnelId: number
  memberId: number
  postId: number
  postTitleId: number
  postTitle: string
  operationalCenterId: number
  shiftTime: number
  order: number
  typeDay: number
  orderShift: number
  shiftSlotRule: number
  shiftKind: number
}

export interface LatestShiftLookup {
  nationalCode: string
  hasShift: boolean
  /** True when current local time falls inside the assigned shift window */
  isOnShift: boolean
  profile: UserProfile
  shifts: ShiftAssignment[]
  fetchedAt: string
}

export interface AuthSession {
  token: string
  tokenType: string
  message: string
  user: {
    id: number
    name: string
    username: string
    email: string | null
    mobile: string | null
    avatarUrl: string | null
  }
  member: {
    id: number
    nationalCode: string
    fullName: string
    reliefLevel: string | null
    avatarUrl: string | null
  }
  loggedInAt: string
}

export interface ExtensionInfo {
  id: string
  label: string
  province: string
  provinceId?: number
  extension: string
  /** SIP auth username from reserve response (may differ from extension) */
  username?: string
  host: string
  password: string
  displayName: string
  registeredElsewhere: boolean
  /** Occupying national code when status is used */
  occupiedByNationalCode?: string | null
}

export interface ReservedExtensionState {
  extension: string
  provinceId: number
  reservationId?: number
  reservedAt?: string
  /** SIP credentials from reserve response — do not invent */
  ip?: string
  username?: string
  password?: string
}

export interface SocketServerSettings {
  enabled: boolean
  /** Bind address — default 127.0.0.1 */
  host: string
  port: number
  /** Optional; empty = no auth. Clients send via handshake.auth.token */
  authToken: string
}

export type ScreenPopParamSource =
  | 'caller_id'
  | 'caller_name'
  | 'extension'
  | 'issabel_id'
  | 'call_id'
  | 'direction'
  | 'answer_date'
  | 'answer_time'
  | 'answer_datetime'
  | 'custom'

export interface ScreenPopParam {
  name: string
  source: ScreenPopParamSource
  customValue?: string
}

export interface ScreenPopSettings {
  enabled: boolean
  baseUrl: string
  /** SIP header that carries Issabel/Asterisk unique id (case-insensitive) */
  issabelHeader: string
  params: ScreenPopParam[]
}

export interface HotkeyConfig {
  answer: string
  hangup: string
  toggleMute: string
}

export interface ApiIntegration {
  enabled: boolean
  webhookUrl: string
  apiKey: string
  events: {
    incomingCall: boolean
    callAnswered: boolean
    callEnded: boolean
    callMissed: boolean
  }
  autoFillFields: AutoFillField[]
}

export interface AutoFillField {
  key: string
  label: string
  source: 'caller_id' | 'extension' | 'timestamp' | 'custom'
  customValue?: string
}

  // --- IPC Events ---
export interface IpcMessages {
  // Main -> Renderer
  'sip:registration-status': RegistrationInfo
  'sip:incoming-call': CallInfo
  'sip:outgoing-call': CallInfo
  'sip:call-state': { callId: string; state: CallState }
  'sip:call-ended': {
    callId: string
    duration: number
    direction?: CallDirection
    remoteNumber?: string
    remoteName?: string
    answered?: boolean
    result?: CallResult
    codec?: Codec
    timestamp?: number
    recordingPath?: string
  }
  'sip:dtmf-sent': { callId: string; digit: string }
  'sip:audio-device-changed': { devices: AudioDevice[] }

  // Renderer -> Main
  'sip:configure': SipAccount
  'sip:register': void
  'sip:unregister': void
  'sip:make-call': { number: string }
  'sip:answer-call': { callId: string }
  'sip:hangup-call': { callId: string }
  'sip:hold-call': { callId: string }
  'sip:unhold-call': { callId: string }
  'sip:transfer-call': { callId: string; target: string }
  'sip:send-dtmf': { callId: string; digit: string }
  'sip:mute-call': { callId: string; muted: boolean }
  'sip:record-call': { callId: string; record: boolean }
  'sip:set-device': { type: 'input' | 'output'; deviceId: string }
  'sip:set-volume': { type: 'mic' | 'speaker' | 'ringtone'; volume: number }
}

export interface AudioDevice {
  id: string
  name: string
  kind: 'audioinput' | 'audiooutput'
}

export type UpdaterState =
  | 'idle'
  | 'checking'
  | 'available'
  | 'unavailable'
  | 'downloading'
  | 'ready'
  | 'error'

export interface UpdaterStatus {
  currentVersion: string
  latestVersion: string | null
  releaseNotes: string
  releaseUrl: string
  state: UpdaterState
  progress: number
  error: string | null
  canInstall: boolean
  packaged: boolean
  portable: boolean
}
