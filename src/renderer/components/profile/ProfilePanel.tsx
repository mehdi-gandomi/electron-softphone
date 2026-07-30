import { useState } from 'react'
import { LoginGate } from '../auth/LoginGate'
import { ExtensionPicker } from '../auth/ExtensionPicker'
import { useI18n } from '../../lib/i18n'
import type {
  ExtensionInfo,
  UserAccessState,
  UserProfile,
} from '../../../shared/types'

interface ProfilePanelProps {
  userAccess: UserAccessState
  onLoginSuccess: (profile: UserProfile) => void
  onLogout: () => void
  onSelectExtension: (extension: ExtensionInfo) => void
  selectedExtension: ExtensionInfo | null
}

export function ProfilePanel({
  userAccess,
  onLoginSuccess,
  onLogout,
  onSelectExtension,
  selectedExtension,
}: ProfilePanelProps) {
  const { t } = useI18n()
  const profile = userAccess.profile
  const [showLogoutModal, setShowLogoutModal] = useState(false)
  const [logoutReason, setLogoutReason] = useState<'short_break' | 'leave' | 'technical_issue' | 'personal_emergency' | 'other' | ''>('')
  const [logoutNotes, setLogoutNotes] = useState('')
  const [sendSms, setSendSms] = useState(true)
  const [sendDefinedSms, setSendDefinedSms] = useState(false)

  if (userAccess.status !== 'logged_in' || !profile) {
    return (
      <div className="h-full">
        <LoginGate onLoginSuccess={onLoginSuccess} />
      </div>
    )
  }

  if (!userAccess.selectedExtensionId) {
    return <ExtensionPicker onSelect={onSelectExtension} />
  }

  const handleConfirmLogout = () => {
    if (!logoutReason) return

    // TODO: Replace this payload handoff with the real logout API request once the endpoint is available.
    const logoutPayload = {
      reason: logoutReason,
      notes: logoutNotes.trim(),
      notify: {
        sendSms,
        sendDefinedSms,
      },
      extensionId: selectedExtension?.id || '',
    }
    void logoutPayload

    setShowLogoutModal(false)
    setLogoutReason('')
    setLogoutNotes('')
    setSendSms(true)
    setSendDefinedSms(false)
    onLogout()
  }

  const logoutReasonOptions: Array<{
    value: 'short_break' | 'leave' | 'technical_issue' | 'personal_emergency' | 'other'
    title: string
    subtitle: string
  }> = [
    {
      value: 'short_break',
      title: t('auth.logoutReason.shortBreak'),
      subtitle: t('auth.logoutReason.shortBreakHint'),
    },
    {
      value: 'leave',
      title: t('auth.logoutReason.leave'),
      subtitle: t('auth.logoutReason.leaveHint'),
    },
    {
      value: 'technical_issue',
      title: t('auth.logoutReason.technicalIssue'),
      subtitle: t('auth.logoutReason.technicalIssueHint'),
    },
    {
      value: 'personal_emergency',
      title: t('auth.logoutReason.personalEmergency'),
      subtitle: t('auth.logoutReason.personalEmergencyHint'),
    },
    {
      value: 'other',
      title: t('auth.logoutReason.other'),
      subtitle: t('auth.logoutReason.otherHint'),
    },
  ]

  return (
    <div className="max-w-xl mx-auto">
      <div className="rounded-3xl border border-border bg-bg-surface p-5 shadow-xl">
        <div className="flex items-center gap-4 mb-5">
          {profile.imageUrl ? (
            <img
              src={profile.imageUrl}
              alt=""
              className="w-20 h-20 rounded-full object-cover border border-border"
            />
          ) : (
            <div className="w-20 h-20 rounded-full bg-accent/15 text-accent flex items-center justify-center text-2xl font-bold">
              {profile.firstName.charAt(0)}
            </div>
          )}
          <div className="min-w-0">
            <h1 className="text-xl font-bold text-text truncate">
              {profile.firstName} {profile.lastName}
            </h1>
            <p className="text-sm text-text-secondary truncate">{profile.position}</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 text-sm">
          <ProfileRow label={t('auth.nationalCode')} value={profile.nationalCode} mono />
          <ProfileRow label={t('auth.firstName')} value={profile.firstName} />
          <ProfileRow label={t('auth.lastName')} value={profile.lastName} />
          <ProfileRow label={t('auth.position')} value={profile.position} />
          <ProfileRow label={t('auth.shiftHour')} value={profile.shiftHour} />
          <ProfileRow label={t('auth.startDateTime')} value={profile.startDateTime} />
          <ProfileRow label={t('auth.endDateTime')} value={profile.endDateTime} />
          <ProfileRow label={t('auth.selectedProvince')} value={selectedExtension?.province || ''} />
          <ProfileRow label={t('auth.selectedExtension')} value={selectedExtension?.extension || ''} mono />
        </div>

        <div className="mt-5 flex justify-end">
          <button
            type="button"
            onClick={() => setShowLogoutModal(true)}
            className="btn-secondary text-sm py-2 px-4 hover:text-error"
          >
            {t('auth.logout')}
          </button>
        </div>
      </div>

      {showLogoutModal && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center backdrop-blur-sm p-4"
          style={{ backgroundColor: 'var(--overlay-backdrop)' }}
          onClick={() => setShowLogoutModal(false)}
        >
          <div
            className="w-full max-w-[32rem] max-h-[88vh] rounded-3xl border border-border bg-bg-surface p-4 shadow-elevated flex flex-col overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-4 mb-3 flex-shrink-0">
              <div>
                <h2 className="text-lg font-bold text-text">{t('auth.logoutModal.title')}</h2>
                <p className="text-sm text-text-secondary mt-1.5 max-w-[24rem]">
                  {t('auth.logoutModal.subtitle')}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="w-8 h-8 rounded-lg hover-overlay text-text-muted flex items-center justify-center"
                aria-label={t('auth.logoutModal.close')}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="M18 6 6 18M6 6l12 12" />
                </svg>
              </button>
            </div>

            <div className="space-y-4 flex-1 overflow-y-auto pe-1">
              <section>
                <h3 className="text-base font-semibold text-text mb-2">{t('auth.logoutModal.reasonTitle')}</h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {logoutReasonOptions.map((option) => (
                    <label
                      key={option.value}
                      className={`flex items-start gap-2.5 cursor-pointer rounded-2xl border p-2.5 transition-colors ${
                        logoutReason === option.value
                          ? 'border-primary bg-primary/5'
                          : 'border-border bg-bg'
                      }`}
                    >
                      <input
                        type="radio"
                        name="logout-reason"
                        value={option.value}
                        checked={logoutReason === option.value}
                        onChange={() => setLogoutReason(option.value)}
                        className="mt-1 accent-primary"
                      />
                      <div>
                        <div className="text-sm font-semibold text-text leading-tight">{option.title}</div>
                        <div className="text-xs text-text-secondary mt-0.5">{option.subtitle}</div>
                      </div>
                    </label>
                  ))}
                </div>
                {!logoutReason && (
                  <div className="mt-3 inline-flex rounded-lg border border-warning/40 bg-warning/10 px-3 py-1.5 text-xs text-warning">
                    {t('auth.logoutModal.reasonRequired')}
                  </div>
                )}
              </section>

              <section>
                <h3 className="text-base font-semibold text-text mb-2">{t('auth.logoutModal.notesTitle')}</h3>
                <textarea
                  value={logoutNotes}
                  onChange={(e) => setLogoutNotes(e.target.value)}
                  className="input-field h-20 resize-none text-sm"
                  placeholder={t('auth.logoutModal.notesPlaceholder')}
                />
              </section>

              <section>
                <h3 className="text-base font-semibold text-text mb-2">{t('auth.logoutModal.notifyTitle')}</h3>
                <div className="space-y-2">
                  <label className="flex items-start gap-3 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={sendSms}
                      onChange={(e) => setSendSms(e.target.checked)}
                      className="mt-1 accent-primary"
                    />
                    <div>
                      <div className="text-sm font-semibold text-text">{t('auth.logoutModal.sendSms')}</div>
                      <div className="text-xs text-text-secondary mt-0.5">{t('auth.logoutModal.sendSmsHint')}</div>
                    </div>
                  </label>
                  <label className="flex items-start gap-3 cursor-pointer rounded-2xl border border-border bg-bg p-2.5">
                    <input
                      type="checkbox"
                      checked={sendDefinedSms}
                      onChange={(e) => setSendDefinedSms(e.target.checked)}
                      className="mt-1 accent-primary"
                    />
                    <div className="text-sm text-text">
                      {t('auth.logoutModal.sendDefinedSms')}
                    </div>
                  </label>
                </div>
              </section>
            </div>

            <div className="mt-4 pt-3 border-t border-border flex justify-end gap-3 flex-shrink-0">
              <button
                type="button"
                onClick={() => setShowLogoutModal(false)}
                className="btn-secondary text-sm py-2 px-4"
              >
                {t('contactForm.cancel')}
              </button>
              <button
                type="button"
                onClick={handleConfirmLogout}
                className="btn-danger text-sm py-2 px-4"
              >
                {t('auth.logout')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

function ProfileRow({
  label,
  value,
  mono = false,
}: {
  label: string
  value: string
  mono?: boolean
}) {
  return (
    <div className="rounded-2xl border border-border bg-bg p-3">
      <div className="text-xs text-text-muted mb-1">{label}</div>
      <div className={`text-text ${mono ? 'font-mono' : ''}`}>{value || '—'}</div>
    </div>
  )
}
