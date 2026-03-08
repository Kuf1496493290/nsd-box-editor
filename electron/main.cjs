const { app, BrowserWindow, shell } = require('electron')
const path = require('node:path')

async function createMainWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    minWidth: 960,
    minHeight: 640,
    autoHideMenuBar: true,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  })

  // Open external links in system browser rather than a new Electron window.
  win.webContents.setWindowOpenHandler(({ url }) => {
    void shell.openExternal(url).catch((error) => {
      console.error('Failed to open external URL:', error)
    })
    return { action: 'deny' }
  })

  const indexPath = path.join(__dirname, '..', 'dist', 'index.html')
  await win.loadFile(indexPath)
}

app.whenReady().then(async () => {
  await createMainWindow()

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      void createMainWindow().catch((error) => {
        console.error('Failed to recreate main window:', error)
      })
    }
  })
})

app.on('window-all-closed', () => {
  app.quit()
})