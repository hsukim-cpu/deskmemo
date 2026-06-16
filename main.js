const { app, BrowserWindow, Tray, Menu, ipcMain, powerMonitor, shell, nativeImage, screen } = require('electron')
const fs = require('fs')
const path = require('path')

const SELFTEST = process.argv.includes('--selftest')

// 只允許開一份；重複開啟時把既有便利貼帶到最前面
if (!SELFTEST && !app.requestSingleInstanceLock()) {
  app.exit(0)
}
app.on('second-instance', () => {
  // 一張都沒有時（全被刪光），再開程式就直接生一張新的
  if (noteWindows.size === 0) { addNote(); return }
  noteWindows.forEach(w => { w.show(); w.focus() })
})
const NOTE_W = 284
const NOTE_H = 268
const MARGIN = 12          // 紙外的透明邊（落影用）
const BAR_H = 34 + MARGIN * 2

let notes = []                  // { id, content, x, y, width, height, collapsed }
let deleted = []                // 最近刪除的便利貼（保險用，最多留 50 筆）
let settings = { dailyReminder: '18:00', lastDailyFired: null, autoLaunch: true }  // 下班鬧鈴；autoLaunch=想要開機自啟（預設開）
let dailySnoozeUntil = 0
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
    settings = Object.assign(settings, data.settings || {})
  } catch { notes = []; deleted = [] }
}

function saveNotes() {
  if (SELFTEST) return
  try {
    fs.writeFileSync(dataFile(), JSON.stringify({ notes, deleted: deleted.slice(0, 50), settings }, null, 2))
  } catch (e) { console.error('save failed', e) }
}

// 開機自啟自我修復：每次啟動對照「想要的狀態(settings.autoLaunch)」和「實際登錄檔」，
// 不一致就補設。這樣即使某次被防毒/SAC/清理工具擋掉或刪掉，下次開程式就會自動修回來。
// 舊版用一次性旗標(autoLaunchSet)設過就不管，被擋一次就永久失效——這裡換掉。
function syncAutoLaunch() {
  if (process.defaultApp) return  // 開發模式(electron .)不要去動真正的 Run 登錄檔
  try {
    const want = settings.autoLaunch !== false
    if (app.getLoginItemSettings().openAtLogin !== want) {
      app.setLoginItemSettings({ openAtLogin: want, path: process.execPath })
    }
  } catch (e) { console.error('autolaunch sync failed', e) }
}

const newId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6)
// 鬧鐘排在「未來某一天」（非今天）→ 今天先別當待辦、別提醒；等那天鬧鐘響過自然恢復。
// 只比日期：設今天稍晚（如今天 18:00）仍算今天待辦照提醒；設明天以後才今天不吵。
const isFutureDay = iso => {
  if (!iso) return false
  const a = new Date(iso); if (isNaN(a)) return false
  const now = new Date()
  const day = d => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return day(a) > day(now)
}
// 列表：有沒打勾的項目才算未處理；手寫：有筆跡就算；空白/橫線：有字就算
// 週記/月記/單字卡是「常駐筆記本」，不算待辦、不觸發關機警示
const notePending = n => {
  if (n.mode === 'week' || n.mode === 'month' || n.mode === 'cards') return false
  if (isFutureDay(n.alarm)) return false  // 整張便利貼排到未來某天 → 今天不提醒
  if (n.mode === 'todo') return (n.items || []).some(i => i.text && i.text.trim() && !i.done && !isFutureDay(i.alarm))
  if (n.mode === 'draw') return !!n.drawing
  return !!(n.content && n.content.trim())
}
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
    transparent: true,
    resizable: true,
    skipTaskbar: true,
    alwaysOnTop: true,
    minWidth: 248,
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
    width: 504, height: 324,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true,
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
  note.contentHtml = payload.contentHtml
  note.mode = payload.mode
  note.items = payload.items
  note.color = payload.color
  note.drawing = payload.drawing
  note.fontSize = payload.fontSize
  note.italic = payload.italic
  note.font = payload.font
  note.images = payload.images
  note.alarm = payload.alarm
  note.weekAlarms = payload.weekAlarms
  note.week = payload.week
  note.month = payload.month
  note.cards = payload.cards
  note.cardIndex = payload.cardIndex
  note.toolsOpen = payload.toolsOpen
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

