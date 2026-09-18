> **歷史文件現況補充（2026-09-18／工作樹 v0.3.79）**
> 下文保留當時版本，不代表目前功能或驗收結果。現況已包含來源規則五階段、通用來源自動搜尋與超恩式渲染、富弘年首頁搜尋、勤誠 FZG、DEG，以及主檔／來源維護模組拆分；API 32 組、SQLite 8 表。
> 本機驗證：7 組前端回歸、後端 114 tests、74 個 Python 檔解析及 0.3.79 release check 全部通過；正式伺服器與真實網路磁碟資料尚未驗收。
> 請以 [架構](../architecture.md)、[任務](../task.md)、[更新](../update.md)、[排查](../debug.md)、[規則規格](../source-rules-spec.md)、[遷移](../source-rules-stage5.md) 與 [搜尋](../source-search.md) 為準。

# T27 Test Report（新架構全流程整合測試）

**Date:** 2026-03-12  
**Runner:** `backend/tests/t27_integration_runner.py`  
**Command:** `.venv\Scripts\python backend\tests\t27_integration_runner.py`  
**Test DB:** `backend/data/sn_generator_t27.db`（每次測試前重建）

---

## 1. Summary

- Total: 5
- Pass: 5
- Fail: 0
- Blocking issues (P0/P1): 0

Acceptance Criteria 檢核：
- [x] 四客戶核心場景全部通過
- [x] 無阻斷性錯誤（P0/P1）
- [x] 測試結果可追溯（本報告 + 可重跑腳本）

---

## 2. Case Results

1. `T27-01` 營邦完整流程（解析/生成/匯出/歷史）: PASS  
   解析 `營邦出貨` 成功；`WO001` 生成 2 筆 SN（`PO00110001`, `PO00110002`）；匯出成功；歷史 key=`WO001`，`last_serial=2`。

2. `T27-02` 倫飛完整流程（含週重置）: PASS  
   同週 `2026-W11` 連續生成（2 筆後再 1 筆）接續正常；跨週 `2026-W12` 從 1 重新起算；匯出成功；歷史 `W11=3`, `W12=1`。

3. `T27-03` 超恩完整流程（區間展開與筆數驗證）: PASS  
   解析 `超恩出貨` 成功；`BMO001` 以 `provided_serials` 生成 2 筆；匯出成功；歷史 key=`BMO001`，`last_serial=2`（key 使用 MO）。

4. `T27-04` KOYA 完整流程（Label/Box 匯出）: PASS  
   解析 `KOYA出貨` 成功；`CWO001` 生成 2 筆；`SN+BOX` 匯出成功；歷史 key=`CWO001`，`last_serial=2`。

5. `T27-05` 失敗情境測試: PASS  
   - 找不到 sheet -> `SHEET_NOT_FOUND`  
   - `provided_serials` 筆數不符 -> `INVALID_PROVIDED_SERIALS`  
   - 非法 customer -> `UNSUPPORTED_CUSTOMER`  
   - 營邦缺 `purchase_order` -> `MISSING_PURCHASE_ORDER`

---

## 3. Notes

- 本次測試使用 `tmp_t25.xlsx` 作為四客戶整合樣本。
- 測試涵蓋 API 路由層 + service 層 + SQLite 持久化 + 匯出串流回應。
- 測試為可重跑腳本，後續回歸可直接重用。
