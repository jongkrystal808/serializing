# 現行客戶資料與處理規則彙總

**Version:** 0.3.79
**Last Updated:** 2026-09-18

整理日期：2026-09-18。依本機工作區目前程式實作整理；正式機部署版本、環境變數、SQLite 已保存設定及來源檔內容未直接讀取。下列路徑、工作表、檔案數與主檔資料均為程式預設或初始化值，不代表正式機目前值。

本文記錄規則抽出前的客戶現況。後續參數與執行行為見[規則參數規格](source-rules-spec.md)；自訂Excel來源的基本設定已於[第 2 階段](source-rules-stage2.md)實作，內建客戶維持原流程。

範圍涵蓋來源選取、表頭、欄位、資料清理、跨表補值、查詢、序號與匯出。以「資料來源維護」後續需要支援的規則為主，序號與匯出另列，避免把資料匯入與標籤生成混在一起。

## 1. 實際流程與客戶範圍

| 客戶／資料 | 進入出貨總表 | 畫面載入與操作 |
| --- | --- | --- |
| 營邦 | 專用處理器，輸出「營邦出貨」 | 讀總表，工單查詢，產生 SN |
| 倫飛 | 專用處理器，輸出「倫飛出貨」 | 讀總表，MO 查詢，產生 SN／箱標 |
| 超恩／VECOW | 專用處理器，輸出「超恩出貨」，另讀 FCST、BIOS/FW | 讀總表，MO 查詢，展開 SN／MAC／UUID |
| KOYA | 專用處理器，輸出「KOYA出貨」，另讀 Model Excel | 讀總表後再套用 SQLite 型號／月份主檔，工單查詢 |
| 富弘年 | 專用處理器，輸出「富弘年出貨」 | 由通用來源載入首頁工單搜尋；使用超恩式分類卡片與原始資料頁籤，不提供序號歷史／匯出 |
| 勤誠 | 專用處理器或已保存候選共用規則，輸出「勤誠出貨」 | 由來源資料載入首頁搜尋；使用超恩式分類卡片與原始資料頁籤，並保留客序／MAC 面板 |
| 赫星 | 未經出貨合併程式 | 直接讀「組測序號編碼」，橫向資料轉直向記錄，Model 查詢／匯出 |
| Cubepilot | 未經出貨合併程式 | 直接讀「板階序號編碼」，機種查詢，手動設定流水號 |
| 泉影 DEG | 以自訂 Excel 來源加入，總表分頁等於來源名稱 | 唯一来源可标记 DEG 搜尋用途；工單命中時開啟獨立編碼面板，不加入原六客戶 registry |
| NYX | 未見專用出貨處理器 | 有 Model→PN、月份→LOT 主檔維護；未見載入出貨後套用這些主檔的流程 |

主要程式：`backend/app/tools/shipment_merge.py`、`backend/app/services/excel_service.py`、`js/app.js`、`index.html`、`js/modules/customers.js`。

## 2. 來源、檔案與工作表規則

「最新」依檔案修改時間，不依檔名日期。一般 Excel 選檔接受 `.xls/.xlsx/.xlsm` 並排除 `~$` 暫存檔；但既有專用處理器使用 openpyxl 讀取，不能因此認定真正的舊式 `.xls` 一定可讀。

| 客戶／來源 | 預設工作表／選擇方式 | 檔案規則 | 多檔用途 |
| --- | --- | --- | --- |
| 營邦 | 指定多張：試產、OEM-ZV_V3、量產機種、Eldora機種、ZV_MP、重工、MB、參展 | 無檔名關鍵字，最新至多 10 檔 | 逐檔嘗試，取第一個有效檔；合併該檔的指定分頁，不合併 10 檔 |
| 倫飛 | `FCST`，名稱指定 | 無檔名關鍵字，最新 1 檔 | 無回溯 |
| 超恩主來源 | Excel 第一張分頁；郵件讀 HTML 表格 | 檔名含「超恩」的 `.xlsx/.msg/.eml`，最新 4 檔 | 合併多檔；若選中 RE/FW 郵件，可能額外補原始郵件，超過 4 檔 |
| 超恩 FCST | `2026` | 檔名含「超恩FCST產銷計畫表」，最新 1 檔 | 供超恩補 Model、MO |
| VECOW BIOS/FW | `List` | 指定單一 Excel 檔 | 供超恩補 BIOS、FW |
| KOYA | `統計表` | 無檔名關鍵字，最新 4 檔 | 合併 4 檔；某檔讀取直接拋例外會使整個 KOYA 處理失敗 |
| KOYA Model 對照 | 第一張分頁 | 指定單一 Excel 檔 | 供 KOYA 補 Model、full PN、PN、PO |
| 富弘年 | `生產排程表 2026` | 檔名含「出貨」，最新 1 檔 | 無回溯 |
| 勤誠 | 分頁名稱標準化後包含「工作表3」，取第一張匹配分頁 | 無檔名關鍵字，最新至多 10 檔 | 逐檔回溯，取第一個非空結果，不合併 10 檔 |
| 赫星 | `組測序號編碼` | 預設指定單一 `.xls`；API 支援 xlrd／openpyxl 格式判讀 | 不走合併程式 |
| Cubepilot | `板階序號編碼` | 預設指定單一 `.xls`；API 支援 xlrd／openpyxl 格式判讀 | 不走合併程式 |
| 自訂來源（DEG） | 工作表名稱完全匹配；留空讀第一張 | 資料夾篩 Excel、副檔名、非暫存檔及檔名包含關鍵字；單檔模式直接讀指定路徑 | 最新 N 檔直接合併，再以全部欄位去除重複列 |

