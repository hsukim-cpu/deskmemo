// electron-builder 的 signAndEditExecutable 在這台 Windows 會炸（winCodeSign 解壓失敗），
// 所以圖示改在打包後用 rcedit 自己嵌進 DeskMemo.exe
const path = require('path')
const fs = require('fs')

module.exports = async (context) => {
  if (context.electronPlatformName !== 'win32') return
  const { rcedit } = require('rcedit')
  const exe = path.join(context.appOutDir, 'DeskMemo.exe')
  // 注意：ico 放 assets/ 不放 build/ — build/icon.ico 會觸發 electron-builder
  // 去改解除安裝程式圖示，那步在 Windows 上會 spawn UNKNOWN 炸掉
  const ico = path.join(__dirname, '..', 'assets', 'icon.ico')
  if (!fs.existsSync(ico)) throw new Error('build/icon.ico 不存在，先跑 scripts/make_ico.js')
  await rcedit(exe, { icon: ico })
  console.log('  • afterPack: DeskMemo.exe icon -> build/icon.ico')
}
