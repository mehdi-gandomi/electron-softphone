import { useState, useEffect } from 'react'
import { useContactStore } from '../../stores/contactStore'
import { ContactForm } from './ContactForm'
import type { Contact } from '../../../shared/types'
import { randomId } from '../../lib/utils'

export function ContactList() {
  const { contacts, searchQuery, setSearchQuery, getFilteredContacts, addContact, removeContact, setContacts } = useContactStore()
  const [showForm, setShowForm] = useState(false)
  const [editingContact, setEditingContact] = useState<Contact | null>(null)
  const filtered = getFilteredContacts()

  useEffect(() => {
    // Load contacts from localStorage
    const saved = localStorage.getItem('voxphone-contacts')
    if (saved) {
      try {
        setContacts(JSON.parse(saved))
      } catch {}
    }
  }, [])

  const handleSave = (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => {
    const now = Date.now()
    if (editingContact) {
      const updated = { ...editingContact, ...data, updatedAt: now }
      const newContacts = contacts.map(c => c.id === editingContact.id ? updated : c)
      setContacts(newContacts)
      localStorage.setItem('voxphone-contacts', JSON.stringify(newContacts))
    } else {
      const newContact: Contact = { ...data, id: randomId(), createdAt: now, updatedAt: now }
      addContact(newContact)
      localStorage.setItem('voxphone-contacts', JSON.stringify([...contacts, newContact]))
    }
    setShowForm(false)
    setEditingContact(null)
  }

  const handleDelete = (id: string) => {
    const newContacts = contacts.filter(c => c.id !== id)
    setContacts(newContacts)
    localStorage.setItem('voxphone-contacts', JSON.stringify(newContacts))
  }

  const handleCall = (number: string) => {
    window.api.sip.makeCall(number)
  }

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-text">Contacts</h1>
        <button
          onClick={() => { setEditingContact(null); setShowForm(true) }}
          className="btn-primary text-sm py-1.5 px-3"
        >
          + Add
        </button>
      </div>

      {/* Search */}
      <div className="relative mb-4">
        <svg className="absolute left-3 top-1/2 -translate-y-1/2 text-text-muted" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="11" cy="11" r="8"/>
          <path d="M21 21l-4.35-4.35"/>
        </svg>
        <input
          type="text"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search contacts..."
          className="input-field pl-10 text-sm"
        />
      </div>

      {/* List */}
      <div className="flex-1 overflow-y-auto space-y-1">
        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-40 text-text-muted">
            <svg width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" className="mb-2 opacity-50">
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/>
              <circle cx="12" cy="7" r="4"/>
            </svg>
            <p className="text-sm">{searchQuery ? 'No contacts found' : 'No contacts yet'}</p>
          </div>
        ) : (
          filtered.map((contact) => (
            <div
              key={contact.id}
              className="flex items-center gap-3 p-3 rounded-xl hover:bg-bg-surface border border-transparent hover:border-border transition-all duration-150 group cursor-pointer"
              onClick={() => handleCall(contact.number)}
            >
              <div className="w-10 h-10 rounded-full bg-accent/15 flex items-center justify-center text-sm font-semibold text-accent flex-shrink-0">
                {contact.name.charAt(0).toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-text truncate">{contact.name}</p>
                <p className="text-xs text-text-secondary font-mono truncate">{contact.number}</p>
              </div>
              <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                <button
                  onClick={(e) => { e.stopPropagation(); setEditingContact(contact); setShowForm(true) }}
                  className="w-8 h-8 rounded-lg hover:bg-white/10 flex items-center justify-center text-text-secondary"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"/>
                    <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"/>
                  </svg>
                </button>
                <button
                  onClick={(e) => { e.stopPropagation(); handleDelete(contact.id) }}
                  className="w-8 h-8 rounded-lg hover:bg-error/20 flex items-center justify-center text-text-secondary hover:text-error"
                >
                  <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                    <polyline points="3 6 5 6 21 6"/>
                    <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/>
                  </svg>
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Modal */}
      {showForm && (
        <ContactForm
          contact={editingContact}
          onSave={handleSave}
          onClose={() => { setShowForm(false); setEditingContact(null) }}
        />
      )}
    </div>
  )
}
