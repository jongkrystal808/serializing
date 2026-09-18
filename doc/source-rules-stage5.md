# 第 5 階段：舊客戶比較遷移與部署驗收

**Version:** 0.3.79
**Last Updated:** 2026-09-18

第5階段已建立可回退的遷移入口、四個候選設定、六客戶相容性檢查，以及同批部署驗收工具。正式客戶檔案位於伺服器，本工作區未連線正式機；以下驗證是生成的真實Excel測試檔及原處理器結果，不能視為已完成正式資料遷移。

## 客戶狀態

| 客戶 | 候選／狀態 | 已驗證或已知差異 |
| --- | --- | --- |
| 營邦 | 可逐次比較 | 多頁、PO號碼→採單號碼、最新檔缺頁回溯可一致；NA空值、部分分頁無表頭時有差異，回舊結果 |
| 倫飛 | 可逐次比較，建議第一個 | 標準／別名欄、MO／數量文字、型號可一致；舊符號移除及表頭未命中回第1列不保證等價 |
| 富弘年 | 可逐次比較 | 純數字補零、完整年月日字串移分隔符可一致；短月日形狀及非日期工單有條件處理差異，回舊結果 |
| 勤誠 | 可逐次比較 | 分頁包含、逐檔回溯、全部欄位／額外欄可一致；跨儲存格拼字、符號移除、表頭回退及空白表頭有差異 |
| 超恩 | 保留專用流程，blocked | 檔名判斷RE、跨底稿鍵替換、兩套MSG／EML抽表及舊比例round行為與新規則不同 |
| KOYA | 保留專用流程，blocked | 空白欄定位、小數尾碼無條件截斷、逐檔跳過、Excel Model補值與畫面SQLite覆寫PO順序尚未等價 |

沒有自動改寫SQLite的內建來源、沒有複製成自訂同名分頁、沒有刪除舊處理器。赫星／Cubepilot不在出貨合併遷移範圍；DEG自訂來源仍走已配置的規則。

## 比較與切換行為

環境變數 `SHIPMENT_RULE_MIGRATION_CUSTOMERS` 留空時完全沿用原客戶流程。啟用某客戶後，每次更新先取得原處理器本次結果，再讀候選規則結果：

- 有兩份非空資料，且欄位名稱、欄順序、列數、列順序、型別及值完全一致，才採用本次候選結果，回報matched。
- 不一致、候選失敗或沒有兩份有效資料，使用**本次舊處理器結果**，回報fallback；此時若舊處理器也無資料，才沿用既有總表的retained／skipped容錯。
- 超恩／KOYA回報blocked，直接保留本次專用處理器結果，不嘗試不等價的候選。
- 比較不先排序、去重、trim或fillna，因此不會把NA與文字NA／空字串、前導零、順序等差異隱藏。
- 畫面的「各來源更新結果」會顯示遷移狀態與原因。遷移fallback不是來源更新失敗；舊處理器成功仍可正常更新。

這是驗收窗口，啟用的客戶每次會讀舊／新兩次。完成正式資料覆蓋與相容性工作後，才另行移除舊路徑；本次不進行破壞性的收尾。

## 唯讀驗收工具

工具：`backend/app/tools/shipment_check.py`。請使用systemd服務的同一使用者與環境執行，否則root可寫不代表服務可寫，或可能讀到錯誤DB_PATH／來源設定。

預設／`--check`檢查：27個必要執行檔、同批SHA256清單（文字檔CRLF一致化為LF，其他內容不忽略）、後端路由／schema／規則模組、實際SHIPMENT_REFRESH_SCRIPT_PATH及旁邊模組、前端本地靜態import完整性、既有來源設定、唯讀SQLite可讀性，以及資料庫／日誌／總表與父目錄寫入權限。它不啟動背景任務、不初始化／更改資料庫、不重建總表、不寫更新日誌。

`--base-url`另讀取實際網頁的本地JS／CSS／index.html，檢查MIME及內容雜湊，能找出HTML冒充JavaScript、舊快取／缺檔／部分部署。檢查專案自身資產，不檢查外部CDN；靜態import與index中的inline import會追蹤，動態組裝URL不作推斷。

`--compare`呼叫原客戶處理器與候選，比較報告包含欄位、筆數、原因、最多10個值差異樣本及候選設定。舊write_log在比較期間停用；輸入、總表、資料庫與更新日誌不變。報告可能包含實際業務資料，存於操作者指定的位置。

