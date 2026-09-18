# 第 2 階段：自訂資料來源匯入規則

**Version:** 0.3.79
**Last Updated:** 2026-09-18

本文件記錄第 2 階段：規則先實作於自訂 Excel 來源，包括已保存的 DEG。現況另允許營邦、倫飛、富弘年、勤誠启用候選共用規則；未啟用及其他內建來源仍沿用專用處理器。未啟用規則的自訂來源仍以第一列為欄名、全部欄位匯入、最近 N 檔合併與全列去重。

## 操作

1. 開啟「資料來源維護」，選 DEG 或新增來源。
2. 勾選「啟用欄位與處理規則」。
3. 設定選檔策略、工作表與表頭。DEG 工作表目前為「生產排程 2026」；表頭列依實際 Excel 填寫，從 1 起算。
4. 「輸出欄位」選全部保留，或只輸出指定欄位。
5. 「新增欄位」填輸出欄名、原始／候選欄名（每列一個），必要時勾選必需欄位。上移／下移調整輸出順序。
6. 新增清理及過濾規則。欄名用改名後的名稱；規則依清單順序執行，可上移／下移／移除。
7. 保存；重新選取來源可確認設定已重載。下一次「更新資料」開始套用。

支援的清理：去前後空白、箭頭取最後新值、字面文字替換、移除指定字元、純數字整數的小數尾碼移除、數字左補零。

支援的過濾：排除全空列、指定欄空值、任一指定欄包含文字（可查全部欄）、只保留固定長度數字。可使用不打算輸出的備註欄過濾，最後才投影輸出欄位。

欄位全部保留模式也能使用欄位設定改名。候選按設定順序匹配；缺必需欄、重複欄名、改名撞名或規則引用不存在欄位時停止該來源，不自行猜測。

## 選檔策略與失敗

| 策略 | 行為 |
| --- | --- |
| 僅最新一檔 | 最新檔失敗就停止該來源 |
| 回溯第一個有效檔 | 按修改時間嘗試最近 N 檔，取第一個有效非空結果 |
| 合併最近 N 檔 | 任一選中檔案讀取／規則失敗就停止該來源；不靜默只合併部分檔案 |

錯誤包含檔名、工作表及失敗規則，可從服務日誌定位。整體更新保留既有容錯：其他來源成功時，失敗來源若有舊同名分頁則沿用。第 3 階段將加入畫面預覽與逐來源結果，目前不把整體更新成功當作每個來源都成功。

## 保存與相容

- SQLite 原表新增 `rules_json TEXT`，服務啟動自動補欄，既有設定不覆寫。
- POST 可帶 `rules`；PUT 未帶該欄保留舊設定，帶 `null` 停用，帶版本1物件更新。
- 版本、操作、型別、範圍、候選欄名與輸出撞名於保存時驗證；檔案／實際欄名於執行時驗證。
- 每類最多200項，每項文字最多1000字；位數1–100，表頭／掃描列數1–1000。
- 規則欄使用受支援表單選項，不輸入 JSON、Python 或 SQL。
- 進階補值、郵件、工單拆列、MAC 計算、MO 配對及生成限制仍屬第 4 階段；不自動將 DEG 接成工單查詢客戶。

## 正式機部署

以下 **9 個執行檔必須同批部署** 到 `/opt/sn_generator` 下對應位置，兩個新模組不能漏傳：

| 檔案 | 用途 |
| --- | --- |
| `backend/app/schemas/shipment_source.py` | API rules 欄位 |
| `backend/app/routers/shipment_source.py` | PUT 保留／停用語意 |
| `backend/app/services/shipment_source_service.py` | 規則驗證、保存、資料庫補欄、傳入合併程式 |
| `backend/app/tools/shipment_merge.py` | 自訂來源依規則呼叫共用讀取器 |
| `backend/app/tools/source_rules.py`（新增） | 規則驗證與 I01–I07 執行 |
| `js/app.js` | 編輯器與保存整合 |
| `js/modules/sourceRulesEditor.js`（新增） | 規則表單 |
| `index.html` | 新增設定欄與更新版本網址 |
| `styles/main.css` | 規則表單及隱藏欄位樣式 |

如有設定 `SHIPMENT_REFRESH_SCRIPT_PATH`，也要確認該路徑執行的是新版合併程式，且 `source_rules.py` 位於它旁邊。

在服務 Python 環境檢查完整部署：

```bash
cd /opt/sn_generator
venv/bin/python -c "import sys; sys.path.insert(0, 'backend'); from app.schemas.shipment_source import ShipmentSourceUpdateRequest; from app.services.shipment_source_service import ShipmentSourceService; from app.tools.source_rules import validate_rules; from app.tools.shipment_merge import process_custom_source; assert 'rules' in ShipmentSourceUpdateRequest.model_fields; assert hasattr(ShipmentSourceService, 'create_entry'); assert 'process_rule_source' in process_custom_source.__code__.co_names; validate_rules({'version': 1}); print('來源規則模組檢查通過')"
systemctl restart sn_generator
journalctl -u sn_generator -n 50 --no-pager
```

瀏覽器按 Ctrl+F5。Network 中 `sourceRulesEditor.js?v=0.3.63` 應為200及JavaScript MIME，不可回傳HTML。服務啟動成功後再測保存與更新。

不需要手動改資料庫、清除設定或整個程式目錄遞迴改權限。變更只新增資料表欄位並保存規則，檔案權限仍應依服務使用者配置。

## 已驗證的路徑

- API 保存、重載、拒絕無效版本、拒絕內建來源新規則、PUT省略保留與null停用。
- SQLite設定經初始化後保留；保存到合併子程序環境的規則與實際Excel處理一致。
- 第3列表頭、掃描表頭、多頁／包含匹配、別名、先備註過濾後選欄、轉換順序、去重。
- 三種選檔策略、缺必需欄／分頁、欄名歧義、無有效結果。
- 真正產出總表中的DEG分頁；DEG規則失敗時保留舊分頁。
- 瀏覽器新增／保存／切換／重載／停用，隱藏欄不阻擋原生表單驗證，手機寬度不溢出，無模組或執行錯誤。

測試：`backend/tests/test_source_rules.py`、`backend/tests/test_api_routes.py`、既有來源／更新回歸，及 `js/tests/shipment_source_regression.mjs`、`js/tests/source_rules_browser.mjs`。
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
