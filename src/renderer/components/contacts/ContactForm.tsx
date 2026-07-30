import { useState } from 'react'
import type { Contact } from '../../../shared/types'
import { useI18n } from '../../lib/i18n'

interface ContactFormProps {
  contact: Contact | null
  onSave: (data: Omit<Contact, 'id' | 'createdAt' | 'updatedAt'>) => void
  onClose: () => void
}

export function ContactForm({ contact, onSave, onClose }: ContactFormProps) {
  const { t } = useI18n()
  const [name, setName] = useState(contact?.name || '')
  const [number, setNumber] = useState(contact?.number || '')
  const [email, setEmail] = useState(contact?.email || '')
  const [company, setCompany] = useState(contact?.company || '')
  const [notes, setNotes] = useState(contact?.notes || '')

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!name.trim() || !number.trim()) return
    onSave({
      name: name.trim(),
      number: number.trim(),
      email: email.trim(),
      company: company.trim(),
      notes: notes.trim(),
      starred: contact?.starred || false,
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm animate-fade-in">
      <div className="w-[380px] bg-bg-surface border border-border rounded-3xl p-6 shadow-2xl animate-scale-in">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-lg font-semibold text-text">
            {contact ? t('contactForm.edit') : t('contactForm.new')}
          </h2>
          <button onClick={onClose} className="title-bar-btn text-text-secondary">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6L6 18M6 6l12 12"/>
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('contactForm.name')}</label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="input-field text-sm"
              placeholder={t('contactForm.namePlaceholder')}
              autoFocus
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('contactForm.number')}</label>
            <input
              type="text"
              value={number}
              onChange={(e) => setNumber(e.target.value)}
              className="input-field text-sm font-mono"
              placeholder={t('contactForm.numberPlaceholder')}
              required
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('contactForm.email')}</label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="input-field text-sm"
              placeholder={t('contactForm.emailPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('contactForm.company')}</label>
            <input
              type="text"
              value={company}
              onChange={(e) => setCompany(e.target.value)}
              className="input-field text-sm"
              placeholder={t('contactForm.companyPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('contactForm.notes')}</label>
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              className="input-field text-sm h-20 resize-none"
              placeholder={t('contactForm.notesPlaceholder')}
            />
          </div>

          <div className="flex gap-3 pt-2">
            <button type="button" onClick={onClose} className="btn-ghost flex-1 text-sm">
              {t('contactForm.cancel')}
            </button>
            <button
              type="submit"
              disabled={!name.trim() || !number.trim()}
              className="btn-primary flex-1 text-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {contact ? t('contactForm.save') : t('contactForm.add')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