DEG 目前依使用者提供設定：資料夾 `/mnt/netdisk/@思創出貨資料(泉影 FDE)`、工作表 `生產排程 2026`、檔名包含 `泉影訂單總表`、最近 1 檔。不是寫死於程式的專用泉影規則。

### 預設路徑

| 來源 | 程式預設路徑 |
| --- | --- |
| 營邦 | `/mnt/netdisk/@思創出貨計畫(營邦)ALG/NPI 生產排程/2026` |
| 倫飛 | `/mnt/netdisk/@思創出貨計畫(倫飛)/FCST` |
| 超恩 | `/mnt/netdisk/TE/個人資料/To Claire` |
| 超恩 FCST | `/mnt/netdisk/@思創出貨計畫(超恩)` |
| VECOW BIOS/FW | `/mnt/netdisk/TE/個人資料/To Claire/VECOW各機種BIOSFW測試程式一覽表.xlsx` |
| KOYA | `/mnt/netdisk/@思創出貨資料(KOYA)` |
| KOYA Model | `/mnt/netdisk/TE/個人資料/To Claire/KOYA_model.xlsx` |
| 富弘年 | `/mnt/netdisk/@思創出貨資料(富弘年)` |
| 勤誠 | `/mnt/netdisk/@思創出貨計畫(勤誠)/2026 交期確認表` |
| 赫星 | `/mnt/netdisk/@思創出貨計畫(Cubepilot)/各機種貼紙代碼/組裝、包裝階序號編碼.xls` |
| Cubepilot | `/mnt/netdisk/@思創出貨計畫(Cubepilot)/各機種貼紙代碼/PCB板階、測試階序號編碼.xls` |

## 3. 表頭偵測與匯入欄位

以下列數以 Excel 第 1 列起算。

| 客戶／來源 | 表頭規則 | 選取及新增欄位 |
| --- | --- | --- |
| 營邦 | 掃前 5 列，任一儲存格去前後空白後等於保留欄位或 `PO號碼`；找不到則略過分頁 | DDC料號、工單、料號、品名、採單號碼、Q'TY；只保留存在欄位並依此順序輸出 |
| 倫飛 | 掃前 10 列，整列文字包含 MO／P/N／PN，不分大小寫；未命中用第 1 列 | 加工WO#、工單、P/N、對應PCBA、MO、Q'ty、Model；按別名匹配並改成標準名稱 |
| 超恩 Excel／MSG 通常路徑 | Excel 第 1 列；MSG HTML 的表頭由 HTML 解析器決定 | 固定映射十欄，詳見下一節；不存在的欄位不補齊 |
| 超恩 multipart EML 主路徑 | 第一個 HTML 表格，至少 10 欄，略過第一行；採位置而非表頭名稱 | 第 1～10 欄依序：日期、MAC板子用量數量、工單、機種名稱、機種料號、生產數量、MAC數量、MAC Address、序號區間、UUID區間 |
| 超恩 FCST | 掃前 10 列，任一非空格含 `po`，未命中用第 1 列 | PO、Model、MO；三欄缺一即不使用對照表 |
| BIOS/FW | 掃前 5 列，找到儲存格等於「料號」；未命中用第 2 列 | 料號、新版BIOS(以此為主)、IGN FW版本；三欄缺一即不使用對照表 |
| KOYA | 掃前 80 列，整列同時含「機種」「批量」；找不到略過該檔 | 工單、機種、批量、滿箱數量、需求、尾數數量、小張貼紙；新增工單月份；跨表新增 Model、full PN、PN、PO |
| KOYA Model | 第一分頁掃前 5 列，格值為 Model、不分大小寫；未命中用第 1 列 | Model、full PN、PN、PO；三種 PN／PO 欄位加 Model 都必須存在 |
| 富弘年 | 掃前 80 列，任一格去前後空白後等於保留欄位；未命中失敗 | NO、製令單號、產品品號、產品型號、生產數量、備註、BIOS版本、MO、Q'ty、DDC PN、SN區間、MAC、TP |
| 勤誠 | 掃前 10 列，標準化後整列文字含任一提示欄名；未命中用第 1 列 | **保留全部欄位**；PO#、Chenbro PN、DDC PN、QTY、廠 商 交 期、DDC MO、SUGON S/N 僅作表頭提示，不是匯入白名單 |
| 赫星 | 掃全表第一欄的 Model／PN／PK／P/N／EAN／PCBA 標籤列；每個其他欄代表資料記錄 | 輸出 Model、PN、EAN Code、PCBA/Accessories      機種名；同欄多個不同 Model 展開成多筆 |
| Cubepilot | API 使用第一個非空列當表頭 | 保留所有有欄名的欄位；畫面主要辨識機種名、小張QRCODE、Cube測試用貼紙、note |
| DEG／自訂 Excel | 由保存的 version 1 規則選擇固定／掃描表頭；未啟用規則時沿用第 1 列 | 規則可選欄、別名／位置、轉換、過濾、進階補值／拆列／郵件；未啟用時保留全部欄位 |

