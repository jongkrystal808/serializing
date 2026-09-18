# 第 3 階段：匯入預覽與逐來源更新結果

**Version:** 0.3.79
**Last Updated:** 2026-09-18

## 操作

1. 在「資料來源維護」選 DEG／自訂來源，或新增來源。
2. 啟用「欄位與處理規則」，填寫路徑、工作表、表頭與規則。
3. 按「預覽目前規則」，直接使用目前表單，不需要先保存。預覽不修改來源設定、Excel 原檔或總表。
4. 查看檔案採用／回溯結果、分頁、實際表頭列、原始／改名後欄名、必要欄缺失及警告。處理前後樣本標示原始 Excel 列號，可確認過濾結果；每項過濾顯示剩餘筆數。
5. 最後查看選欄與去重後的輸出欄位、樣本及完整筆數。滿意後按「儲存設定」，再按「更新資料」。

修改表單、增刪或重排規則、切換來源會隱藏過期預覽；讀取中的舊請求也不會覆蓋新設定的畫面。

預覽與正式匯入使用同一讀取器，處理完整選定資料後取樣。前10個分頁各顯示最多20列／100欄，每格最多500字；不是只處理前20列，因此大型Excel仍需完整讀取與記憶體。畫面上的最終筆數包含全部選定資料。預覽失敗會保留已讀取資訊供診斷，不產生部分有效總表。

第 3 階段當時內建客戶保持專用流程；現況四個可編輯內建來源可先載入候選規則再預覽，未啟用者仍走原流程；未啟用規則的自訂來源需先啟用才可預覽。FCST、BIOS、Model等輔助來源仍併入所屬客戶處理器結果，不另宣稱有獨立更新總表分頁。

## 更新結果

首頁「各來源更新結果」在更新完成後繼續保留，逐項顯示來源、結果、筆數及本次失敗原因：

| 結果 | 含義 |
| --- | --- |
| 本次更新 | 本次成功處理並完成總表寫入 |
| 沿用舊資料 | 本次來源沒有成功輸出，沿用舊同名分頁；錯誤原因仍顯示 |
| 無資料可匯入 | 處理器沒有返回有效資料，且無舊分頁可沿用 |
| 失敗 | 讀取／規則出錯且沒有沿用資料，或總表寫入失敗 |

所有來源皆無本次成功資料時，任務失敗並保留原總表。總表寫入失敗時不把本次處理完成的來源標為更新成功。既有客戶處理器若自行捕捉錯誤並返回空結果，畫面只能顯示「沒有返回有效資料」，詳細原因查看服務日誌；自訂規則錯誤直接顯示檔案／分頁／規則原因。

結果隨目前背景任務保存在記憶體；重啟服務後不顯示前次任務結果，總表的最近更新時間仍保留。舊版合併腳本未回報結構化結果時，不猜測各來源成功狀態。

## API 與部署

- 新增 `POST /api/shipment-sources/preview`：參數與新增來源相同，以未保存規則執行。讀取／規則失敗透過 `data.error` 顯示，並保留 `files` 診斷；結構錯誤仍使用既有API錯誤回應。
- `GET /api/shipment-refresh` 新增 `source_results`。合併程式以 `SHIPMENT_SOURCE_RESULTS` JSON行回報，背景服務解析並保留至任務結束。
- 沒有新增資料庫欄位或依賴套件。

先完成[第 2 階段部署](source-rules-stage2.md)，再將以下 **10個變更檔案同批部署** 到 `/opt/sn_generator` 對應位置：

```text
backend/app/routers/shipment_source.py
backend/app/schemas/shipment_refresh.py
backend/app/services/shipment_refresh_service.py
backend/app/tools/source_rules.py
backend/app/tools/shipment_merge.py
js/app.js
js/modules/api.js
js/modules/sourcePreview.js（新增）
index.html
styles/main.css
```

若設定自訂 `SHIPMENT_REFRESH_SCRIPT_PATH`，需同步該腳本及旁邊的 `source_rules.py`。部署後檢查模組、重啟並在瀏覽器按 Ctrl+F5：

```bash
cd /opt/sn_generator
venv/bin/python -c "import sys; sys.path.insert(0, 'backend'); from app.schemas.shipment_refresh import ShipmentRefreshJob; from app.routers.shipment_source import preview_shipment_source; from app.tools.source_rules import process_rule_source; assert 'source_results' in ShipmentRefreshJob.model_fields; assert 'report' in process_rule_source.__code__.co_varnames; print('預覽與來源結果模組檢查通過')"
systemctl restart sn_generator
journalctl -u sn_generator -n 50 --no-pager
```

Network 的 `sourcePreview.js?v=0.3.64` 及 `api.js?v=0.3.64` 必須回傳JavaScript。先用DEG預覽確認表頭／欄位，再保存及更新；整體成功時仍需查看每個來源結果。

## 驗證

- 真實Excel預覽：未保存規則、原始列號、改名、補零、備註過濾、最終選欄與去重筆數；缺必需欄時保留原始欄名供診斷。
- 預覽前後來源設定與原Excel檔完全不變。
- 真正總表更新後的結構化結果，以及失敗沿用DEG舊分頁；全部失敗時保留總表。
- 背景任務成功後保留逐來源錯誤資訊。
- 實際瀏覽器：預覽不保存、樣本／筆數／沿用原因、修改後隱藏預覽、內建來源隱藏預覽按鈕，以及既有新增／保存／重載流程。

進階補值、月份、拆列計算及郵件仍留在第4階段。
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
