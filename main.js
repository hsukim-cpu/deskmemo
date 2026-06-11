const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, shell, nativeImage, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const SELFTEST = process.argv.includes('--selftest')

// 只允許開一份；重複開啟時把既有便利貼帶到最前面
if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.exit(0)
}
app.on('second-instance', () => {
  noteWindows.forEach(w => { w.show(); w.focus() })
})
const NOTE_W = 260
const NOTE_H = 240
const BAR_H = 34

let notes = []                  // { id, content, x, y, width, height, collapsed }
let deleted = []                // 最近刪除的便利貼（保險用，最多留 50 筆）
const noteWindows = new Map()   // id -> BrowserWindow
let tray = null
let allowQuit = false
let warnAfterResume = false
let warningWin = null

const dataFile = () => path.join(app.getPath('userData'), 'notes.json')

function loadNotes() {
  try {
    const data = JSON.parse(fs.readFileSync(dataFile(), 'utf8'))
    notes = data.notes || []
    deleted = data.deleted || []
  } catch { notes = []; deleted = [] }
}

function saveNotes() {
  if (SELFTEST) return
  try {
    fs.writeFileSync(dataFile(), JSON.stringify({ notes, deleted: deleted.slice(0, 50) }, null, 2))
  } catch (e) { console.error('save failed', e) }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
// 清單模式：有沒打勾的項目才算未處理；其他模式：有字就算
const notePending = n => n.mode === 'todo'
  ? (n.items || []).some(i => i.text && i.text.trim() && !i.done)
  : !!(n.content && n.content.trim())
const hasPending = () => notes.some(notePending)
const pendingCount = () => notes.filter(notePending).length

function defaultPosition(index) {
  const wa = screen.getPrimaryDisplay().workArea
  return {
    x: wa.x + wa.width - NOTE_W - 24 - index * 24,
    y: wa.y + 24 + index * 24
  }
}

function createNoteWindow(note) {
  const win = new BrowserWindow({
    x: note.x, y: note.y,
    width: note.width || NOTE_W,
    height: note.collapsed ? BAR_H : (note.height || NOTE_H),
    frame: false,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    minWidth: 180,
    minHeight: BAR_H,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  win.setAlwaysOnTop(note.pinned !== false, 'floating')
  win.loadFile('note.html', { query: { id: note.id } })

  const remember = () => {
    const b = win.getBounds()
    note.x = b.x; note.y = b.y; note.width = b.width
    if (!note.collapsed) note.height = b.height
    saveNotes()
  }
  win.on('moved', remember)
  win.on('resized', remember)
  win.on('closed', () => noteWindows.delete(note.id))

  noteWindows.set(note.id, win)
  return win
}

function addNote(content = '') {
  const pos = defaultPosition(notes.length)
  const note = { id: newId(), content, x: pos.x, y: pos.y, collapsed: false }
  notes.push(note)
  saveNotes()
  createNoteWindow(note)
  return note
}

// kind: 'resume'（睡醒提醒）| 'shutdown'（關機/離開攔截）
function showWarning(kind) {
  if (!hasPending()) return null
  if (warningWin && !warningWin.isDestroyed()) { warningWin.focus(); return warningWin }
  warningWin = new BrowserWindow({
    width: 480, height: 300,
    frame: false, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  warningWin.setAlwaysOnTop(true, 'screen-saver')
  warningWin.center()
  warningWin.loadFile('warning.html', { query: { count: String(pendingCount()), kind } })
  warningWin.on('closed', () => { warningWin = null })
  return warningWin
}

// ---------- IPC ----------
ipcMain.on('get-note', (e, id) => {
  e.returnValue = notes.find(n => n.id === id) || {}
})

ipcMain.on('set-note', (e, id, payload) => {
  const note = notes.find(n => n.id === id)
  if (!note) return
  note.content = payload.content
  note.mode = payload.mode
  note.items = payload.items
  note.color = payload.color
  saveNotes()
})

ipcMain.on('toggle-pin', (e, id) => {
  const note = notes.find(n => n.id === id)
  const win = noteWindows.get(id)
  if (!note || !win) return
  note.pinned = note.pinned === false
  win.setAlwaysOnTop(note.pinned, 'floating')
  win.webContents.send('pinned', note.pinned)
  saveNotes()
})

ipcMain.on('toggle-collapse', (e, id) => {
  const note = notes.find(n => n.id === id)
  const win = noteWindows.get(id)
  if (!note || !win) return
  note.collapsed = !note.collapsed
  const b = win.getBounds()
  if (note.collapsed) {
    note.height = b.height
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: BAR_H })
  } else {
    win.setBounds({ x: b.x, y: b.y, width: b.width, height: note.height || NOTE_H })
  }
  win.webContents.send('collapsed', note.collapsed)
  saveNotes()
})

ipcMain.on('new-note', () => addNote())

ipcMain.on('delete-note', (e, id) => {
  const i = notes.findIndex(n => n.id === id)
  if (i === -1) return
  deleted.unshift({ ...notes[i], deletedAt: new Date().toISOString() })
  notes.splice(i, 1)
  saveNotes()
  const win = noteWindows.get(id)
  if (win) win.close()
})

ipcMain.on('force-quit', () => { allowQuit = true; app.quit() })

// ---------- 警示邏輯 ----------
function setupPowerWatch() {
  // 闔上筆電 / 睡眠：系統不給擋，闔上瞬間嗶一聲，醒來跳警示
  powerMonitor.on('suspend', () => {
    if (hasPending()) { shell.beep(); warnAfterResume = true }
  })
  powerMonitor.on('resume', () => {
    if (warnAfterResume) {
      warnAfterResume = false
      setTimeout(() => showWarning('resume'), 1500)
    }
  })
  // 關機（macOS / Linux 會收到這個事件，可短暫攔下）
  powerMonitor.on('shutdown', (e) => {
    if (!allowQuit && hasPending()) {
      e.preventDefault()
      shell.beep()
      showWarning('shutdown')
    }
  })
}

// 關掉程式（含 Windows 關機時系統要求程式結束）也攔
app.on('before-quit', (e) => {
  if (allowQuit || !hasPending()) return
  e.preventDefault()
  shell.beep()
  showWarning('shutdown')
})

// 便利貼全收掉也不退出，靠系統列圖示活著
app.on('window-all-closed', () => {})

function setupTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon-32.png'))
  tray = new Tray(icon)
  tray.setToolTip('桌面便利貼')
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '新增便利貼', click: () => addNote() },
    {
      label: '顯示全部', click: () => {
        if (!noteWindows.size && notes.length) notes.forEach(createNoteWindow)
        noteWindows.forEach(w => { w.show(); w.focus() })
      }
    },
    { type: 'separator' },
    {
      label: '開機自動啟動', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => app.setLoginItemSettings({ openAtLogin: item.checked })
    },
    { type: 'separator' },
    { label: '結束', click: () => app.quit() }
  ]))
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function selftest() {
  notes = [
    { id: 'demo1', mode: 'ruled', color: 'yellow', content: '10:00 跟廠商對帳\n回覆客人尺寸問題\n下午寄出 #4384' },
    {
      id: 'demo2', mode: 'todo', color: 'pink', content: '',
      items: [
        { text: '回覆客人尺寸問題', done: true },
        { text: '下午寄出 #4384', done: false },
        { text: '訂貨清單給齊', done: false }
      ]
    }
  ]
  notes.forEach((n, i) => { const p = defaultPosition(i); n.x = p.x - i * 300; n.y = p.y })
  notes.forEach(createNoteWindow)
  await sleep(1800)
  const img1 = await noteWindows.get('demo1').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'note-preview.png'), img1.toPNG())
  const img2 = await noteWindows.get('demo2').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'todo-preview.png'), img2.toPNG())
  const w = showWarning('shutdown')
  await sleep(1500)
  const img3 = await w.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'warning-preview.png'), img3.toPNG())
  app.exit(0)
}

app.whenReady().then(() => {
  if (SELFTEST) { selftest(); return }
  loadNotes()
  setupTray()
  setupPowerWatch()
  if (notes.length) notes.forEach(createNoteWindow)
  else addNote()
})