API 一般橫列解析與出貨合併的表頭規則不同：API 使用第一個非空列，忽略空欄名，捨棄解析後全空列；欄位別名解析只建立「功能代碼→實際欄名」對應，並不自行刪除其他欄位。

## 4. 各客戶資料清理與特殊處理

### 營邦

- 去除欄名前後空白；手動重複欄名計數從第二次起加 `_2`、`_3`。空字串欄名替換為 `Unnamed`，但 NaN 經字串化可能變成 `nan`。
- 缺少「採單號碼」而有「PO號碼」時，複製「PO號碼」至「採單號碼」。
- 同一有效檔案的指定分頁以縱向合併，不做去重。
- 載入畫面時套用 `arrow`：儲存格含 `->`、`→`、`>` 時取後段非空文字。例如 `舊料號 → 新料號` 顯示新料號。
- 多工單查詢可忽略 `*數量` 後綴；數量解析優先使用命中工單的 `工單*數量`，否則採數量欄。

### 倫飛

- 欄名匹配先移除空白及非中英數／`#`／單引號符號，再轉小寫，依別名優先序取第一個命中。
- 匯入改名：加工 WO#／加工WO／加工工單→加工WO#；工單#／工令／WO→工單；PN／Part No／PartNo→P/N；PCBA對應／PCBA→對應PCBA；MO#／製令／製令單→MO；Qty／數量／QTY→Q'ty；機種／型號→Model。原標準名稱亦接受。
- 載入畫面套用 `arrow`。MO 與數量都有 `/` 分隔時，按命中 MO 的位置取對應數量；不能配對則嘗試整格數量。
- 型號 `BAG017-`、`BAG159-`、`BAG016-` 開頭：顯示貼紙及版本查詢提示，仍可生成序號。
- 型號等於 `BAG428-001D`：畫面禁止生成序號；後端 SnService 未實作相同型號禁用驗證。
- 備註中的「大箱100/1、小箱50/1」目前是顯示文字，不是自動包裝數量演算法。

### 超恩／VECOW

匯入欄名先移除一般空格及 NBSP，再映射：

| 原欄名（清理後） | 標準輸出欄 |
| --- | --- |
| 日期 | 日期 |
| MAC | MAC板子用量數量 |
| 工單 | 工單 |
| 機種名稱 | 機種名稱 |
| 機種料號 | 機種料號 |
| 生產數量 | 生產數量 |
| MAC.1 | MAC數量 |
| MACAddress | MAC Address |
| 序號區間 | 序號區間 |
| UUID區間 | UUID區間 |

- 數字欄名路徑按位置取前十欄，否則按上表映射；不是任意同義欄名自動推斷。
- 刪除日期／首選欄為 NA 的列，另用字串是否全空檢查；字串 `nan` 不一定會被全空檢查移除。
- 序號區間、UUID區間：「到」→` ~ `。
- MAC Address：「至」→` ~ `，移除冒號。
- 工單格允許多工單，分隔符包含空白、換行、逗號、頓號、分號、`|`、`/`；數量標記支援 `*`、`x`、`X`、`×`。
- 同列多工單展開為多列，同列同工單去重；單工單含數量標記不走多筆展開。
- 展開列新增「拆分標記=拆分」，有數量即覆寫生產數量。
- MAC 數量優先為「拆分數量×MAC板子用量數量」；用量未知但所有工單數量均已知時，按原 MAC 總數比例四捨五入。未另做總數差額調整。
- `.eml` 主解析保留 HTML 刪除線內容並加 `[已刪除]`；載入畫面時，儲存格只保留最後一次 `[已刪除]` 之後的文字。
- EML multipart 主路徑取第一張 HTML 表格；HTML 附件、非 multipart 等備援路徑走另一解析器，可能取欄數最多的表格或第一張可解析表格。MSG 使用 HTML 本文，失敗再試 HTML 附件。
- EML 本文嘗試 UTF-8-SIG、BIG5、CP950、UTF-8、GB18030；實作使用忽略解碼錯誤，不是嚴格依郵件 charset 判讀。
- RE/FW/FWD 檔名忽略多層前綴、空白及大小寫，配對同主題的最新原始郵件。
- 局部更新以「工單＋機種料號」替換舊列；RE 按修改時間由舊到新套用，缺雙鍵不替換但仍加入新列。替換實作跨已收集底稿執行，未限制同一 thread。
- 局部更新階段有去重，但當時仍帶來源路徑／時間等內部欄位；移除內部欄位後不再去重，不能視為最終業務欄位保證唯一。
- FCST 左連接：出貨「工單」→FCST「PO」，補 Model、MO。對照表捨棄空 PO，同 PO 保留第一筆。
- BIOS 左連接：出貨「機種料號」→BIOS「料號」，補新版BIOS(以此為主)、IGN FW版本；空料號捨棄，重複料號保留第一筆。
- 對照表載入失敗時新增欄留空，不使超恩整體失敗；左連接成功但未匹配的值可為 NaN。
- 最後將 Model、MO 移到前兩欄。

