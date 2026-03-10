# Development Process

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.2.0
**Last Updated:** 2026-03-05

---

> **📌 Purpose:**
> 此文件定義每次與 AI Agent 協作開發時的**標準工作流程**。
> 每次開新對話前後都應依照此文件執行，確保開發品質與文件同步。
>
> **This file = HOW TO WORK（工作方式）**
> 技術設計請看 `ARCHITECTURE.md`，任務清單請看 `TASK.md`

---

## 🔄 Standard Session Flow（每次對話標準流程）

```
開新對話前
  └─ [ PRE-SESSION CHECKLIST ]
        ↓
與 AI 協作實作
  └─ [ DURING SESSION ]
        ↓
對話結束後
  └─ [ POST-SESSION CHECKLIST ]
        ↓
        └─ [ GIT COMMIT ]   ← 每完成一個改動就 commit 一次
        ↓
遇到問題時
  └─ [ DEBUG FLOW ]
```

---

## ✅ PRE-SESSION CHECKLIST（開新對話前）

每次開新對話，依序確認以下事項：

### 1. 確認本次目標
- [ ] 打開 `TASK.md`，確認目前要做哪個 Task（看 `🔄 In Progress` 或下一個 `⬜ Todo`）
- [ ] 確認該 Task 的 **Depends on** 是否已完成
- [ ] 本次只選 **1 個 Task**，不要一次做多個

### 2. 準備上傳文件
- [ ] `ARCHITECTURE.md` — 必帶，讓 AI 了解設計規範
- [ ] `TASK.md` — 必帶，讓 AI 知道目前要做什麼
- [ ] `index.html`（目前最新版）— 必帶（T01 除外，因為尚未建立）
- [ ] `DEBUG.md` — 若本次是修 Bug 則帶上

### 3. 準備指令
使用以下指令模板開始對話：

```
請根據 ARCHITECTURE.md 的設計規範，
幫我完成 TASK.md 中的 [Task ID]：[Task 標題]。

目前 index.html 如附件，請在既有內容上修改，不要刪除已完成的功能。

完成後請說明：
1. 修改了哪些地方
2. 如何測試驗收
```

---

## 🛠️ DURING SESSION（對話進行中）

### AI 回覆後，執行前先確認：
- [ ] AI 是否有理解正確的 Task 範圍（沒有做到其他 Task 的內容）
- [ ] 修改是否基於現有 `index.html`，而非重新產生整份檔案
- [ ] 程式碼有無明顯語法錯誤（檢查 `{}` 括號、函式是否關閉）

### 貼上程式碼後，立即測試：
- [ ] 開啟瀏覽器 → DevTools → Console（確認無紅色錯誤）
- [ ] 執行 Task 對應的 **Acceptance Criteria** 逐項驗收
- [ ] 若有問題，直接在**同一對話**內回報錯誤讓 AI 修正

### 同一對話內修正原則：
- 同一個 Bug 最多嘗試 **3 次** 修正
- 3 次仍未解決 → 結束對話，記錄到 `DEBUG.md`，下次開新對話專門處理

---

## 📋 POST-SESSION CHECKLIST（對話結束後）

每次對話結束、功能確認正常後，依序完成：

### 1. 更新 TASK.md
- [ ] 將完成的 Task 狀態改為 `✅ Done`
- [ ] 填入完成日期
- [ ] 更新 `Progress Summary` 表格數字
- [ ] 若有新發現的子任務，加入對應 Task 的 Sub-tasks

```markdown
<!-- 範例 -->
- [x] 建立「讀取表格」按鈕   ✅ 2026-03-05
```

### 2. 儲存最新 index.html
- [ ] 將 AI 產出的最新 `index.html` 存回本地資料夾（覆蓋舊版）
- [ ] 建議用日期備份一份：`index_20260305.html`（可選）

### 3. 更新 DEBUG.md（若有發現問題）
- [ ] 已解決的 Bug → 填入 Root Cause + Fix，狀態改 `✅ Resolved`
- [ ] 未解決的 Bug → 記錄症狀 + 已嘗試方法，狀態留 `🔴 Open`
- [ ] 新發現的 Known Limitation → 加入 `⚠️ Known Limitations` 表格

### 4. 快速備忘（可選）
- [ ] 在本文件底部的 `📝 Session Notes` 區記錄本次重要發現

### 5. Git Commit ✦ 必做
- [ ] 確認以上步驟（1~3）全部完成後才 commit
- [ ] 執行 git commit（格式見下方 **Git Commit Guidelines**）

---

## 🗂️ Git Commit Guidelines

> **原則：每完成一個 Task（或一個有意義的改動）就 commit 一次。**
> 不要累積多個 Task 才一次 commit，方便追蹤與回溯。

### Commit 時機
| 時機 | 說明 |
|------|------|
| ✅ Task 完成且 Acceptance Criteria 驗收通過 | 標準 commit |
| 🐛 Bug 修復完成 | 修 Bug commit |
| 📝 僅文件更新（.md 檔） | 文件 commit |
| 🔧 小幅調整（樣式、文字）但不影響功能 | 小修 commit |

### Commit Message 格式

```
<type>(<scope>): <短描述>

[選填：補充說明]
```

