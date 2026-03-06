# Project Overview

**Project:** SN-GENERATOR（序號產生器）
**Version:** 0.1.0
**Last Updated:** 2026-03-04
**Status:** 🟡 In Development

---

## 📌 Project Summary

SN-GENERATOR 是一個輕量級的**製造序號產生工具**，專為從出貨記錄總表快速生成標準化序號（SN）而設計。

使用者只需：
1. 載入 `出貨記錄總表.xlsx`（營邦出貨 sheet）
2. 輸入工單號查詢
3. 確認預覽後一鍵匯出含序號的 Excel

工具以**單一 HTML 檔案**形式運行，無需安裝任何軟體，在製造現場電腦直接點擊即可使用。

---

## 🎯 Goals & Non-Goals

### ✅ Goals（目標功能）
- 讀取出貨記錄總表（支援 `→` 更新欄位邏輯）
- 搜尋工單，自動帶入 DDC料號、品名、PN、QTY
- 依規則生成 SN（採單號碼 + 1 + 流水號）
- 生成 Datecode（D + 年後兩位 + ISO 週數）
- 輸出 4 欄 Excel（SN, Datecode, PN, QTY）
- 歷史記憶防止流水號重複（localStorage）
- 預覽窗格支援快速複製第一筆 SN / Datecode / PN

### ❌ Non-Goals（不在範圍內）
- 不提供多人協作 / 雲端同步
- 不做使用者帳號或權限管理
- 不直接寫入原始出貨記錄總表
- 不支援非 `.xlsx` 格式的來源檔案

---

## 👤 Target Users

| 使用者 | 使用情境 |
|--------|----------|
| 出貨作業人員 | 每日從出貨記錄總表查詢工單，生成貼標用序號 |
| 倉儲人員 | 列印序號標籤前確認 SN / PN / QTY 正確 |

---

## 🗺️ Feature List

### Phase 1 — MVP（核心功能）

| # | 功能 | 狀態 |
|---|------|------|
| F01 | 讀取表格按鈕（開啟 Excel 檔案） | ⬜ Todo |
| F02 | 解析「營邦出貨」sheet，套用 `→` 更新邏輯 | ⬜ Todo |
| F03 | 搜尋工單輸入框 + 查詢/刷新按鈕 | ⬜ Todo |
| F04 | 預覽窗格：DDC料號 + 品名置頂顯示 | ⬜ Todo |
| F05 | 預覽窗格：SN / Datecode / PN / QTY 帶入（可複製） | ⬜ Todo |
| F06 | SN 編碼生成（採單號碼 + 1 + 四位流水號） | ⬜ Todo |
| F07 | Datecode 生成（D + YY + ISO Week WW） | ⬜ Todo |
| F08 | PN 直接從表格讀取 | ⬜ Todo |
| F09 | 輸出 Excel（4欄：SN, Datecode, PN, QTY） | ⬜ Todo |
| F10 | localStorage 歷史記憶，防止流水號重複 | ⬜ Todo |

### Phase 2 — 加強功能（選配）

| # | 功能 | 狀態 |
|---|------|------|
| F11 | 歷史記憶匯出 / 匯入（JSON），支援換電腦 | ⬜ Backlog |
| F12 | 清除歷史記憶按鈕（附確認提示） | ⬜ Backlog |
| F13 | 顯示目前已用流水號（每個採單號碼） | ⬜ Backlog |

---

## 🔑 Business Rules

### SN 編碼規則
```
格式：{採單號碼} + "1" + {NNNN}

採單號碼：從出貨記錄總表直接讀取（e.g. 506-251014008）
插入碼：固定為 "1"
流水號：四位數，補零，從 0001 起（每個採單號碼獨立計算）

範例：
  採單號碼 506-251014008，第 1 筆 → 506-25101400810001
  採單號碼 506-251014008，第 2 筆 → 506-25101400810002
  採單號碼 506-250821002，第 1 筆 → 506-25082100210001
```

### Datecode 規則
```
格式：D + {年份後兩位} + {ISO週數，兩位補零}

範例：
  2026年第 4 週  → D2604
  2026年第 12 週 → D2612
```

### 欄位更新（`→`）規則
```
若讀取到的欄位值包含 "→"，取最後一個 "→" 之後的內容為有效值

範例：
  "BDB-PEG0050AA00 → BDB-PEG0050AA01"  →  有效值："BDB-PEG0050AA01"
  "10 → 12 → 15"                        →  有效值："15"
```

### 流水號防重複規則
```
同一採單號碼若已有歷史記錄，新一批序號必須接續上次最後一位
e.g. 歷史記錄 506-251014008 已到 0004，
     下次生成 QTY=3 → 0005, 0006, 0007
```

---

## 📁 File Structure

```
SN-GENERATOR/
├── index.html          # 唯一應用程式檔案（HTML + CSS + JS 全合一）
├── PROJECT.md          # 本文件（專案說明與功能清單）
├── ARCHITECTURE.md     # 技術架構與設計決策
├── BACKLOG.md          # 實作任務清單（TODO / In Progress / Done）
└── README.md           # 使用說明（給操作人員）
```

---

## ⚙️ Environment & Setup

```
執行環境：本機瀏覽器（Chrome / Edge 建議）
安裝需求：無（零安裝）
來源檔路徑：H:\TE\To Claire\出貨記錄總表.xlsx
Sheet 名稱：營邦出貨
網路需求：首次載入需網路（SheetJS CDN），之後可離線
```

---

## 🔗 Related Documents

| 文件 | 說明 |
|------|------|
| `ARCHITECTURE.md` | 技術架構、模組設計、資料流、設計決策 |
| `BACKLOG.md` | 實作任務拆解、優先順序、進度追蹤 |
| `README.md` | 操作說明（非工程師閱讀） |

---

## 📝 Change Log

| Version | Date | Summary |
|---------|------|---------|
| 0.1.0 | 2026-03-04 | 初版專案定義，功能範圍與業務規則確立 |

---

*Last updated: 2026-03-04*
