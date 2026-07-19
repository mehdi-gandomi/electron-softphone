import { Tray, Menu, BrowserWindow, nativeImage, app } from 'electron'

let tray: Tray | null = null
let quitting = false

export function isAppQuitting(): boolean {
  return quitting
}

export function requestQuit() {
  quitting = true
  // Destroy tray first so Windows doesn't keep the process alive for the icon
  destroyTray()
  app.quit()
}

export function createTray(mainWindow: BrowserWindow): Tray {
  const icon = nativeImage.createEmpty()

  tray = new Tray(icon)
  tray.setToolTip('VoxPhone')

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Show VoxPhone',
      click: () => {
        mainWindow.show()
        mainWindow.focus()
      },
    },
    { type: 'separator' },
    {
      label: 'Quit',
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
    tray.setToolTip(title || 'VoxPhone')
  }
}

export function destroyTray() {
  if (tray) {
    tray.destroy()
    tray = null
  }
}
