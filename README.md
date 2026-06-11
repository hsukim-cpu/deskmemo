# DeskMemo 桌面便利貼

給容易忘東忘西的人：便利貼永遠貼在螢幕最上層，關機想落跑會被警示音擋下來。
Windows / Mac 通用。

## 下載安裝（不用懂程式）

到 [Releases 下載頁](https://github.com/hsukim-cpu/deskmemo/releases/latest)，挑自己電腦的那個檔：

| 你的電腦 | 下載檔案 | 裝法 |
|---|---|---|
| Windows | `DeskMemo-Setup-x.x.x.exe` | 點兩下安裝。跳出藍色「Windows 已保護你的電腦」時，按「其他資訊」→「仍要執行」（因為是自製軟體、沒買微軟簽章，不是病毒） |
| Mac（2020 年後、M 系列晶片） | `DeskMemo-x.x.x-arm64.dmg` | 打開 dmg、把 DeskMemo 拖進「應用程式」。第一次開啟若被擋：對 DeskMemo 按右鍵 →「打開」→ 再按「打開」 |
| Mac（舊款 Intel） | `DeskMemo-x.x.x.dmg` | 同上 |

## 怎麼用

1. 打開後螢幕右上角會出現一張米色便利貼，直接打字，內容自動保存
2. 拖標題列移動位置、拉邊框調大小
3. 標題列按鈕：**＋** 再開一張、**▴** 往上收合成細條（再按展開）、**×** 刪除這張
4. 右下角系統列（Mac 是右上角選單列）有 DeskMemo 小圖示：新增便利貼、顯示全部、**開機自動啟動（建議勾起來）**、結束

## 警示行為

- **關機／關掉程式**：還有便利貼沒處理 → 三聲警示音＋跳警示視窗擋下，按「仍要離開」才放行
- **闔上筆電**：闔上瞬間嗶一聲；再打開螢幕立刻跳大字警示。（Windows/Mac 都不允許程式阻止睡眠，所以做不到「蓋不下去」，這是系統上限）
- 沒有未處理的便利貼時，安靜不打擾

## 給開發者

```
npm install
npm start                      # 開發模式
npx electron . --selftest      # 產兩張預覽截圖後自動結束
npx electron-builder --win     # 打包 Windows 安裝檔
```

Mac dmg 由 GitHub Actions 打包（`.github/workflows/build-mac.yml`，手動觸發、上傳到指定 release tag）。
刪除的便利貼會留在使用者資料夾 `notes.json` 的 `deleted` 區（最多 50 筆），誤刪可救。
