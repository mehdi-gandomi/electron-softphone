import { useState, useEffect } from 'react'
import { useCallStore } from '../../stores/callStore'

export function AutoFillForm() {
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
        <h1 className="text-lg font-semibold text-text">Call Form</h1>
        {latestCall && (
          <span className="text-xs text-success font-mono bg-success/10 px-2 py-1 rounded-lg">
            Auto-filled from call
          </span>
        )}
      </div>

      <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto space-y-4">
        {/* Auto-filled fields */}
        <Section title="Call Information">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Caller ID</label>
              <input
                type="text"
                value={formData.callerId}
                onChange={(e) => updateField('callerId', e.target.value)}
                className="input-field text-sm font-mono"
                placeholder="Auto-filled"
              />
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Extension</label>
              <input
                type="text"
                value={formData.extension}
                onChange={(e) => updateField('extension', e.target.value)}
                className="input-field text-sm font-mono"
                placeholder="Auto-filled"
              />
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Caller Name</label>
            <input
              type="text"
              value={formData.callerName}
              onChange={(e) => updateField('callerName', e.target.value)}
              className="input-field text-sm"
              placeholder="Auto-filled"
            />
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Timestamp</label>
            <input
              type="text"
              value={formData.timestamp ? new Date(formData.timestamp).toLocaleString() : ''}
              onChange={(e) => updateField('timestamp', e.target.value)}
              className="input-field text-sm font-mono"
              placeholder="Auto-filled"
            />
          </div>
        </Section>

        {/* Manual fields */}
        <Section title="Ticket Details">
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Department</label>
            <select
              value={formData.department}
              onChange={(e) => updateField('department', e.target.value)}
              className="input-field text-sm"
            >
              <option value="">Select department...</option>
              <option value="sales">Sales</option>
              <option value="support">Support</option>
              <option value="billing">Billing</option>
              <option value="technical">Technical</option>
              <option value="hr">Human Resources</option>
            </select>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Reason for Call</label>
            <select
              value={formData.reason}
              onChange={(e) => updateField('reason', e.target.value)}
              className="input-field text-sm"
            >
              <option value="">Select reason...</option>
              <option value="inquiry">General Inquiry</option>
              <option value="complaint">Complaint</option>
              <option value="support">Technical Support</option>
              <option value="followup">Follow-up</option>
              <option value="other">Other</option>
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Priority</label>
              <select
                value={formData.priority}
                onChange={(e) => updateField('priority', e.target.value)}
                className="input-field text-sm"
              >
                <option value="low">Low</option>
                <option value="normal">Normal</option>
                <option value="high">High</option>
                <option value="urgent">Urgent</option>
              </select>
            </div>
            <div>
              <label className="block text-xs text-text-secondary mb-1.5">Status</label>
              <select
                value={formData.status}
                onChange={(e) => updateField('status', e.target.value)}
                className="input-field text-sm"
              >
                <option value="new">New</option>
                <option value="in-progress">In Progress</option>
                <option value="resolved">Resolved</option>
                <option value="pending">Pending</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs text-text-secondary mb-1.5">Notes</label>
            <textarea
              value={formData.notes}
              onChange={(e) => updateField('notes', e.target.value)}
              className="input-field text-sm h-24 resize-none"
              placeholder="Additional notes about this call..."
            />
          </div>
        </Section>

        <div className="flex gap-3 pb-6">
          <button type="button" onClick={() => window.history.back()} className="btn-ghost flex-1 text-sm">
            Cancel
          </button>
          <button type="submit" className="btn-primary flex-1 text-sm">
            Submit Form
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
