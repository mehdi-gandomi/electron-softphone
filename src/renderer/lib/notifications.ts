/**
 * Web Notifications for incoming calls.
 *
 * Pure-web fallback: shows a native OS-level notification when a call
 * arrives while the window is in the background.
 * // TODO: When wrapped in Electron/Tauri, replace this with ipcRenderer.send('focus-window')
 */

import logoUrl from '../assets/logo.png'

/** Call once on app load to request permission. */
export async function initNotifications(): Promise<void> {
  if (!('Notification' in window)) return
  if (Notification.permission === 'default') {
    try {
      await Notification.requestPermission()
    } catch {
      /* ignore */
    }
  }
}

interface IncomingCallInfo {
  remoteName?: string
  remoteNumber: string
}

let current: Notification | null = null

/** Fire an OS notification with the caller ID for an incoming call. */
export function notifyIncomingCall(call: IncomingCallInfo): Notification | null {
  if (!('Notification' in window) || Notification.permission !== 'granted') return null

  const title = 'تماس ورودی'
  const body = call.remoteName
    ? `${call.remoteName} — ${call.remoteNumber}`
    : call.remoteNumber

  try {
    // Close any previous call notification first
    current?.close()
    const n = new Notification(title, {
      body,
      icon: logoUrl,
      tag: 'incoming-call',
      requireInteraction: true,
      dir: 'rtl',
      lang: 'fa',
    })
    n.onclick = () => {
      // Best-effort web focus.
      // TODO: When wrapped in Electron/Tauri, replace this with ipcRenderer.send('focus-window')
      window.focus()
      n.close()
    }
    current = n
    return n
  } catch {
    return null
  }
}

/** Dismiss the incoming-call notification (call answered/rejected/ended). */
export function closeIncomingCallNotification(): void {
  current?.close()
  current = null
}
