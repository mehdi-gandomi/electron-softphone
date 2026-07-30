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
            onClick={onLogout}
            className="btn-secondary text-sm py-2 px-4 hover:text-error"
          >
            {t('auth.logout')}
          </button>
        </div>
      </div>
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