### KOYA

- 表頭前 3 欄中的第一個 `Unnamed` 改成「工單號碼」；原「工單」改成「序號」，避免與真正工單混淆。「序號」不在保留白名單中。
- 任一欄包含 `Total`（不分大小寫）即移除整列，不僅限正式總計列。
- 工單號碼去前後空白、取第一個 `.` 之前部分，只保留恰好 8 位數字，最後改名「工單」。例如 `12345678.0`→`12345678`。未找到工單號碼欄時，這段八位驗證不執行。
- 從 A1、B1、A2、B2 依序取第一個非空值，填入該檔所有資料列的「工單月份」；不做日期格式解析。
- 合併選中的所有檔案，不做業務鍵去重。
- Excel Model 對照左連接：「機種」→「Model」，補 Model、full PN、PN、PO。Model 去空值、相同 Model 保留第一筆；Excel 連接為精確匹配。
- **畫面另套用 SQLite 型號主檔**：先忽略空白／大小寫精確匹配；找不到再以主檔名稱結尾 `XXXX` 作前綴匹配。命中後覆寫 PN、full PN。
- 畫面按「工單月份」查詢 SQLite 月份主檔並覆寫 PO；查不到即設空字串，**不保留 Excel 對照所補 PO**。
- 初始化型號族群：CHG021-XXXX→S-0060-01(A)／04-NODE；CHG022-XXXX→S-0060-02(A)／06-NODE；CHG023-XXXX→S-0060-03(A)／08-NODE；CHG024-XXXX→S-0060-04(A)／10-NODE；CHG025-XXXX→S-0060-05(A)／12-NODE。
- SQLite 主檔可維護；初始族群不是每次啟動覆寫正式資料。

### 富弘年

- 去欄名前後空白，重複名稱加 `_2`、`_3`；pandas 自行產生的 `.1` 名稱未在此統一回原名。
- 製令單號為 `YYYY-M-D` 或 `YYYY/M/D` 形狀時移除分隔符，不驗證日期、不補月份／日期位數。例如 `2026-1-2`→`202612`。
- 其他純數字且少於 8 位時左補零至 8 位；其他格式保留，NA 變空字串。
- 只輸出保留白名單中的存在欄位，未新增對照表連接或多工單展開。

### 勤誠

- 分頁及表頭提示先做 `normalize_text`：去空白、部分符號並轉小寫；分頁採包含匹配。
- 逐檔回溯，不做額外欄位改名、白名單過濾、去重或特殊值轉換。
- 表頭偵測只需任一提示欄位命中，不驗證七個提示欄位全部存在。

### 赫星

- 第一欄不是一般表頭，而是欄位標籤；Model、PN／PK／P/N、EAN Code／EAN、PCBA／Accessories 等標籤可分散在多列。
- 每個資料欄取 Model 標籤列的非空且不重複值；PN、EAN、PCBA 取同欄相應標籤列的第一個非空值。
- 同欄多個不同 Model 共用 PN、EAN、PCBA，展開為多筆標準橫列。
- 沒有 Model 標籤或沒有可用記錄時明確報錯。
- Model 查詢只取輸入前 6 字元，去前後空白、忽略大小寫後做包含匹配。
- 無自動序號演算法；匯出資料欄位 Model、PN、EAN Code、PCBA。

### Cubepilot

- API 普通橫列解析，第一個非空列當欄名；欄名與資料去前後空白。
- 機種名以不分大小寫的包含匹配查詢。
- 保留 QRCODE、Cube 測試貼紙、note 等資料供畫面；目前未見專用出貨來源清理演算法。
- 流水號生成另列於第 6 節。

### DEG 與 NYX

