import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'
import path from 'path'

let tray: Tray | null = null
let quitting = false

/** Dev: project resources/; packaged: process.resourcesPath */
export function getResourcePath(...segments: string[]): string {
  if (app.isPackaged) {
    return path.join(process.resourcesPath, ...segments)
  }
  return path.join(__dirname, '../../resources', ...segments)
}

export function isAppQuitting(): boolean {
  return quitting
}

export function requestQuit() {
  quitting = true
  destroyTray()
  app.quit()
}

function loadTrayIcon() {
  const logoPath = getResourcePath('logo.png')
  let image = nativeImage.createFromPath(logoPath)
  if (image.isEmpty()) {
    return nativeImage.createEmpty()
  }
  // Windows tray looks best at 16–32px
  const size = process.platform === 'win32' ? 16 : 22
  return image.resize({ width: size, height: size, quality: 'best' })
}

export function createTray(mainWindow: BrowserWindow): Tray {
  const icon = loadTrayIcon()

  tray = new Tray(icon)
  tray.setToolTip('امدادفون')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'نمایش امدادفون',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'خروج',
      click: () => {
        requestQuit()
      },
    },
  ])

  tray.setContextMenu(contextMenu)

  tray.on('double-click', () => {
    mainWindow.show()
    mainWindow.focus()
  })

  return tray
}

export function updateTrayTitle(title: string) {
  if (tray) {
    tray.setToolTip(title || 'امدادفون')
  }
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