```bash
cd /opt/sn_generator
# 檢查部署完整性與目前設定／權限（請在服務使用者與相同環境執行）
venv/bin/python backend/app/tools/shipment_check.py --check --manifest deploy/shipment-release.json
# 加上實際對外網址，可檢查MIME與伺服器回傳內容
venv/bin/python backend/app/tools/shipment_check.py --check --manifest deploy/shipment-release.json --base-url https://你的主機/實際網站路徑/
# 先比較倫飛；不會更新總表或修改規則
venv/bin/python backend/app/tools/shipment_check.py --compare lunfei --manifest deploy/shipment-release.json > /tmp/lunfei-migration.json
# 全部比較；超恩／KOYA預期會回報blocked，退出碼為2
venv/bin/python backend/app/tools/shipment_check.py --compare all --manifest deploy/shipment-release.json > /tmp/shipment-migration.json
```

退出碼：0＝部署檢查通過，且指定比較全部一致；1＝部署／設定／權限／執行錯誤；2＝部署檢查通過，但比較有差異、無有效資料或blocked。2不是可以跳過的成功結果，應先讀原因。沒有兩份有效資料不會判為可以遷移。

`--env-only`可在工作區生成或核對release清單、用測試資料夾驗證；它跳過SQLite／權限檢查，只使用環境來源設定，不是正式驗收。

## 部署與逐客戶啟用

如果第4階段已部署，本次8個變更執行檔與release清單需同批更新：

```text
backend/app/tools/source_migration.py（新增）
backend/app/tools/shipment_check.py（新增）
backend/app/tools/shipment_merge.py
backend/app/services/shipment_source_service.py
backend/app/schemas/shipment_refresh.py
js/modules/sourcePreview.js
js/app.js
index.html
deploy/shipment-release.json（新增，同批檔案雜湊）
```

若前階段尚未完整部署，release清單列出27個必要檔案，全部補齊；前端import依賴也需存在。自訂更新腳本旁需同步同版本source_rules、source_advanced、source_mail、mail_tables、source_migration。

0.3.67另包含泉影面板顯示修正：同步backend/app/core/config.py、js/state.js、js/modules/homeController.js、js/modules/deg.js、js/app.js、index.html與shipment_check.py／release清單。首頁工單搜尋讀取總表的DEG工作表，只匹配工單／MO欄位；命中泉影才展開編碼面板，其他客戶、空白／未命中或機種搜尋時隱藏。

順序：保留目前可回退的程式版本及設定 → 同批部署 → 暫不啟用遷移，重啟服務讓既有schema初始化 → 以服務環境執行檢查 → 對真實倫飛資料比較 → 僅對matched客戶啟用 → 按更新資料核對來源狀態、總表及既有查詢／生成流程。

測試產生的matched不代表所有未來格式皆等價，故啟用後仍逐次核對。系統使用目前已保存的來源路徑／分頁／最近檔案數，候選在執行時由同一客戶設定建立，不覆寫使用者值。

確認倫飛正式資料matched後，可在systemd環境設定：

```ini
[Service]
Environment="SHIPMENT_RULE_MIGRATION_CUSTOMERS=lunfei"
```

再執行 `systemctl daemon-reload`、`systemctl restart sn_generator`，瀏覽器Ctrl+F5。之後逐一驗收，可改成 `lunfei,yingbang,dcg,fzg`；不建議未驗收就一次啟用。

回退：將該環境變數設為空字串、daemon-reload並重啟。下一次更新直接走舊處理器，不需要回滾資料庫或刪除來源規則。如果需要回退整批程式，恢復同一批備份程式／前端資產；新增SQLite欄仍可留存，舊讀取器不使用它。

## 驗證結果與界線

覆蓋四客戶正常檔案等價、營邦缺頁回溯／NA／部分分頁、倫飛／勤誠表頭回退、富弘年條件補零差異、超恩跨底稿RE／舊比例總和、KOYA八位工單小數截斷／Total／月份與Model補值；也驗證預設舊流程、啟用matched結果寫總表及清空環境變數回退。

CLI子程序使用已保存SQLite來源設定比較，驗證原DB、輸入Excel、總表及日誌位元組不變；缺DB不建立空DB。實際HTTP測試驗證JS回HTML的MIME錯誤，雜湊測試驗證部分部署可被拒絕。瀏覽器驗證來源結果中的遷移原因。倫飛指定型號禁用序號及MO／數量配對仍有回歸檢查。

正式資料比對、正式機服務使用者權限、對外MIME與實際啟用／部署尚需在伺服器執行，這次沒有遠端部署。第4階段查詢／生成參數接線仍待來源與客戶規格；沒有因本次遷移而擅自新增查詢客戶。

0.3.68：新增來源可設定泉影搜尋用途與匯入後工單欄名，無需修改config.py；詳見source-search.md。

0.3.70：所有自訂來源預設自動搜尋與預覽，不需要新增客戶程式碼；詳見source-search.md。
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
