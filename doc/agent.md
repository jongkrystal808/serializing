# Development Process Guide / 開發流程指南

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.3.39
**Last Updated:** 2026-09-09

---

> **📌 Purpose:**
> 此文件定義每次與 AI Agent 協作開發時的**標準工作流程**。
> 每次開新對話前後都應依照此文件執行，確保開發品質與文件同步。
>
> **This file = HOW TO WORK（工作方式）**
> 技術設計請看 `doc/architecture.md`，任務清單請看 `doc/task.md`

---

## 1. 🔄 Standard Session Flow（每次對話標準流程）

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

## 2. ✅ Pre-Session Checklist（開新對話前）

每次開新對話，依序確認以下事項：

### 1. 確認本次目標
- [ ] 打開 `doc/task.md`，確認目前要做哪個 Task
- [ ] 確認該 Task 的 **Depends on** 是否已完成
- [ ] 本次只選 **1 個 Task**，不要一次做多個

### 2. 準備上傳文件
- [ ] `doc/architecture.md` — 必帶，讓 AI 了解設計規範
- [ ] `doc/task.md` — 必帶，讓 AI 知道目前要做什麼
- [ ] 相關 Source files（如 `index.html`, `js/app.js`, `backend/app/main.py` 等）
- [ ] `doc/debug.md` — 若本次是修 Bug 則帶上

---

## 3. 🛠️ During Session（對話進行中）

### AI 回覆後，執行前先確認：
- [ ] AI 是否有理解正確的 Task 範圍（沒有做到其他 Task 的內容）
- [ ] 程式碼有無明顯語法錯誤

### 貼上程式碼後，立即測試：
- [ ] 執行 Task 對應的 **Acceptance Criteria** 逐項驗收
- [ ] 若有問題，直接在**同一對話**內回報錯誤讓 AI 修正

### 同一對話內修正原則：
- 同一個 Bug 最多嘗試 **3 次** 修正（3-strike bug fix rule）
- 3 次仍未解決 → 結束對話，記錄到 `doc/debug.md`，下次開新對話專門處理

---

## 4. 📋 Post-Session Checklist（對話結束後）

每次對話結束、功能確認正常後，依序完成：

### 1. 更新文件
- [ ] 更新 `doc/task.md`（完成日期、狀態、Progress Summary）
- [ ] 儲存所有修改的程式碼檔案

### 2. 更新 doc/debug.md（若有發現問題）
- [ ] 已解決的 Bug → 填入 Root Cause + Fix，狀態改 Resolved
- [ ] 未解決的 Bug → 記錄症狀 + 已嘗試方法

### 3. Git Commit ✦ 必做
- [ ] 確認以上步驟全部完成後才 commit
- [ ] 執行 git commit（格式見下方）

---

## 5. 🗂️ Git Commit Guidelines

### Commit 時機
- Task 完成且驗收通過
- Bug 修復完成
- 文件更新（.md 檔）
- 樣式或小幅調整

### Commit Message 格式

```
<type>(<scope>): <description>
```

**type 對照表：**
| type | 使用時機 |
|------|----------|
| `feat` | 新增功能 |
| `fix` | 修復 Bug |
| `refactor` | 重構 |
| `docs` | 文件更新 |
| `style` | 樣式調整 |
| `chore` | 雜項 |

**scope 對照表：**
| scope | 說明 |
|-------|------|
| `yingbang` | 營邦客戶功能 |
| `lunfei` | 倫飛客戶功能 |
| `bng` | 超恩客戶功能 |
| `chg` | KOYA客戶功能 |
| `hmg` | 赫星客戶功能 |
| `clg` | Cubepilot客戶功能 |
| `core` | 共用底層模組 |
| `ui` | UI / 樣式 |
| `docs` | 文件 |

---

## 6. 🐛 Debug Flow（遇到問題時）

```
Step 1: 查 doc/debug.md → Debugging Checklists
  ↓ 沒找到或無法解決
Step 2: 開新對話，帶上完整 context (doc/architecture.md, doc/debug.md, source files)
  ↓
Step 3: 找到原因後，更新 doc/debug.md
```

---

## 7. 📐 Code Quality Rules

- [ ] **不刪除已完成功能** — AI 修改只能新增或局部調整
- [ ] **函式命名一致**
- [ ] **CONFIG 集中** — 規則常數必須在頂部或獨立 config 檔
- [ ] **中文錯誤提示** — 使用者看到的提示訊息必須是中文
- [ ] **console.log 清理** — 上線版本不留 debug 用的 console.log
- [ ] **無硬編碼欄位名稱** — 應使用變數或配置引用
- [ ] **函式註解存在**
- [ ] **邏輯區塊註解存在**
- [ ] **序號派發具原子性** — 流水號讀取與遞增不得拆成兩次資料庫操作
- [ ] **CORS 明確列舉來源** — 啟用 credentials 時禁止萬用來源 `*`
- [ ] **不信任內容不可直接寫入 innerHTML** — localStorage、API 與使用者輸入需轉為純文字或先消毒
- [ ] **同步 I/O 不得放在 async handler** — Excel、SQLite、網路磁碟與同步匯出路由使用普通 `def` 交由 Thread Pool
- [ ] **大量重複節點使用事件委派** — 表格儲存格等動態集合不得逐一註冊相同 listener

---

## 8. 💬 Code Comment Rules

### 函式層級
每個函式開頭必須有，使用 `【用途】` prefix。
```javascript
// 【用途】依採單號碼與數量生成不重複的四位流水號清單
function getNextSerial(poNumber, count) { ... }
```

### 邏輯區塊層級
重要的判斷 / 迴圈 / 運算必須有。
```javascript
// 若欄位包含箭頭符號，取最後一段作為有效值
if (arrowPattern.test(text)) { ... }
```

### CONFIG 欄位層級
每個屬性加上說明。

### 不需註解的情況
一眼就懂的單行賦值、標準 DOM 操作。

---

## 9. 📁 Project File Structure Reference

所有專案說明文件皆放置於 `doc/` 目錄中：
- `doc/agent.md` - 開發流程指南
- `doc/architecture.md` - 系統架構與業務規則
- `doc/task.md` - 任務清單與進度
- `doc/debug.md` - 錯誤排查與已知問題
- `doc/update.md` - 更新紀錄

---

## 10. 📑 Session Context Quick Reference

| 情境 | 必帶文件 |
|------|----------|
| 實作新 Task | `doc/architecture.md` + `doc/task.md` + 相關源碼 |
| 修 Bug | `doc/architecture.md` + `doc/debug.md` + 相關源碼 |
| 重構 / 大改 | `doc/architecture.md` + `doc/task.md` + 所有相關源碼 |
