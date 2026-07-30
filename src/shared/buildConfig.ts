import type { ApiIntegration, ScreenPopSettings, SocketServerSettings } from './types'
import buildJson from '../../config/build.json'

export interface BuildConfig {
  developerKey: string
  apiIntegration: ApiIntegration
  screenPop: ScreenPopSettings
  socketServer: SocketServerSettings
}

const raw = buildJson as BuildConfig & { _comment?: string }

export const buildConfig: BuildConfig = {
  developerKey: raw.developerKey || 'change-me',
  apiIntegration: raw.apiIntegration,
  screenPop: raw.screenPop,
  socketServer: raw.socketServer,
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
