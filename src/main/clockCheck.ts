import { getEmdadServerTime } from './remoteApi'
import type { RemoteApiResponse } from './remoteApi'

/** Probe GET /ecrc/api/emdad-phone/server-time. Evaluation runs in the renderer. */
export function fetchEmdadServerTime(): Promise<RemoteApiResponse> {
  return getEmdadServerTime()
}
