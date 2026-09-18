# 現有來源規則表單

**Version:** 0.3.79
**Last Updated:** 2026-09-18

版本 0.3.73 將現有來源分成兩類。開啟「資料來源維護」並選擇來源即可查看。

| 來源 | 表單狀態 | 已載入內容／限制 |
| --- | --- | --- |
| 營邦 | 可編輯候選 | 多工作表、欄位選取、PO號碼→採單號碼別名；NA 值與部分分頁／表頭容錯可能和舊流程不同 |
| 倫飛 | 可編輯候選 | 欄位別名及標準化；舊流程額外移除符號，表頭未命中會回第1列 |
| 富弘年 | 可編輯候選 | 欄位選取、製令單號移除分隔符與補零；舊流程只對特定日期形狀補零 |
| 勤誠 | 可編輯候選 | 工作表包含匹配、逐檔回溯、全部欄位；舊流程另有跨儲存格拼字、符號清理與表頭回退 |
| 超恩 | Email 特殊規則 | EML／MSG 抽表、RE／FW 原信補齊及局部更新、多工單拆列、MAC 計算、FCST／BIOS 補值，不能由目前表單完整表達 |
| KOYA | KOYA 特殊規則 | 空白欄定位、八位工單／小數尾碼、逐檔跳過、月份與 Model／PN／PO 主檔補值，不能由目前表單完整表達 |
| 超恩 FCST、BIOS／FW、KOYA Model | 對照特殊規則 | 是專用處理器的輔助來源，不是獨立出貨匯入規則 |

四個可編輯來源預載候選參數，且「啟用欄位與處理規則」預設勾選。儲存後，下次更新會由共用規則處理該來源。取消勾選並儲存，或按「還原預設」，即可回到原專用處理器。

切換是逐來源的；未切換客戶繼續執行原處理器。已啟用的內建規則會存於 SQLite 並由更新工作的 `SHIPMENT_BUILTIN_RULE_SOURCES` 傳入，不需要手動設定 systemd 環境變數。錯誤的來源 key／名稱組合會被更新程式拒絕。

這次沒有把 Email 或 KOYA 特殊行為簡化成看似相同的通用規則。若要讓它們可編輯，需先為 RE 更新／郵件抽表或 KOYA 空白欄與主檔補值新增專用表單參數，再以真實檔案比較後切換。

赫星與 Cubepilot 使用另外的查詢／序號資料來源，沒有寫入出貨合併總表，因此不在這張匯入表單。MO／數量配對、指定型號禁用序號及各客戶序號演算法屬查詢／生成規則，也不應混入匯入規則表單。DEG 與其他自訂來源原本就使用此表單。

部署時同步 `source_presets.py`、來源 schema／service、`shipment_merge.py`、`sourceRulesEditor.js`、`app.js`、`index.html`、`shipment_check.py` 與 release 清單。Linux 正式機執行：

```bash
cd /opt/sn_generator
systemctl restart sn_generator
venv/bin/python backend/app/tools/shipment_check.py --check --manifest deploy/shipment-release.json
```
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
