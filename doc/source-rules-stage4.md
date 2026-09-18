# 第 4 階段：進階匯入規則

**Version:** 0.3.79
**Last Updated:** 2026-09-18

目前完成第4階段的匯入部分（I08–I11），並接入保存、預覽與正式總表更新。查詢／生成（Q01–Q04、G01–G04）尚未接線：需先指定資料來源、要使用的客戶功能及序號規格，不依來源名稱自行推斷。I12赫星特殊版面仍保留原專用解析器。

## 表單操作與順序

在「資料來源維護」選自訂來源並啟用規則。新增以下規則後，先「預覽目前規則」，檢查欄位、樣本、筆數、對照匹配數及郵件替換數，再保存與更新。

執行順序固定為：選檔／分頁／表頭 → 原始欄位映射 → 儲存格補值 → 清理／同列補值／日期轉換 → 過濾 → 工單拆列與計算 → 合併／同主題郵件更新 → 主檔對照補值 → 最終選欄與去重。

後續規則引用改名後欄名。新產生的月份、數量、MAC數量、BIOS等欄位，在「只輸出指定欄位」模式也須列入輸出清單；候選欄填同名即可，不需要原檔先有該欄。必需欄位驗證容許規則明確產生的輸出欄。

### 1. 儲存格／月份擷取

新增「儲存格補值」，填輸出欄及有序地址，例如 B1、A1、B2、A2。逐檔逐頁取第一個非空值，不跨分頁共用同一個月份。

- 原文字：保留讀取文字，例如KOYA目前A1:B2的月份標記。
- 日期轉換：指定輸入格式，例如 `%Y-%m-%d`、`%Y/%m/%d` 或 `%Y-%m-%d %H:%M:%S`；輸出 `%Y-%m` 為年月，`%m` 為月份。格式不符時明確失敗，不猜日期。
- 覆寫：總是覆寫／只補空值。
- 全空：報錯／填空白／保留原值。

地址限制前1000列、200欄。日期先按Excel讀取文字解析；沒有把數值日期碼自動當作日期。

### 2. 同列PO補值與日期轉換

在「欄位清理」新增「按候選欄補值」，填目標欄、候選欄清單及覆寫方式。例如目標「採單號碼」，候選「PO號碼」、「PO」，只補空值。按設定順序取第一個非空候選。候選欄不存在時失敗；候選欄為空才繼續下一欄。

「日期／月份轉換」可轉換既有資料欄，格式與儲存格日期轉換相同。空資料保留空白；無效日期不截斷或猜測。

### 3. 欄位位置映射

每個輸出欄新增「原始欄位置」，從1起算。留空使用原候選欄名；填位置時只採用該實體欄，不再嘗試別名。

可明確區分HTML／Excel中的兩個MAC欄，例如第1欄→單位用量、第3欄→MAC數量；也能讀取有資料的空白表頭欄。預覽顯示原始表頭及映射位置。重複表頭若沒有明確位置仍報歧義；位置映射後留下的重複輸出欄也會拒絕，不自動覆寫。

### 4. 工單拆列與用量計算

工單如 `W1*2/W2*3`，分隔符為 `/`、數量標記為 `*`。分隔符每列一個；SPACE代表單一空白，NEWLINE代表換行。

- 只拆工單：數量輸出欄留空、計算選「不計算」。其他欄原值複製至各列。
- 覆寫數量：指定數量輸出欄，每筆工單都須帶正整數標記數量。
- 乘法：數量 × 指定單位用量欄，寫入總用量欄，例如MAC數量。
- 比例：按標記數量比例分配原總用量；指定半偶／四捨五入／向下／向上捨入。差額可分配給最大數量或第一筆，或有差額就拒絕。最後總和等於原總用量，不默默丟失差額；差額若造成負數則拒絕，建議改用向下捨入。
- 可指定拆列標記欄；單工單預設不套用數量／計算，勾選後才執行。
- 同列重複工單可報錯、取第一筆或最後一筆。局部更新鍵包含工單時必須報錯，避免重複鍵替換。

數量須為正整數，單位／總用量須為非負整數，不自動取整數小數。工單、數量、總用量及標記輸出欄不得撞名。拆列樣本保留相同原始列號，方便追溯。

### 5. Excel／既有主檔補值

對照來源可選Excel、KOYA型號、NYX型號、KOYA月份PO或NYX月份LOT。

| 來源 | 可用對照欄 |
| --- | --- |
| Excel | 指定檔案與表頭列的實際欄名；工作表留空取第一頁 |
| KOYA型號 | model、pn、full_pn、po |
| NYX型號 | model、pn、lot |
| 月份主檔 | month、value；value為PO／LOT |

查找鍵每列填「資料欄=對照欄」，例如 `機種=model`；可設定多個鍵。補值欄每列填「對照欄=輸出欄=覆寫策略」，例如 `pn=PN=if_empty`、`full_pn=full PN=always`。省略第三段預設只補空值。表單配對目前不支援欄名本身包含等號。

可設定資料鍵的空白／大小寫比對、精確或XXXX族群前綴、重複鍵策略、未匹配處理及來源讀取失敗處理。精確命中優先；族群只支援單鍵，多個族群命中時拒絕。空主檔鍵不參與查找。

