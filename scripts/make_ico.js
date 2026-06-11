// 把便條紙 PNG 合成多尺寸 icon.ico（給 exe 與 NSIS 安裝程式用）
const fs = require('fs')
const path = require('path')
const pngToIcoMod = require('png-to-ico')
const pngToIco = pngToIcoMod.default || pngToIcoMod

const root = path.join(__dirname, '..')
const srcs = ['assets/icon-16.png', 'assets/icon-32.png', 'assets/icon-256.png']
  .map(p => path.join(root, p))

pngToIco(srcs).then(buf => {
  fs.writeFileSync(path.join(root, 'assets', 'icon.ico'), buf)
  console.log('saved assets/icon.ico')
}).catch(e => { console.error(e); process.exit(1) })
