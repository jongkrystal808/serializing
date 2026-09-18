# 通用來源搜尋與預覽

**Version:** 0.3.79
**Last Updated:** 2026-09-18

所有自訂來源及內建富弘年預設使用「通用搜尋與預覽」。新增、保存並更新總表後，首頁「工單／MO」模式會自動納入來源，不需修改客戶列表或 config.py。每次更新完成與頁面載入都重新讀取來源清單；手動上傳共用總表也使用同一清單讀取對應工作表。所有通用來源自動使用超恩式預覽。

「指定搜尋欄名」留空時搜尋全部匯入欄位，包括工單、型號、料號等文字。也可填寫匯入後的欄名，例如 MO，將搜尋限制在該欄。先匹配完整值／分隔文字，沒有精確命中才比對包含文字。沿用首頁客戶選擇順序，精確命中優先；同來源多筆命中會全部渲染，顯示全部欄位並支援點選儲存格複製。

所有通用來源命中後使用超恩式預覽：第一筆資料依欄名分成「工單與產品資訊」、「數量與交期」、「序號、版本與備註」卡片，每欄可單獨或整區複製；「原始資料」頁籤保留全部命中列。新增來源不需另寫渲染程式；勤誠原有客序／MAC 面板維持不變。

泉影另外選擇「泉影 DEG 工單搜尋與編碼」，建議指定匯入後的工單欄名，例如 MO。只有命中泉影才展開 DEG 編碼面板；通用來源只顯示資料，不套用其他客戶的編碼／匯出／序號歷史。

來源路徑使用 Linux 路徑，例如 `/mnt/netdisk/@思創出貨資料(泉影 FDE)`。搜尋使用既有 `DEFAULT_EXCEL_PATH` 指向的總表，不直接搜尋原始資料夾。保存後按「更新資料」，首頁使用「工單／MO」模式搜尋；命中泉影才展開編碼面板。

已保存的自訂來源也自動納入通用搜尋，不必重新新增。修改設定後保存、更新資料即可，不必重啟服務。只有一個來源能綁定泉影；更換前先將原來源用途改為「通用搜尋與預覽」。未綁定泉影時，泉影仍保留原本 config.py 的預設設定。

## 首次部署這項功能

同批更新 release 清單中的 27 個必要執行檔及前端依賴，版本 0.3.70。主要修改為來源 schema／service、Excel service／router、前端 api／app／state／homeController、新增 sourceSearch.js、index.html，以及 shipment_check.py 與 deploy/shipment-release.json。首次部署後重啟服務，載入新版程式。

```bash
cd /opt/sn_generator
systemctl restart sn_generator
# 使用服務的同一使用者與環境執行部署檢查
venv/bin/python backend/app/tools/shipment_check.py --check --manifest deploy/shipment-release.json
```

瀏覽器 Ctrl+F5 後設定用途、保存並更新資料。以 `/api/excel/load-default?customer=deg` 驗證：`sheet_name` 應為綁定的來源名稱，`resolved_columns.WORK_ORDER` 應為指定欄名，`rows_count` 應有資料。資料尚未更新或總表缺少工作表時，API 會回報原因；欄名錯誤會回報 `SOURCE_SEARCH_COLUMN_NOT_FOUND`，不會回到其他來源假裝成功。

通用來源 API 為 `/api/excel/load-source?source_key=來源列表中的key`，允許已保存的自訂來源及內建 `dcg`，讀取 `DEFAULT_EXCEL_PATH` 的對應工作表。不存在的來源／工作表、欄名錯誤會回報原因；載入失敗會清除舊資料並顯示來源錯誤，不影響其他來源。

既有內建客戶維持原本搜尋與編碼流程，新增通用來源不需要註冊序號生成規則。
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