未匹配與來源失敗分開：未匹配可保留／清空／報錯；來源讀取失敗預設停止，若明確選清空則清空本規則輸出並回報警告。多個對照規則按清單順序執行，後面always可覆寫前值。主檔採唯讀連線，不建立不存在的資料庫，不允許輸入SQL。

Excel對照可用於FCST補Model／MO及BIOS／FW補值。月份主檔的鍵應與擷取輸出一致，例如都用2026-09，不擅自轉換已有月份主檔鍵。KOYA原畫面載入後的補值流程維持原樣，這裡新增的是自訂來源匯入時補值。

### 6. 郵件抽表與同主題局部更新

來源格式可選Excel、EML、MSG或混合。EML使用標準函式庫，MSG沿用專案既有extract-msg依賴。

- HTML本文、HTML／Excel附件，或先本文再附件。HTML取第一張有效表格或欄數最多表格，並設定最低欄數。
- HTML抽表接成「郵件表格」分頁，再執行原表頭／別名／位置及其他規則；附件Excel沿用原分頁。可先選第一頁預覽，避免把原Excel分頁名稱套到HTML。
- 刪除線可保留文字並標記、移除刪除文字或只保留文字；辨識s／del／strike及儲存格內行內line-through樣式。原客戶呼叫的預設抽表行為不變。
- HTML不展開rowspan／colspan合併儲存格，遇到時明確拒絕，請改用未合併表格或Excel附件。Excel附件只取郵件中第一個符合副檔名的附件，不任意合併多附件。
- 回覆前綴預設RE／FW／FWD，必須帶冒號（含全形），可更換前綴。
- 局部更新鍵留空停用；啟用需使用合併最近N檔策略。按檔案修改時間由舊至新套用，僅替換去除前綴後同主題、同鍵列，不跨主題替換。
- 選中回覆但沒有原始底稿時，可在同資料夾、同檔名關鍵字候選中回溯最近同主題原始郵件；找不到底稿就失敗，不把局部更新當完整資料。補底稿可超出最近N檔。
- 更新鍵缺欄、空值或重複時拒絕。預覽回報每封回覆的替換舊列及加入筆數。若多個原始郵件被選中，同主題原始資料先合併，再套用回覆，最後按輸出欄去重。

## 保存與部署

仍使用版本1的rules JSON欄，新增cell_values、lookups、splits、input_format、mail及兩種轉換；沒有新增資料庫欄位、任意程式入口或依賴套件。未知操作／版本保持拒絕。

以[第3階段](source-rules-stage3.md)為基礎，以下 **11個變更檔案需同批部署**；新增的3個模組不可漏傳：

```text
backend/app/routers/shipment_source.py
backend/app/services/shipment_refresh_service.py
backend/app/tools/shipment_merge.py
backend/app/tools/source_rules.py
backend/app/tools/source_advanced.py（新增）
backend/app/tools/source_mail.py（新增）
backend/app/tools/mail_tables.py（新增）
js/app.js
js/modules/sourceRulesEditor.js
js/modules/sourcePreview.js
index.html
```

自訂SHIPMENT_REFRESH_SCRIPT_PATH時，其旁邊也須有source_rules.py、source_advanced.py、source_mail.py、mail_tables.py。網頁預覽使用服務的資料庫；背景更新傳入SHIPMENT_DB_PATH。獨立執行腳本使用SQLite對照時須將SHIPMENT_DB_PATH指定為同一資料庫絕對路徑。

```bash
cd /opt/sn_generator
venv/bin/python -c "import sys; sys.path.insert(0, 'backend'); from app.tools.source_rules import validate_rules; from app.tools.source_advanced import apply_lookups, split_rows; from app.tools.source_mail import open_source; from app.tools.mail_tables import extract_raw_tables_from_html; assert 'lookups' in validate_rules({'version': 1}); print('進階匯入模組檢查通過')"
# 使用MSG來源時另外確認既有依賴：
venv/bin/python -c "import extract_msg; print('MSG模組可用')"
systemctl restart sn_generator
journalctl -u sn_generator -n 50 --no-pager
```

瀏覽器按Ctrl+F5；sourceRulesEditor.js與sourcePreview.js的版本網址為0.3.65，必須回傳JavaScript。先預覽再保存、更新，並查看各來源結果。預覽只限制樣本量，仍需完整讀取選定檔案。

## 已驗證

真實Excel的月份擷取、PO補值、工單拆列乘法、比例總和／差額、位置映射與歧義、SQLite族群與月份補值、Excel重複鍵／覆寫／來源失敗；規則經SQLite保存、服務重啟初始化及子程序環境傳遞後結果一致。EML本文／HTML附件、同主題回覆、不跨主題替換、底稿回溯及刪除線均以真實郵件檔驗證。

瀏覽器驗證新增進階規則、配對文字轉成結構化參數、保存重載、郵件設定顯示與停用、預覽及既有來源功能。MSG使用既有依賴；目前沒有使用者提供的真實MSG fixture作相容性驗證。

測試入口：backend/tests/test_source_advanced.py及既有來源／預覽／更新/API測試；js/tests/source_rules_browser.mjs及前端回歸。
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
