import { create } from 'zustand'
import type { CallInfo, CallState } from '../../shared/types'

interface CallStore {
  calls: Map<string, CallInfo>
  activeCallId: string | null
  incomingCall: CallInfo | null

  setCallState: (callId: string, state: CallState) => void
  addCall: (call: CallInfo) => void
  removeCall: (callId: string) => void
  setActiveCall: (callId: string | null) => void
  setIncomingCall: (call: CallInfo | null) => void
  updateCall: (callId: string, updates: Partial<CallInfo>) => void
  getActiveCall: () => CallInfo | null
}

export const useCallStore = create<CallStore>((set, get) => ({
  calls: new Map(),
  activeCallId: null,
  incomingCall: null,

  setCallState: (callId, state) => {
    set((s) => {
      const newCalls = new Map(s.calls)
      const call = newCalls.get(callId)
      if (call) {
        newCalls.set(callId, { ...call, state })
      }
      return { calls: newCalls }
    })
  },

  addCall: (call) => {
    set((s) => {
      const newCalls = new Map(s.calls)
      newCalls.set(call.id, call)
      return { calls: newCalls, activeCallId: call.id }
    })
  },

  removeCall: (callId) => {
    set((s) => {
      const newCalls = new Map(s.calls)
      newCalls.delete(callId)
      const newActive = s.activeCallId === callId ? null : s.activeCallId
      return { calls: newCalls, activeCallId: newActive }
    })
  },

  setActiveCall: (callId) => set({ activeCallId: callId }),

  setIncomingCall: (call) => set({ incomingCall: call }),

  updateCall: (callId, updates) => {
    set((s) => {
      const newCalls = new Map(s.calls)
      const call = newCalls.get(callId)
      if (call) {
        newCalls.set(callId, { ...call, ...updates })
      }
      return { calls: newCalls }
    })
  },

  getActiveCall: () => {
    const { calls, activeCallId } = get()
    if (!activeCallId) return null
    return calls.get(activeCallId) || null
  },
}))
