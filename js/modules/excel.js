import { CONFIG, getActiveCustomerProfile } from "../config.js";
import { HistoryModule } from "./storage.js";
import {
  applyParseRules,
  buildSerialByRule,
  buildWorkbookByStrategy
} from "./customerEngine.js";

export function verifyDependencies() {
  return typeof window.XLSX !== "undefined" && typeof window.saveAs !== "undefined";
}

export function extractSheetData(workbook) {
  const worksheet = workbook.Sheets[CONFIG.SHEET_NAME];
  if (!worksheet) {
    throw new Error(`找不到工作表「${CONFIG.SHEET_NAME}」`);
  }

  const rawRows = window.XLSX.utils.sheet_to_json(worksheet, {
    defval: "",
    raw: false
  });

  return rawRows.map((row) => {
    const parsedRow = {};
    const profile = getActiveCustomerProfile();
    const parseRules = profile?.parseRules || ["arrow"];
    Object.keys(row).forEach((key) => {
      parsedRow[String(key).trim()] = applyParseRules(row[key], parseRules);
    });
    return parsedRow;
  });
}

export function loadExcel(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = (event) => {
      try {
        const arrayBuffer = event.target.result;
        const workbook = window.XLSX.read(arrayBuffer, { type: "array" });
        resolve(extractSheetData(workbook));
      } catch (error) {
        reject(error);
      }
    };
    reader.onerror = () => reject(new Error("檔案讀取失敗，請重新選擇 Excel 檔案。"));
    reader.readAsArrayBuffer(file);
  });
}

function getISOWeek(date) {
  const target = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
  const dayNum = target.getUTCDay() || 7;
  target.setUTCDate(target.getUTCDate() + 4 - dayNum);
  const yearStart = new Date(Date.UTC(target.getUTCFullYear(), 0, 1));
  return Math.ceil(((target - yearStart) / 86400000 + 1) / 7);
}

export function getCurrentWeekNumber2Digits() {
  return String(getISOWeek(new Date())).padStart(2, "0");
}

export function getLunfeiWeekKey() {
  const year = new Date().getFullYear();
  return `${year}-W${getCurrentWeekNumber2Digits()}`;
}

export function buildLunfeiSN(weekNum2digit, serialNumber) {
  return buildSerialByRule(
    { type: "lunfei_weekly" },
    { weekNum2digit, serialNumber }
  );
}

function getTodayYmd() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

export function getDatecode() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const ww = String(getISOWeek(now)).padStart(2, "0");
  return `D${yy}${ww}`;
}

export function buildSN(purchaseOrder, serialNumber) {
  const profile = getActiveCustomerProfile();
  const serialRule = profile?.serialRule || { type: "po_plus_fixed", fixed: "1", padLength: 4 };
  return buildSerialByRule(serialRule, {
    purchaseOrder,
    serialNumber
  });
}

export function buildPreviewSN(workOrder, purchaseOrder) {
  const key = String(purchaseOrder ?? "").trim();
  if (!key) {
    return "";
  }
  const nextSerial = HistoryModule.getLastSerial(key) + 1;
  return buildSN(purchaseOrder, nextSerial);
}

export function generateSNList(args) {
  const qtyNum = Number(args?.qty);
  const purchaseOrder = String(args?.purchaseOrder ?? "").trim();
  const pn = String(args?.pn ?? "").trim();
  if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
    throw new Error("Q'ty 必須為正整數。");
  }
  if (!purchaseOrder) {
    throw new Error("缺少採單號碼，無法生成序號。");
  }

  const historyKey = purchaseOrder;
  const lastSerial = HistoryModule.getLastSerial(historyKey);
  const list = [];
  const datecode = getDatecode();

  for (let i = 1; i <= qtyNum; i += 1) {
    list.push({
      SN: buildSN(purchaseOrder, lastSerial + i),
      Datecode: datecode,
      PN: pn,
      QTY: qtyNum
    });
  }

  HistoryModule.updateHistory(historyKey, qtyNum);
  return list;
}

export function generateLunfeiSNList(mo, qty) {
  const moValue = String(mo ?? "").trim();
  const qtyNum = Number(qty);
  if (!moValue) {
    throw new Error("缺少 MO，無法生成倫飛序號。");
  }
  if (!Number.isInteger(qtyNum) || qtyNum <= 0) {
    throw new Error("Q'ty 必須為正整數。");
  }

  const weekKey = getLunfeiWeekKey();
  const weekNum2 = getCurrentWeekNumber2Digits();
  const lastSerial = HistoryModule.getLastSerial(weekKey);
  const list = [];

  for (let i = 1; i <= qtyNum; i += 1) {
    list.push({
      SN: buildLunfeiSN(weekNum2, lastSerial + i)
    });
  }

  HistoryModule.updateHistory(weekKey, qtyNum);
  HistoryModule.appendWorkOrderHistory(moValue, `${getTodayYmd()}-${moValue}`);
  return list;
}

function getTodayStamp() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}${mm}${dd}`;
}

export function getTodayDateText() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

export function buildExportFilename(moInput) {
  const base = String(moInput ?? "").trim();
  const safe = base
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "");
  const datePart = getTodayStamp();
  return safe ? `${datePart}-${safe}.xlsx` : `${datePart}.xlsx`;
}

export function exportExcel(snList, moInput) {
  if (!Array.isArray(snList) || snList.length === 0) {
    throw new Error("沒有可匯出的序號資料。");
  }

  const profile = getActiveCustomerProfile();
  const workbookData = buildWorkbookByStrategy(profile?.exportStrategy, {
    snList,
    columns: profile?.exportColumns
  });
  const workbook = window.XLSX.utils.book_new();
  workbookData.sheets.forEach((sheet) => {
    const worksheet = window.XLSX.utils.aoa_to_sheet(sheet.rows);
    window.XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  const output = window.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob(
    [output],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  const filename = buildExportFilename(moInput);
  window.saveAs(blob, filename);
  return filename;
}

export function exportLunfeiExcel(snList, boxRecord, moInput) {
  if (!Array.isArray(snList) || snList.length === 0) {
    throw new Error("沒有可匯出的倫飛序號資料。");
  }

  const profile = getActiveCustomerProfile();
  const workbookData = buildWorkbookByStrategy(profile?.exportStrategy || "dual_sn_box", {
    snList,
    boxRecord
  });
  const workbook = window.XLSX.utils.book_new();
  workbookData.sheets.forEach((sheet) => {
    const worksheet = window.XLSX.utils.aoa_to_sheet(sheet.rows);
    window.XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  const output = window.XLSX.write(workbook, { bookType: "xlsx", type: "array" });
  const blob = new Blob(
    [output],
    { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" }
  );

  const filename = buildExportFilename(moInput);
  window.saveAs(blob, filename);
  return filename;
}
