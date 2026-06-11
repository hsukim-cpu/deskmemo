# DeskMemo 桌面便條紙

給容易忘東忘西的人：便條紙釘在螢幕最上層，關機想落跑會被警示音擋下來。
Windows / Mac 通用。

## 下載安裝（不用懂程式）

直接點自己電腦對應的連結（永久有效，永遠指向最新版）：

| 你的電腦 | 下載 | 裝法 |
|---|---|---|
| Windows | [DeskMemo-Setup.exe](https://github.com/hsukim-cpu/deskmemo/releases/latest/download/DeskMemo-Setup.exe) | 點兩下安裝。跳出藍色「Windows 已保護你的電腦」時，按「其他資訊」→「仍要執行」（自製軟體沒買微軟簽章才會跳，不是病毒） |
| Mac（2020 年後、M 系列晶片） | [DeskMemo-arm64.dmg](https://github.com/hsukim-cpu/deskmemo/releases/latest/download/DeskMemo-arm64.dmg) | 打開 dmg、把 DeskMemo 拖進「應用程式」。第一次開啟若被擋：對 DeskMemo 按右鍵 →「打開」→ 再按「打開」 |
| Mac（舊款 Intel） | [DeskMemo-x64.dmg](https://github.com/hsukim-cpu/deskmemo/releases/latest/download/DeskMemo-x64.dmg) | 同上 |

## 怎麼用

1. 打開後螢幕右上角出現一張黃色便條紙（釘著紅色圖釘），直接打字，內容自動保存，重開機還在
2. 拖最上緣移動位置、拉邊框調大小
3. 滑鼠移上去會浮出工具：
   - 左上**樣式**：空白／橫線／清單（一項一項打勾劃掉）／**手寫**（用滑鼠直接寫畫，有筆／橡皮擦／清空）
   - 樣式下方**五個色點**：換底色（黃／粉／藍／綠／紫）
   - 右側**文字工具**：字型（黑體／楷體／明體）、A−／A＋ 調字大小、I 斜體
   - 右上 **鈴** 設鬧鈴提醒、**＋** 再開一張、**▴** 收合成細條、**×** 刪除這張
4. **鬧鈴**：按「鈴」選時間，時間到便條跳出來＋響鈴，可按「10 分鐘後再提醒」；程式關著錯過的提醒，下次開機會補響
5. **放圖片**：直接把圖片檔拖到便條上，或複製圖片後在便條上 Ctrl+V（Mac 是 Cmd+V），會變成拍立得小相紙釘在上面，滑過去按 × 可移除
6. **紅色圖釘**點一下＝拔起來（不再壓在所有視窗上面），再點＝釘回去
7. 系統列（Mac 是右上選單列）的 DeskMemo 圖示：新增便條紙、顯示全部、**開機自動啟動（建議勾起來）**、結束

## 警示行為

- **關機／關掉程式**：還有便條紙沒處理 → 三聲警示音＋跳警示視窗擋下，按「仍要離開」才放行
- **闔上筆電**：闔上瞬間嗶一聲；再打開螢幕立刻跳大字警示。（Windows/Mac 都不允許程式阻止睡眠，做不到「蓋不下去」，這是系統上限）
- 清單模式**打勾做完的項目不算未處理**；全部處理完＝安靜不打擾

## 平台行為差異

- Windows 關機時：系統會顯示「DeskMemo 正在阻止關機」畫面＋本程式警示
- macOS 關機時：程式攔下後跳警示；按「仍要離開」只會結束程式，要再按一次關機

## 給開發者

```
npm install
npm start                                  # 開發模式
npx electron . --selftest                  # 產三張預覽截圖後自動結束
npx electron-builder --win                 # 打包 Windows 安裝檔
powershell scripts/make_icon.ps1           # 重生圖示
```

Mac dmg 由 GitHub Actions 打包（`.github/workflows/build-mac.yml`，手動觸發、上傳到指定 release tag）。
刪除的便條紙會留在使用者資料夾 `notes.json` 的 `deleted` 區（最多 50 筆），誤刪可救。
