import { useState, useEffect } from 'react'
import { useCallStore } from '../../stores/callStore'
import { useI18n } from '../../lib/i18n'

export function AutoFillForm() {
  const { t } = useI18n()
  const calls = useCallStore((s) => s.calls)
  const latestCall = Array.from(calls.values()).sort((a, b) => b.startTime - a.startTime)[0]

  const [formData, setFormData] = useState({
    callerId: '',
    extension: '',
    callerName: '',
    timestamp: '',
    department: '',
    reason: '',
    notes: '',
    priority: 'normal',
    status: 'new',
  })

  useEffect(() => {
    if (latestCall) {
      setFormData((prev) => ({
        ...prev,
        callerId: latestCall.remoteNumber,
        callerName: latestCall.remoteName,
        extension: latestCall.localNumber,
        timestamp: new Date(latestCall.startTime).toISOString(),
      }))
    }
  }, [latestCall])

  const updateField = (key: string, value: string) => {
    setFormData((prev) => ({ ...prev, [key]: value }))
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    await window.api.api.sendWebhook('autofill_submit', formData as Record<string, unknown>)
  }

  return (
    <div className="flex flex-col h-full">
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-lg font-semibold text-text">{t('autofill.title')}</h1>
        {latestCall && (
          <span className="text-xs text-success font-mono bg-success/10 px-2 py-1 rounded-lg">
            {t('autofill.autoFilled')}
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4">
        <Section title={t('autofill.callInfo')}>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.callerId')}</label>
              <input
                type="text"
                value={formData.callerId}
                onChange={(e) => updateField('callerId', e.target.value)}
                className="input-field text-sm font-mono"
                placeholder={t('autofill.autoPlaceholder')}
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.extension')}</label>
              <input
                type="text"
                value={formData.extension}
                onChange={(e) => updateField('extension', e.target.value)}
                className="input-field text-sm font-mono"
                placeholder={t('autofill.autoPlaceholder')}
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.callerName')}</label>
            <input
              type="text"
              value={formData.callerName}
              onChange={(e) => updateField('callerName', e.target.value)}
              className="input-field text-sm"
              placeholder={t('autofill.autoPlaceholder')}
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.timestamp')}</label>
            <input
              type="text"
              value={formData.timestamp ? new Date(formData.timestamp).toLocaleString() : ''}
              onChange={(e) => updateField('timestamp', e.target.value)}
              className="input-field text-sm font-mono"
              placeholder={t('autofill.autoPlaceholder')}
            />
          </div>
        </Section>

        <Section title={t('autofill.ticketDetails')}>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.department')}</label>
            <select
              value={formData.department}
              onChange={(e) => updateField('department', e.target.value)}
              className="input-field text-sm"
            >
              <option value="">{t('autofill.selectDepartment')}</option>
              <option value="sales">{t('autofill.dept.sales')}</option>
              <option value="support">{t('autofill.dept.support')}</option>
              <option value="billing">{t('autofill.dept.billing')}</option>
              <option value="technical">{t('autofill.dept.technical')}</option>
              <option value="hr">{t('autofill.dept.hr')}</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.reason')}</label>
            <select
              value={formData.reason}
              onChange={(e) => updateField('reason', e.target.value)}
              className="input-field text-sm"
            >
              <option value="">{t('autofill.selectReason')}</option>
              <option value="inquiry">{t('autofill.reason.inquiry')}</option>
              <option value="complaint">{t('autofill.reason.complaint')}</option>
              <option value="support">{t('autofill.reason.support')}</option>
              <option value="followup">{t('autofill.reason.followup')}</option>
              <option value="other">{t('autofill.reason.other')}</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.priority')}</label>
              <select
                value={formData.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                className="input-field text-sm"
              >
                <option value="low">{t('autofill.priority.low')}</option>
                <option value="normal">{t('autofill.priority.normal')}</option>
                <option value="high">{t('autofill.priority.high')}</option>
                <option value="urgent">{t('autofill.priority.urgent')}</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.status')}</label>
              <select
                value={formData.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="input-field text-sm"
              >
                <option value="new">{t('autofill.status.new')}</option>
                <option value="in-progress">{t('autofill.status.inProgress')}</option>
                <option value="resolved">{t('autofill.status.resolved')}</option>
                <option value="pending">{t('autofill.status.pending')}</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">{t('autofill.notes')}</label>
            <textarea
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="input-field text-sm h-24 resize-none"
              placeholder={t('autofill.notesPlaceholder')}
            />
          </div>
        </Section>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => window.history.back()} className="btn-ghost flex-1 text-sm">
            {t('autofill.cancel')}
          </button>
          <button type="submit" className="btn-primary flex-1 text-sm">
            {t('autofill.submit')}
          </button>
        </div>
      </form>
    </div>
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold text-text-secondary uppercase tracking-wider mb-3">{title}</h3>
      <div className="p-4 bg-bg-surface rounded-xl border border-border space-y-4">
        {children}
      </div>
    </div>
  )
}