let resizeSaveT
ipcMain.on('resize-note', (e, id, w, h) => {
  const note = notes.find(n => n.id === id)
  const win = noteWindows.get(id)
  if (!note || !win || note.collapsed) return
  const b = win.getBounds()
  const nw = Math.max(248, Math.round(w))
  const nh = Math.max(150, Math.round(h))
  win.setBounds({ x: b.x, y: b.y, width: nw, height: nh })
  note.width = nw; note.height = nh
  clearTimeout(resizeSaveT); resizeSaveT = setTimeout(saveNotes, 400)
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

// ---------- 鬧鈴 ----------
const noteExcerpt = (n) => {
  if (n.mode === 'todo') {
    const it = (n.items || []).find(i => i.text && i.text.trim() && !i.done)
    if (it) return it.text
  }
  if (n.content && n.content.trim()) return n.content.trim().split('\n')[0]
  if (n.mode === 'draw' && n.drawing) return '手寫便條'
  return '便利貼提醒'
}

function showAlarm(id, text, key) {
  const w = new BrowserWindow({
    width: 464, height: 304,
    frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true,
    webPreferences: { nodeIntegration: true, contextIsolation: false }
  })
  w.setAlwaysOnTop(true, 'screen-saver')
  w.center()
  w.loadFile('alarm.html', { query: { id, text, key: key || 'note' } })
  return w
}

// 鬧鈴掛在哪就報哪：整張紙 / 列表某項 / 週記某天 / 月記某天
function checkAlarms() {
  const now = Date.now()
  let changed = false
  const fire = (n, key, label) => {
    changed = true
    const win = noteWindows.get(n.id)
    if (win) { win.show(); win.webContents.send('note-refreshed', n) }
    shell.beep()
    showAlarm(n.id, label, key)
  }
  for (const n of notes) {
    if (n.alarm && Date.parse(n.alarm) <= now) {
      n.alarm = null
      fire(n, 'note', noteExcerpt(n))
    }
    ;(n.items || []).forEach((it, i) => {
      if (it.alarm && Date.parse(it.alarm) <= now) {
        delete it.alarm
        fire(n, `item:${i}`, it.text || '清單項目')
      }
    })
    const WD = { mon: '週一', tue: '週二', wed: '週三', thu: '週四', fri: '週五', sat: '週六', sun: '週日' }
    for (const key of Object.keys(n.weekAlarms || {})) {
      if (Date.parse(n.weekAlarms[key]) <= now) {
        delete n.weekAlarms[key]
        const txt = ((n.week || {})[key] || '').split('\n')[0]
        fire(n, `week:${key}`, `${WD[key] || key}${txt ? '：' + txt : ''}`)
      }
    }
    const ma = n.month && n.month.alarms
    if (ma) {
      for (const ym of Object.keys(ma)) {
        for (const day of Object.keys(ma[ym])) {
          if (Date.parse(ma[ym][day]) <= now) {
            delete ma[ym][day]
            const txt = ((n.month.entries || {})[ym] || {})[day] || ''
            const m = ym.split('-')[1]
            fire(n, `month:${ym}:${day}`, `${Number(m)}/${day}${txt ? '：' + txt : ''}`)
          }
        }
      }
    }
  }
  if (changed) saveNotes()
}

ipcMain.on('alarm-snooze', (e, id, key) => {
  if (key === 'daily') { dailySnoozeUntil = Date.now() + 10 * 60 * 1000; return }
  const note = notes.find(n => n.id === id)
  if (!note) return
  const t = new Date(Date.now() + 10 * 60 * 1000).toISOString()
  if (!key || key === 'note') note.alarm = t
  else if (key.startsWith('item:')) {
    const i = +key.slice(5)
    if (note.items && note.items[i]) note.items[i].alarm = t
    else note.alarm = t
  } else if (key.startsWith('week:')) {
    note.weekAlarms = note.weekAlarms || {}
    note.weekAlarms[key.slice(5)] = t
  } else if (key.startsWith('month:')) {
    const [, ym, day] = key.split(':')
    note.month = note.month || { ym, entries: {} }
    note.month.alarms = note.month.alarms || {}
    ;(note.month.alarms[ym] = note.month.alarms[ym] || {})[day] = t
  }
  saveNotes()
  const win = noteWindows.get(id)
  if (win) win.webContents.send('note-refreshed', note)
})

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
  // 鎖定螢幕（通常是離開座位的前一刻）：先嗶聲，解鎖時跳警示
  powerMonitor.on('lock-screen', () => {
    if (hasPending()) { shell.beep(); warnAfterResume = true }
  })
  powerMonitor.on('unlock-screen', () => {
    if (warnAfterResume) {
      warnAfterResume = false
      setTimeout(() => showWarning('resume'), 1200)
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

// 下班鬧鈴：固定時間還有未完成事項就響（每天最多一次，可貪睡 10 分）
function checkDailyReminder() {
  if (!settings.dailyReminder) return
  const now = new Date()
  const today = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`
  const hhmm = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
  const snoozeDue = dailySnoozeUntil && Date.now() >= dailySnoozeUntil
  const timeDue = hhmm === settings.dailyReminder && settings.lastDailyFired !== today
  if (!timeDue && !snoozeDue) return
  dailySnoozeUntil = 0
  if (!hasPending()) { settings.lastDailyFired = today; saveNotes(); return }
  settings.lastDailyFired = today
  saveNotes()
  shell.beep()
  const first = notes.find(notePending)
  showAlarm(first ? first.id : '', `今天還有 ${pendingCount()} 件沒完成`, 'daily')
}

// ---------- 新版提醒 ----------
// 沒有付費簽章做不了真自動更新（macOS 的 Squirrel 要求正式簽章），
// 改成定期看 GitHub 最新版號，有新版就跳紙條請使用者自己下載安裝
const REPO = 'hsukim-cpu/deskmemo'
let updateWin = null
let updateDismissed = ''   // 按過「之後再說」的版號，這次開機內不再吵；重開程式會再提醒

function updateDownloadUrl() {
  const base = `https://github.com/${REPO}/releases/latest/download/`
  if (process.platform === 'darwin') return base + (process.arch === 'arm64' ? 'DeskMemo-arm64.dmg' : 'DeskMemo-x64.dmg')
  return base + 'DeskMemo-Setup.exe'
}

function isNewerVersion(tag, current) {
  const num = v => String(v).replace(/^v/, '').split('.').map(n => parseInt(n, 10) || 0)
  const a = num(tag), b = num(current)
  for (let i = 0; i < 3; i++) if (a[i] !== b[i]) return a[i] > b[i]
  return false
}

async function checkUpdate() {
  try {
    const res = await fetch(`https://api.github.com/repos/${REPO}/releases/latest`, {
      headers: { 'User-Agent': 'DeskMemo', Accept: 'application/vnd.github+json' }
    })
    if (!res.ok) return
    const tag = (await res.json()).tag_name
    if (!tag || !isNewerVersion(tag, app.getVersion())) return
    if (tag === updateDismissed) return
    if (updateWin && !updateWin.isDestroyed()) return
    updateWin = new BrowserWindow({
      width: 464, height: 304,
      frame: false, transparent: true, resizable: false, skipTaskbar: true, alwaysOnTop: true,
      webPreferences: { nodeIntegration: true, contextIsolation: false }
    })
    updateWin.center()
    updateWin.loadFile('update.html', { query: { ver: tag, url: updateDownloadUrl() } })
    updateWin.on('closed', () => { updateDismissed = tag; updateWin = null })
  } catch {} // 沒網路、API 失敗都安靜跳過，下次再查
}

ipcMain.on('update-download', (e, url) => {
  if (typeof url === 'string' && url.startsWith(`https://github.com/${REPO}/`)) shell.openExternal(url)
})

// 關掉程式（含 Windows 關機時系統要求程式結束）也攔
app.on('before-quit', (e) => {
  if (allowQuit || !hasPending()) return
  e.preventDefault()
  shell.beep()
  showWarning('shutdown')
})

// 便利貼全收掉也不退出，靠系統列圖示活著
app.on('window-all-closed', () => {})

function buildTrayMenu() {
  const dailyOpt = (label, value) => ({
    label, type: 'radio', checked: settings.dailyReminder === value,
    click: () => { settings.dailyReminder = value; saveNotes(); buildTrayMenu() }
  })
  tray.setContextMenu(Menu.buildFromTemplate([
    { label: '新增便利貼', click: () => addNote() },
    {
      label: '顯示全部', click: () => {
        if (!noteWindows.size && notes.length) notes.forEach(createNoteWindow)
        if (!noteWindows.size) { addNote(); return }
        noteWindows.forEach(w => { w.show(); w.focus() })
      }
    },
    { type: 'separator' },
    {
      label: '下班提醒',
      submenu: [
        dailyOpt('關閉', null),
        dailyOpt('17:00', '17:00'),
        dailyOpt('17:30', '17:30'),
        dailyOpt('18:00', '18:00'),
        dailyOpt('18:30', '18:30'),
        dailyOpt('19:00', '19:00'),
        dailyOpt('20:00', '20:00')
      ]
    },
    {
      label: '開機自動啟動', type: 'checkbox',
      checked: app.getLoginItemSettings().openAtLogin,
      click: (item) => { settings.autoLaunch = item.checked; saveNotes(); syncAutoLaunch() }
    },
    { type: 'separator' },
    { label: '結束', click: () => app.quit() }
  ]))
}

function setupTray() {
  const icon = nativeImage.createFromPath(path.join(__dirname, 'assets', 'icon-32.png'))
  tray = new Tray(icon)
  tray.setToolTip('桌面便利貼')
  buildTrayMenu()
}

const sleep = (ms) => new Promise(r => setTimeout(r, ms))

async function selftest() {
  notes = [
    { id: 'demo8', mode: 'ruled', content: '', width: 287, height: 353 },
    { id: 'demo0', mode: 'todo', color: 'white', content: '', items: [], height: 320 },
    {
      id: 'demo1', mode: 'ruled', color: 'yellow', height: 380, width: 300,
      content: '10:00 跟廠商對帳\n回覆客人尺寸問題\n下午寄出 #4384',
      contentHtml: '10:00 跟廠商對帳<br>回覆<b>客人尺寸</b>問題<br><span style="background-color:#FFE873">下午寄出 #4384</span>',
      alarm: new Date(Date.now() + 86400000).toISOString()
    },
    {
      id: 'demo2', mode: 'todo', color: 'pink', content: '',
      items: [
        { text: '回覆客人尺寸問題', done: true },
        { text: '下午寄出 #4384', done: false, alarm: new Date(Date.now() + 86400000).toISOString() },
        { text: '訂貨清單給齊', done: false }
      ]
    },
    { id: 'demo3', mode: 'draw', color: 'gray', content: '' },
    {
      id: 'demo4', mode: 'week', color: 'kraft', content: '', height: 420, width: 300,
      week: { month: '六月第二週', mon: '對帳、出貨 #4384', tue: '新品上架', wed: '', thu: '訂貨清單給齊', fri: '週報', sat: '', sun: '' },
      weekAlarms: { mon: new Date(Date.now() + 86400000).toISOString() }
    },
    {
      id: 'demo5', mode: 'month', color: 'ivory', content: '', height: 400, width: 340,
      month: { ym: '2026-06', entries: { '2026-06': { 8: '新品 9 折', 11: '便利貼 app', 15: '對帳' } }, alarms: { '2026-06': { 15: new Date(Date.now() + 86400000).toISOString() } } }
    },
    {
      id: 'demo6', mode: 'cards', color: 'white', content: '', height: 340, width: 250,
      cards: [{ front: 'soutenir', back: '支持、支撐' }, { front: '', back: '' }]
    }
  ]
  notes.forEach((n, i) => { const p = defaultPosition(i); n.x = p.x - i * 300; n.y = p.y })
  notes.forEach(createNoteWindow)
  await sleep(1800)
  const probe = await noteWindows.get('demo1').webContents.executeJavaScript(
    "const t=document.getElementById('text'); getComputedStyle(t).paddingLeft + ' || ' + getComputedStyle(t).backgroundImage.slice(0,150)")
  console.log('PROBE:', probe)
  const probe8 = await noteWindows.get('demo8').webContents.executeJavaScript("document.getElementById('text') ? getComputedStyle(document.getElementById('text')).backgroundImage.slice(0,60) : 'NO TEXT EL'").catch(e => 'JS ERROR: ' + e.message)
  console.log('PROBE8:', probe8)
  const img8 = await noteWindows.get('demo8').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'kim-repro-preview.png'), img8.toPNG())
  const img0 = await noteWindows.get('demo0').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'todo-empty-preview.png'), img0.toPNG())
  const img1 = await noteWindows.get('demo1').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'note-preview.png'), img1.toPNG())
  const img2 = await noteWindows.get('demo2').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'todo-preview.png'), img2.toPNG())
  const img3 = await noteWindows.get('demo3').webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'draw-preview.png'), img3.toPNG())
  for (const [demoId, file] of [['demo4', 'week-preview.png'], ['demo5', 'month-preview.png'], ['demo6', 'cards-preview.png']]) {
    const img = await noteWindows.get(demoId).webContents.capturePage()
    fs.writeFileSync(path.join(__dirname, file), img.toPNG())
  }
  const w = showWarning('shutdown')
  await sleep(1500)
  const img4 = await w.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'warning-preview.png'), img4.toPNG())
  w.close()
  const aw = showAlarm('demo1', '下午寄出 #4384')
  await sleep(1200)
  const img5 = await aw.webContents.capturePage()
  fs.writeFileSync(path.join(__dirname, 'alarm-preview.png'), img5.toPNG())
  app.exit(0)
}

app.whenReady().then(() => {
  if (SELFTEST) { selftest(); return }
  loadNotes()
  // 開機自啟：每次啟動都自我修復（對照想要的狀態補回登錄檔），被擋一次也不會永久失效。
  syncAutoLaunch()
  setupTray()
  setupPowerWatch()
  if (notes.length) notes.forEach(createNoteWindow)
  else addNote()
  // 鬧鈴排程：開機 5 秒後先補查一次（程式關著時錯過的也會響），之後每 20 秒查一次
  setTimeout(checkAlarms, 5000)
  setInterval(checkAlarms, 20000)
  setInterval(checkDailyReminder, 20000)
  // 新版提醒：開機 30 秒後查一次，之後每 4 小時查一次
  setTimeout(checkUpdate, 30000)
  setInterval(checkUpdate, 4 * 60 * 60 * 1000)
})
