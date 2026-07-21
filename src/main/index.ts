import { app, BrowserWindow, globalShortcut, ipcMain, session } from 'electron'
import path from 'path'
import { initIpc, stopSipEngine } from './ipc'
import { createTray, destroyTray, isAppQuitting } from './tray'
import { getSettings } from './store'
import { ensureDefaultRingtones } from './ringtone'

let mainWindow: BrowserWindow | null = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 720,
    minWidth: 380,
    minHeight: 600,
    frame: false,
    transparent: false,
    backgroundColor: '#0F0E17',
    titleBarStyle: 'hidden',
    webPreferences: {
      preload: path.join(__dirname, '../preload/index.js'),
      nodeIntegration: false,
      contextIsolation: true,
      sandbox: false,
    },
    icon: path.join(__dirname, '../../resources/icon.ico'),
    show: false,
  })

  // Allow microphone for softphone audio + notifications for incoming-call alerts
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback) => {
    if (permission === 'media' || permission === 'mediaKeySystem' || permission === 'notifications') {
      callback(true)
      return
    }
    callback(false)
  })

  // Dev or production
  if (process.env.ELECTRON_RENDERER_URL) {
    mainWindow.loadURL(process.env.ELECTRON_RENDERER_URL)
  } else {
    mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'))
  }

  mainWindow.once('ready-to-show', () => {
    mainWindow?.show()
  })

  // Initialize IPC
  initIpc(mainWindow)

  // Built-in ringtone WAVs under userData
  try {
    ensureDefaultRingtones()
  } catch {}

  // Create tray
  const settings = getSettings()
  if (settings.enableTray) {
    createTray(mainWindow)
  }

  // Minimize to tray on close — unless Quit was requested from the tray
  mainWindow.on('close', (e) => {
    if (isAppQuitting()) return
    if (settings.minimizeToTray && mainWindow && !mainWindow.isDestroyed()) {
      e.preventDefault()
      mainWindow.hide()
    }
  })

  mainWindow.on('closed', () => {
    mainWindow = null
  })

  // Window control IPC
  ipcMain.on('window:minimize', () => mainWindow?.minimize())
  ipcMain.on('window:maximize', () => {
    if (mainWindow?.isMaximized()) {
      mainWindow.unmaximize()
    } else {
      mainWindow?.maximize()
    }
  })
  ipcMain.on('window:close', () => mainWindow?.close())
  ipcMain.on('window:toggle-always-on-top', () => {
    if (mainWindow) {
      const isOnTop = mainWindow.isAlwaysOnTop()
      mainWindow.setAlwaysOnTop(!isOnTop)
    }
  })
}

app.whenReady().then(() => {
  // Keep softphone alive if a media packet fails — don't take down SIP registration
  process.on('uncaughtException', (err) => {
    console.error('Uncaught exception (kept alive):', err)
  })
  process.on('unhandledRejection', (err) => {
    console.error('Unhandled rejection (kept alive):', err)
  })

  createWindow()

  globalShortcut.register('F2', () => {
    mainWindow?.webContents.send('hotkey:answer')
  })
  globalShortcut.register('F4', () => {
    mainWindow?.webContents.send('hotkey:hangup')
  })

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow()
    }
  })
})

app.on('before-quit', () => {
  // Fire-and-forget unregister; do not block quit
  void stopSipEngine()
})

app.on('window-all-closed', () => {
  globalShortcut.unregisterAll()
  destroyTray()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('will-quit', () => {
  globalShortcut.unregisterAll()
  destroyTray()
})
