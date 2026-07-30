import type {
  ApiIntegration,
  ExtensionInfo,
  ScreenPopSettings,
  SocketServerSettings,
  UserProfile,
} from './types'
import buildJson from '../../config/build.json'

export interface BuildConfig {
  developerKey: string
  apiIntegration: ApiIntegration
  screenPop: ScreenPopSettings
  socketServer: SocketServerSettings
  auth: AuthBuildConfig
  extensions: ExtensionInfo[]
}

export interface AuthBuildConfig {
  enabled: boolean
  mockUser: UserProfile & {
    password: string
  }
  conflict: {
    enabled: boolean
    pcName: string
    ipAddress: string
    location: string
    lastSeen: string
  }
}

const raw = buildJson as BuildConfig & { _comment?: string }

export const buildConfig: BuildConfig = {
  developerKey: raw.developerKey || 'change-me',
  apiIntegration: raw.apiIntegration,
  screenPop: raw.screenPop,
  socketServer: raw.socketServer,
  auth: raw.auth,
  extensions: raw.extensions,
}

export function getBuildDeveloperKey(): string {
  return buildConfig.developerKey
}

export function getBuildIntegrationDefaults(): Pick<
  BuildConfig,
  'apiIntegration' | 'screenPop' | 'socketServer'
> {
  return {
    apiIntegration: structuredClone(buildConfig.apiIntegration),
    screenPop: structuredClone(buildConfig.screenPop),
    socketServer: structuredClone(buildConfig.socketServer),
  }
}

export function getBuildAuthConfig(): AuthBuildConfig {
  return structuredClone(buildConfig.auth)
}

export function getBuildMockExtensions(): ExtensionInfo[] {
  return structuredClone(buildConfig.extensions)
}