- DEG 為自訂來源，匯入行為由已保存的 version 1 規則決定；可唯一綁定 DEG 搜尋用途與指定工單欄名。未啟用規則時才沿用全欄、第 1 列表頭、最近 N 檔合併與全欄去重。
- DEG 的三種序號演算法不會自行轉換出貨總表中的 DEG 記錄。
- NYX 已有 Model→PN 主檔、月份→LOT 主檔與維護 API，但本次查到的匯入／查詢流程未消費這些資料。不能把主檔存在視為出貨補值規則已生效。
- NYX 初始化對照：CZG201-XXXX→LPCT-0510-D；CZG202-XXXX→LPCT-0520-D；CZG203-XXXX→LPCT-0530-D；CZG204-XXXX→LPCT-0540-D；CZG205-XXXX→LPCT-0550-D；CZG206-XXXX→ASS-LPCT-PL-9-1-X。

## 5. 共通查詢與字串規則

- API 一般資料：None→空字串，整數形式的 float→整數字串，其他值字串化並去前後空白。`none` 代表不做額外轉換，**仍經上述基礎清理**。
- `arrow` 和 `trim` 是解析規則；未知字串規則目前不報錯，只没有對應處理分支。
- API 欄名匹配去一般空格、前後空白並轉小寫；前端 `normalizeText` 去所有空白並轉小寫。出貨合併的 normalize 又是第三種，匹配語意不完全一致。
- 專用頁面工單查詢：先工單 token 精確匹配，再部分匹配，最後可搜整列其他值；token 分隔包含空白、逗號、分號、`/`，可解析 `*數量`。
- MO 等指定欄位查詢：先 token 精確匹配，再部分匹配，不採整列搜尋。
- 首頁另有跨客戶選擇：工單模式搜營邦工單、倫飛 MO、超恩 MO、KOYA 工單；機種模式搜赫星、Cubepilot。精確命中優先，同級命中優先目前首頁客戶，再按程式順序選取。
- `normalizeRangeText` 統一 `~` 前後空白；無 `~` 且恰好兩個空白分隔 token 時轉為起訖。這是前端區間解析規則，與匯入階段的「到／至」替換不同。

## 6. 序號與匯出規則（獨立於匯入）

| 客戶 | 序號／數量規則 | 匯出工作表與欄位 |
| --- | --- | --- |
| 營邦 | 採單號碼＋固定 `1`＋至少 4 位流水號；計數依工單累加；Datecode=`D`＋YY＋ISO 週數 WW | SN：SN、Datecode、PN |
| 倫飛 | `106`＋WW＋`62`＋至少 5 位流水號；計數按年週鍵；生成數量可按 MO／數量斜線位置配對 | SN：SN；box：P/N、加工WO#、對應PCBA、工單、Model、日期 |
| 超恩 | MAC 起訖全數字採十進位，含 A–F 採十六進位；SN 固定前綴＋十進位尾碼；UUID 尾端必須 17 個 F、前段按十進位尾碼展開；UUID 空或 0 視為無 | SN：序號、MAC Address、uuid1、uuid2、機種名稱、BIOS、FW；BOX：PO、Model、料號、SN、思創PN、Date |
| KOYA | 不產生唯一 SN；按小張貼紙正整數份數重複工單、PN；箱標數量用滿箱數量 | SN：工單、PN；BOX：PO、PN、full PN、DDC PN、DDC LOT、QTY、DATE |
| 赫星 | 匯出已查到資料，無自動 SN | HEX：Model、PN、EAN Code、PCBA |
| Cubepilot | 前綴＋保留起始位數的流水號＋後綴；十進位、十六進位、末位 0–6 循環、末位 1–6 循環；循环例 16→20、16→21 | MES：SN |
| DEG HL | HLDD＋3 位英數產品碼＋YYWW＋5 位流水號；週數 01–53 | SN：SN |
| DEG Pizza Box | 料號＋DD＋年份末位＋WW＋週幾 1–7＋000＋5 位流水號 | SN：SN |
| DEG Pizza Carton | CO＋YYMMDD＋WW＋P＋3 位流水號；日期須有效 | SN：SN |

超恩額外驗證與輸出：

- MAC 區間筆數必須等於 MAC數量；SN 區間筆數等於生產數量；有 UUID 時筆數也須等於生產數量；起訖顛倒或格式錯誤即拒絕。
- 匯出總列數取 MAC／SN／UUID 最大值，較短區間補空值。
- UUID 為「15 位十六進位＋17 個 F」才拆為 uuid1、uuid2；不符合則原值保留於 uuid1。
- 箱標機種以字串 ` 1.` 截斷備註；收料單另用更寬的編號備註格式（含全形句點、頓號）拆分，兩處語意不一致。
- 箱標「思創PN」優先用補值後 Model，無值才回退機種名稱；專用匯出路徑傳當日日期。

DEG 另限制流水號正數，HL／Pizza Box 加數量後不得超過 99999，Pizza Carton 不得超過 999；Pizza Box 料號僅允許英數字及 `. _ / -`，最多 100 字。

