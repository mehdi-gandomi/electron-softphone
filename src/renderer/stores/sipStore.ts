import { create } from 'zustand'
import type { RegistrationInfo } from '../../shared/types'

interface SipStore {
  status: RegistrationInfo['status']
  expires: number
  errorMessage: string | null
  setStatus: (status: RegistrationInfo['status'], expires?: number, errorMessage?: string | null) => void
}

export const useSipStore = create<SipStore>((set) => ({
  status: 'disconnected',
  expires: 0,
  errorMessage: null,
  setStatus: (status, expires = 0, errorMessage = null) =>
    set({ status, expires, errorMessage: errorMessage ?? null }),
}))
