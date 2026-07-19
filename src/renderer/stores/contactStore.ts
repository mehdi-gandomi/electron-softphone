import { create } from 'zustand'
import type { Contact } from '../../shared/types'

interface ContactStore {
  contacts: Contact[]
  searchQuery: string
  setContacts: (contacts: Contact[]) => void
  addContact: (contact: Contact) => void
  updateContact: (id: string, updates: Partial<Contact>) => void
  removeContact: (id: string) => void
  setSearchQuery: (query: string) => void
  getFilteredContacts: () => Contact[]
}

export const useContactStore = create<ContactStore>((set, get) => ({
  contacts: [],
  searchQuery: '',

  setContacts: (contacts) => set({ contacts }),

  addContact: (contact) =>
    set((s) => ({ contacts: [...s.contacts, contact] })),

  updateContact: (id, updates) =>
    set((s) => ({
      contacts: s.contacts.map((c) =>
        c.id === id ? { ...c, ...updates } : c
      ),
    })),

  removeContact: (id) =>
    set((s) => ({
      contacts: s.contacts.filter((c) => c.id !== id),
    })),

  setSearchQuery: (query) => set({ searchQuery: query }),

  getFilteredContacts: () => {
    const { contacts, searchQuery } = get()
    if (!searchQuery) return contacts
    const q = searchQuery.toLowerCase()
    return contacts.filter(
      (c) =>
        c.name.toLowerCase().includes(q) ||
        c.number.includes(q) ||
        c.company.toLowerCase().includes(q)
    )
  },
}))