後端目前接受超恩／KOYA／赫星／Cubepilot 的前端提供序號清單，並驗證非空筆數等於 qty；它不重新執行客戶演算法驗證序號內容。批量 API 上限 100,000。營邦／倫飛用 zfill，不是嚴格拒絕超過四／五位流水號。

## 7. 共通更新、容錯與格式

- 某客戶失敗不一定讓更新任務失敗：其他客戶有結果時仍可產生總表；失敗客戶若舊總表存在同名分頁，沿用舊資料。
- 所有處理器均無成功結果時停止，不覆蓋原總表；自訂來源亦納入同一成功／失敗分頁機制。
- 自訂來源的名稱就是 Excel 分頁名；保存時限制 31 字、非法符號、與來源／保留分頁名稱衝突等。
- 寫新暫存工作簿、套格式後以原子替換取代總表。
- 格式為標楷體、表頭配色、格線、置中／換行等；屬展示規則，不是資料清理。未辨識的自訂來源用預設表頭色。
- 網頁啟動更新時，日誌預設寫入 DB_PATH 所在目錄，SHIPMENT_LOG_FILE 可覆寫。

## 8. 目前可以在哪裡設定

| 規則 | 現況 |
| --- | --- |
| 九個內建來源路徑、適用的工作表／檔名關鍵字／檔案數 | 資料來源維護＋SQLite；內建來源可恢復環境變數或程式預設 |
| 自訂來源名稱、檔案／資料夾類型、路徑、工作表、關鍵字、檔案數 | 新增時保存；既有來源可改路徑、規則與搜尋用途，名稱／類型建立後不可改 |
| KOYA 型號 PN／full PN、月份 PO | 主檔維護＋SQLite，畫面会消費；非合併程式直接讀 SQLite 主檔 |
| NYX 型號 PN、月份 LOT | 主檔維護＋SQLite；尚未見出貨補值流程 |
| 赫星／Cubepilot 預設來源 | backend/app/core/config.py 的直接讀檔設定；未納入九來源維護 |
| 欄位白名單、別名、表頭偵測、替換、工單清理、多工單拆列 | 自訂來源與四個候選內建來源可用規則表單；特殊處理器仍有固定邏輯 |
| 郵件抽表、同主題 RE/FW 局部更新、跨表連接 | 自訂來源可用進階規則；超恩舊跨底稿流程仍由專用處理器保持相容 |
| DEG／Cubepilot 序號參數 | 各自生成表單，與匯入設定獨立 |

## 9. 後續設定介面可匯總成的規則類型

此節是依現有實作歸納的設定需求，**不是已實作功能**。

| 規則類型 | 必須區分的參數／行為 | 現有實例 |
| --- | --- | --- |
| 來源選取 | 檔案類型、檔名包含、修改時間、排除暫存檔 | 超恩、富弘年、DEG |
| 多檔策略 | 最新一檔、回溯第一有效檔、合併最近 N 檔 | 倫飛、營邦／勤誠、KOYA／DEG |
| 工作表選取 | 完全名稱、名稱包含、多張指定、第一張 | DEG、勤誠、營邦、KOYA Model |
| 表頭 | 固定列、掃描範圍、任一關鍵字、同時命中、找不到的行為 | DEG、營邦、KOYA |
| 欄位 | 白名單及順序、別名改名、位置映射、全部保留、重複欄名策略 | 營邦、倫飛、超恩 EML、勤誠 |
| 字串轉換 | 去空白、箭頭取新值、替換分隔符、移除符號、刪除標記後段 | 營邦、超恩 |
| 工單格式 | 移除小數尾碼、長度／regex 檢查、補零、移除日期分隔符 | KOYA、富弘年 |
| 列過濾 | 全空、指定欄空、任何欄含 Total、關鍵欄有效性 | 超恩、KOYA |
| 拆列與計算 | 多工單分隔、数量解析、乘法、比例分配與捨入 | 超恩 |
| 補值 | 固定儲存格、Excel／SQLite 對照、連接鍵、精確／前綴、找不到留空／保留、覆寫優先序 | KOYA、超恩 |
| 去重／版本 | 全列、業務鍵、保留先／後筆、原始郵件加局部更新 | DEG、FCST、超恩 |
| 特殊版面 | 橫向標籤列轉直向記錄 | 赫星 |

DEG 第一階段最需要的是：表頭列、欄位選取與改名、明確指定欄位的文字轉換／列過濾。郵件與橫向版面等複雜流程不宜直接假設所有來源都需要。

## 10. 核對時發現的差異與限制

