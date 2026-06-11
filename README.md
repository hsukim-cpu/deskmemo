# 桌面便利貼（DeskMemo）

跨平台（Windows / Mac 通用）的螢幕便利貼，給容易忘東忘西的人用。

## 功能

- 浮動便利貼永遠置頂在螢幕上，可拖曳、可調大小、可多張（＋）
- 「▴」收合成一條細長標題列（往上翻），再按展開
- 內容即時自動保存，重開電腦還在
- 系統列圖示：新增便利貼、顯示全部、開機自動啟動、結束
- **關機／關掉程式**：還有未處理的便利貼時，播警示音＋跳警示視窗擋下，按「仍要離開」才放行
- **闔上筆電（睡眠）**：闔上瞬間嗶一聲；打開螢幕後立刻跳大警示（系統不允許程式阻止睡眠，這是兩個平台共同的上限）
- 刪除的便利貼會留在 notes.json 的 deleted 區（最多 50 筆），誤刪可救

## 開發模式執行（目前狀態）

需要先裝 Node.js（https://nodejs.org，LTS 版即可）：

```
cd sticky-notes
npm install
npm start
```

## 測試模式

```
npx electron . --selftest
```

會產生 note-preview.png 與 warning-preview.png 兩張截圖後自動結束，不會動到正式資料。

## 還沒做（下一步）

- 打包成免裝 Node 的安裝檔：Windows 的 .exe 可在本機用 electron-builder 直接打包；
  Mac 的 .dmg 要在 Mac 上打包，或用 GitHub Actions 免費代打（推上 GitHub 後兩個平台一次出）
- macOS 第一次跑可能要在「系統設定 → 隱私權與安全性」允許

## 平台行為差異

- Windows 關機時：系統會顯示「DeskMemo 正在阻止關機」畫面＋本程式警示，本身就是一道警示
- macOS 關機時：程式攔下後跳警示；按「仍要離開」只會結束程式，要再按一次關機
