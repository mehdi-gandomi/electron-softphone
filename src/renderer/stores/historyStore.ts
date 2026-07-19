import { create } from 'zustand'
import type { CallRecord } from '../../shared/types'

const STORAGE_KEY = 'voxphone-call-history'
const MAX_RECORDS = 500

function loadRecords(): CallRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return []
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function saveRecords(records: CallRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, MAX_RECORDS)))
  } catch {}
}

interface HistoryStore {
  records: CallRecord[]
  setRecords: (records: CallRecord[]) => void
  addRecord: (record: CallRecord) => void
  removeRecord: (id: string) => void
  clearAll: () => void
  getFiltered: (filter: 'all' | 'missed' | 'dialed' | 'received') => CallRecord[]
}

export const useHistoryStore = create<HistoryStore>((set, get) => ({
  records: loadRecords(),

  setRecords: (records) => {
    saveRecords(records)
    set({ records })
  },

  addRecord: (record) =>
    set((s) => {
      const records = [record, ...s.records].slice(0, MAX_RECORDS)
      saveRecords(records)
      return { records }
    }),

  removeRecord: (id) =>
    set((s) => {
      const records = s.records.filter((r) => r.id !== id)
      saveRecords(records)
      return { records }
    }),

  clearAll: () => {
    saveRecords([])
    set({ records: [] })
  },

  getFiltered: (filter) => {
    const { records } = get()
    switch (filter) {
      case 'missed':
        return records.filter((r) => r.result === 'missed')
      case 'dialed':
        return records.filter((r) => r.direction === 'outbound')
      case 'received':
        return records.filter((r) => r.direction === 'inbound' && r.result === 'answered')
      default:
        return records
    }
  },
}))