1. 畫面與後端 parseRules 不完全一致：赫星畫面 none／後端預設 trim；Cubepilot 畫面 trim／後端預設 none。共同基礎清理仍會去前後空白，但這是兩套設定來源。
2. 營邦多張表一次傳給 pandas.read_excel；指定分頁有缺漏時可能整檔拋錯，之後回溯下一檔，不能僅依內部 `if sheet not in all_sheets` 認定缺頁一定略過。
3. `required_cols` 不等於必需驗證，也不等於保留欄位；勤誠尤其如此。
4. KOYA 有 Excel 精確連接與 SQLite 前綴匹配兩層，且月份主檔 PO 最後覆寫 Excel PO。設定化時必須顯示來源與優先順序。
5. 自訂來源保存成功只證明設定已存，不驗證來源檔存在、讀取權限、工作表可讀或表頭正確。
6. 設定中有 N 檔不代表 N 檔一定全部成功，也不代表每個客戶在總更新成功時都已更新。
7. DEG 有總表分頁與獨立 SN 生成，但尚未有「選 DEG 工單→套規則→生成」整合流程。NYX 亦不能只因主檔已有資料就列作已生效的匯入規則。

## 11. 主要程式依據

- 來源定義／持久化：`backend/app/services/shipment_source_service.py`（SOURCE_DEFINITIONS、build_environment、create_entry）。
- 出貨匯入：`backend/app/tools/shipment_merge.py`（process_alg、process_bag、process_bng、process_chg、process_dcg、process_fzg、process_custom_source、main）。
- 超恩辅助表／郵件：同檔 load_fcst_bng、load_bios_table、read_msg_bng、read_eml_bng、merge_bng_partial_updates_by_partno、split_bng_rows_by_work_order。
- API 解析／赫星版面：`backend/app/services/excel_service.py`（COLUMN_ALIASES、_read_headers、_apply_parse_rules、_parse_hmg_columnar_rows）。
- 畫面設定：`index.html`（CUSTOMERS）、`js/app.js`（enrichKoyaShipmentRows、getLunfeiModelAlert、findHmgRowsByModel）、`js/modules/homeController.js`。
- 主檔：`backend/app/services/koya_model_service.py`、`nyx_model_service.py`、`monthly_reference_service.py`。
- 工單數量：`js/modules/workOrder.js`；字串／區間：`js/modules/utils.js`。
- SN／箱標：`js/modules/excel.js`、`js/modules/serialSettings.js`、`js/modules/deg.js`、`js/modules/bngReceipt.js`。
- 後端序號／匯出：`backend/app/services/sn_service.py`、`deg_service.py`、`export_service.py`。

以下附錄列出 API 真正使用的全部欄位別名；它與第 3／4 節的來源匯入白名單／改名規則不同。


## 附錄 A. API 欄位別名完整清單

### 營邦（yingbang）

| 功能代碼 | 接受欄名（按優先序） |
| --- | --- |
| WORK_ORDER | `工單號`、`工單`、`MO`、`mo`、`製令`、`工單編號` |
| PURCHASE_ORDER | `採單號碼`、`採單`、`採購單號`、`PO`、`PO#` |
| DDC_PART_NO | `DDC料號`、`DDC 料號`、`DDC PN` |
| PRODUCT_NAME | `品名`、`產品名稱`、`MODEL`、`Model`、`型號` |
| PN | `料號`、`P/N`、`PN`、`part number` |
| QTY | `數量`、`Q'ty`、`QTY`、`Qty` |

### 倫飛（lunfei）

| 功能代碼 | 接受欄名（按優先序） |
| --- | --- |
| MO | `MO`、`mo` |
| MODEL | `Model`、`MODEL`、`model` |
| WORK_ORDER | `工單`、`工單號`、`工單編號` |
| PN | `P/N`、`PN`、`料號` |
| PROCESS_WO | `加工WO#`、`加工WO`、`加工工單` |
| PCBA | `對應PCBA`、`PCBA`、`對應板號` |
| QTY | `Q'ty`、`QTY`、`Qty`、`數量` |

### 超恩（bng）

| 功能代碼 | 接受欄名（按優先序） |
| --- | --- |
| MO | `MO`、`mo` |
| DATE | `日期`、`Date` |
| SOURCE | `來源`、`拆分標記`、`拆分註記`、`拆分标记` |
| WORK_ORDER | `工單`、`工單號` |
| MODEL | `機種名稱`、`Model`、`MODEL` |
| PART_NO | `機種料號`、`料號`、`P/N`、`PN` |
| QTY | `生產數量`、`數量`、`QTY`、`Qty` |
| MAC_RANGE | `MAC  Address`、`MAC Address`、`MAC區間` |
| MAC_QTY | `MAC數量` |
| MAC_BOARD_QTY | `MAC板子用量數量`、`MAC板用量數量` |
| SN_RANGE | `序號區間`、`SN區間` |
| UUID_RANGE | `UUID區間`、`UUID` |
| BIOS | `新版BIOS(以此為主)`、`新版BIOS`、`BIOS` |
| FW | `IGN FW版本`、`FW`、`FW版本` |

### KOYA（chg）

