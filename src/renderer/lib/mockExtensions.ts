import { getBuildMockExtensions } from '../../shared/buildConfig'
import type { ExtensionInfo } from '../../shared/types'

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

export async function listMockExtensions(): Promise<ExtensionInfo[]> {
  await sleep(250)
  return getBuildMockExtensions()
}