**type 對照表：**
| type | 使用時機 |
|------|----------|
| `feat` | 新增功能（完成一個 Task） |
| `fix` | 修復 Bug |
| `refactor` | 重構（不新增功能、不修 Bug） |
| `docs` | 僅更新文件（.md 檔） |
| `style` | 樣式調整，不影響邏輯 |
| `chore` | 雜項（更新 CDN 版本等） |

**scope 對照表：**
| scope | 說明 |
|-------|------|
| `yingbang` | 只影響營邦客戶功能 |
| `lonfly` | 只影響倫飛客戶功能 |
| `core` | 影響共用底層模組 |
| `ui` | 僅 UI / 樣式變更 |
| `docs` | 文件變更 |

### Commit Message 範例

```bash
# 完成一個 Task
git commit -m "feat(lonfly): 新增倫飛週流水號 SN 生成邏輯 (T14)"

# 修 Bug
git commit -m "fix(lonfly): 修正跨週流水號未重置問題"

# 重構
git commit -m "refactor(core): 多客戶 Tab 架構重構，遷移營邦至 CUSTOMERS CONFIG (T11)"

# 文件更新
git commit -m "docs: 更新 ARCHITECTURE.md 新增倫飛 Data Schema"

# 同時更新程式碼與文件（推薦：程式碼與文件一起 commit）
git commit -m "feat(lonfly): 雙 Sheet Excel 輸出 (T15)

- SN sheet：依 Q'ty 數量生成序號列
- box sheet：P/N / 加工WO# / 對應PCBA / 工單 / Model / 日期
- 日期格式 yyyy/mm/dd"
```

### 每次 Commit 包含的檔案
```bash
git add index.html          # 程式碼主檔（幾乎每次都要）
git add TASK.md             # 更新完成狀態後一起 commit
git add ARCHITECTURE.md     # 若本次有架構決策變更
git add DEBUG.md            # 若本次有 Bug 記錄更新
```

### 完整 Commit 指令流程
```bash
# 1. 確認目前變更
git status

# 2. 加入要 commit 的檔案
git add index.html TASK.md

# 3. Commit（帶清楚的 message）
git commit -m "feat(yingbang): 新增表格內容分頁與儲存格複製 (T08)"

# 4. 推送（若有遠端 repo）
git push
```

---

## 🐛 DEBUG FLOW（遇到問題時）

```
發現問題
  ↓
Step 1: 查 DEBUG.md → Common Error Messages 對照表
  ↓ 沒找到
Step 2: 查 DEBUG.md → Debugging Checklists（對應模組）
  ↓ 還是不確定
Step 3: 開新對話，上傳：
        ARCHITECTURE.md + DEBUG.md + index.html
        指令：「遇到以下問題，請幫我排查：[症狀描述] [console 錯誤]」
  ↓
Step 4: 找到原因後，更新 DEBUG.md（填入 Root Cause + Fix）
```

### Debug 對話指令模板：
```
我在 [模組名稱] 遇到問題，請幫我排查。

症狀：[描述看到的異常]

重現步驟：
1. ...
2. ...

Console 錯誤：
[貼上錯誤訊息]

目前 index.html 如附件。
請先說明你認為的 Root Cause，再提供修復方式。
```

---

## 📁 Session Context（每次對話的必帶文件速查）

| 情境 | 必帶文件 |
|------|----------|
| 實作新 Task（T02 以後） | `ARCHITECTURE.md` + `TASK.md` + `index.html` |
| 第一個 Task（T01） | `ARCHITECTURE.md` + `TASK.md` |
| 修 Bug | `ARCHITECTURE.md` + `DEBUG.md` + `index.html` |
| 新增功能（Phase 2） | `ARCHITECTURE.md` + `TASK.md` + `PROJECT.md` + `index.html` |
| 重構 / 大改 | 以上全部 |

---

## 📐 Code Quality Rules（AI 產出程式碼的驗收標準）

每次 AI 產出程式碼，確認以下規範：

- [ ] **不刪除已完成功能** — AI 修改只能新增或局部調整，不能重寫整個檔案結構
- [ ] **函式命名一致** — 與 `ARCHITECTURE.md` 中定義的函式名稱相同
- [ ] **CONFIG 物件集中** — 欄位 mapping、規則常數必須在頂部 `CONFIG`，不散落各處
- [ ] **中文錯誤提示** — 所有使用者看到的提示訊息使用中文
- [ ] **console.log 清理** — 上線版本不留 debug 用的 `console.log`（開發中可保留）
- [ ] **無硬編碼欄位名稱** — 欄位名稱只在 `CONFIG` 定義，函式內用變數引用

---

## 📝 Session Notes（開發紀錄）

> 每次對話結束後，可在此記錄重要發現、決策變更、或下次要注意的事項

---

### 2026-03-05 — 多客戶架構重構
- 更新 ARCHITECTURE.md 至 v0.2.0（多客戶 Tab + CUSTOMERS CONFIG + 倫飛）
- 更新 TASK.md 新增 Phase 2 T11~T16
- 新增 Git Commit Guidelines 至 PROCESS.md
- 下一步：開新對話執行 T11（多客戶骨架重構）

### 2026-03-04 — 專案初始化
- 完成 ARCHITECTURE.md、PROJECT.md、TASK.md、DEBUG.md、PROCESS.md
- 尚未開始實作 index.html
- 下一步：開新對話執行 T01

---

*Last updated: 2026-03-06*