| 功能代碼 | 接受欄名（按優先序） |
| --- | --- |
| WORK_ORDER | `工單`、`工單號` |
| WORK_ORDER_MONTH | `工單月份`、`月份`、`工單月` |
| QTY | `小張貼紙`、`QTY`、`Qty`、`數量` |
| MODEL | `機種`、`Model`、`MODEL` |
| PN | `PN`、`P/N`、`料號` |
| BATCH | `批量` |
| PO | `PO`、`PO#` |
| BOX_QTY | `滿箱數量`、`QTY`、`Qty` |
| DEMAND | `需求` |
| TAIL_QTY | `尾數數量` |
| FULL_PN | `full PN`、`FULL PN`、`Full PN` |

### 赫星（hmg）

| 功能代碼 | 接受欄名（按優先序） |
| --- | --- |
| MODEL | `Model`、`MODEL`、`model` |
| PN | `PN`、`P/N`、`PK`、`料號` |
| EAN | `EAN Code`、`EAN`、`條碼` |
| PCBA | `PCBA/Accessories      機種名`、`PCBA/Accessories 機種名`、`PCB/AAccessories`、`PCBA` |

### Cubepilot（clg）

| 功能代碼 | 接受欄名（按優先序） |
| --- | --- |
| MODEL | `機種名`、`機種`、`Model`、`MODEL` |
| QRCODE | `小張QRCODE`、`QRCODE` |
| CUBE_STICKER | `Cube測試用貼紙`、`Cube測試貼紙` |
| NOTE | `note`、`Note`、`備註` |


## 附錄 B. 處理規則程式位置

| 檔案 | 函式 |
| --- | --- |
| shipment_merge.py | [process_alg](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:165) |
| shipment_merge.py | [process_bag](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:273) |
| shipment_merge.py | [process_bng](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:746) |
| shipment_merge.py | [process_chg](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1390) |
| shipment_merge.py | [process_dcg](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1538) |
| shipment_merge.py | [process_fzg](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1616) |
| shipment_merge.py | [process_custom_source](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1862) |
| shipment_merge.py | [load_fcst_bng](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:335) |
| shipment_merge.py | [load_bios_table](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:424) |
| shipment_merge.py | [load_koya_model](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1290) |
| shipment_merge.py | [read_eml_bng](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1062) |
| shipment_merge.py | [merge_bng_partial_updates_by_partno](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:563) |
| shipment_merge.py | [split_bng_rows_by_work_order](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:692) |
| shipment_merge.py | [main](C:/Users/user/PycharmProjects/Serializing/backend/app/tools/shipment_merge.py:1879) |
| excel_service.py | [_read_headers](C:/Users/user/PycharmProjects/Serializing/backend/app/services/excel_service.py:280) |
| excel_service.py | [_apply_parse_rules](C:/Users/user/PycharmProjects/Serializing/backend/app/services/excel_service.py:305) |
| excel_service.py | [_parse_hmg_columnar_rows](C:/Users/user/PycharmProjects/Serializing/backend/app/services/excel_service.py:373) |
| sn_service.py | [generate](C:/Users/user/PycharmProjects/Serializing/backend/app/services/sn_service.py:20) |
| deg_service.py | [build_deg_serials](C:/Users/user/PycharmProjects/Serializing/backend/app/services/deg_service.py:9) |
| export_service.py | [export](C:/Users/user/PycharmProjects/Serializing/backend/app/services/export_service.py:39) |
## v0.3.79 工作樹現況（2026-09-18）

本版文件依目前未提交工作樹同步。現況包含可配置來源規則五階段、自訂來源建立與預覽、舊客戶比較遷移、DEG 編碼、勤誠 FZG 客序／MAC，以及富弘年 `dcg` 首頁搜尋。所有通用來源在更新總表後自動加入首頁工單／MO 搜尋，並使用超恩式摘要、分類卡片、預覽／原始資料頁籤與複製操作，不需新增客戶分支。前端已將主檔維護與來源維護分別抽至 `masterDataMaintenance.js`、`sourceMaintenance.js`。後端 Customer Enum 為 8 個值；現行 API 共 32 組 Method／Path，SQLite 共 8 張表。

部署邊界：`deploy/shipment-release.json` 現為 0.3.79，本機執行 `shipment_check.py --check` 回傳 `errors: []`，清單內檔案雜湊、MIME、模組與來源設定檢查通過。此結果僅代表目前工作區自檢通過；本機未連線正式網路磁碟，亦未驗證正式伺服器部署、服務帳號權限或真實客戶資料比較。

驗證狀態（2026-09-18）：`npm test` 的 7 組前端回歸全部通過（含 Playwright 來源規則瀏覽器流程）；後端完整測試為 `114 passed`；74 個 Python 檔語法解析通過；部署清單自檢無錯誤。

## 0.3.79 文件同步狀態

本文件已於 2026-09-18 依目前工作樹核對；細節以對應階段規格與原始碼為準。工作樹完成不代表正式機已部署。
