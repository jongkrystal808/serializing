import { CONFIG, getActiveCustomerProfile } from "../config.js";
import { HistoryModule } from "./storage.js";
import {
  applyParseRules,
  buildSerialByRule,
  buildWorkbookByStrategy
} from "./customerEngine.js";
import { normalizeRangeText } from "./utils.js";

const BARTENDER_COMPAT_MODE = true;

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
  return list;
}

// 【用途】統一匯出檔名：{客戶名}-SN.xlsx
function buildUnifiedExportFilename() {
  const label = String(getActiveCustomerProfile()?.label ?? "").trim() || "客戶";
  const safeLabel = label
    .replace(/[\\/:*?"<>|]/g, "_")
    .replace(/\s+/g, "_")
    .replace(/\.+$/g, "");
  const extension = BARTENDER_COMPAT_MODE ? "xls" : "xlsx";
  return `${safeLabel}-SN.${extension}`;
}

function getExportMimeType() {
  if (BARTENDER_COMPAT_MODE) {
    return "application/vnd.ms-excel";
  }
  return "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
}

function writeWorkbookArray(workbook) {
  if (BARTENDER_COMPAT_MODE) {
    return window.XLSX.write(workbook, {
      bookType: "xls",
      type: "array",
      bookSST: true
    });
  }
  return window.XLSX.write(workbook, {
    bookType: "xlsx",
    type: "array",
    bookSST: true
  });
}

// 【用途】建立 BarTender 較穩定的 Excel 工作表：全部欄位強制為文字
function buildCompatibleWorksheet(rows) {
  const safeRows = Array.isArray(rows)
    ? rows.map((row) => {
      if (!Array.isArray(row)) {
        return [String(row ?? "")];
      }
      return row.map((cell) => String(cell ?? ""));
    })
    : [];
  const worksheet = window.XLSX.utils.aoa_to_sheet(safeRows, { cellDates: false });
  if (!worksheet["!ref"]) {
    return worksheet;
  }
  const range = window.XLSX.utils.decode_range(worksheet["!ref"]);
  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const cellAddress = window.XLSX.utils.encode_cell({ r: row, c: col });
      const cell = worksheet[cellAddress];
      if (!cell) {
        continue;
      }
      cell.t = "s";
      cell.v = String(cell.v ?? "");
      delete cell.w;
      delete cell.z;
    }
  }
  return worksheet;
}

export function getTodayDateText() {
  const now = new Date();
  const yyyy = String(now.getFullYear());
  const mm = String(now.getMonth() + 1).padStart(2, "0");
  const dd = String(now.getDate()).padStart(2, "0");
  return `${yyyy}/${mm}/${dd}`;
}

function formatBngDateText(source) {
  const text = String(source ?? "").trim();
  if (!text) {
    return getTodayDateText();
  }

  const slashOrDashMatch = text.match(/^(\d{4})[/-](\d{1,2})[/-](\d{1,2})$/);
  if (slashOrDashMatch) {
    const yyyy = slashOrDashMatch[1];
    const mm = String(Number(slashOrDashMatch[2])).padStart(2, "0");
    const dd = String(Number(slashOrDashMatch[3])).padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  }

  const parsed = new Date(text);
  if (!Number.isNaN(parsed.getTime())) {
    const yyyy = String(parsed.getFullYear());
    const mm = String(parsed.getMonth() + 1).padStart(2, "0");
    const dd = String(parsed.getDate()).padStart(2, "0");
    return `${yyyy}/${mm}/${dd}`;
  }

  return text;
}

function formatBngBoxModel(model) {
  const text = String(model ?? "").trim();
  const marker = " 1.";
  const markerIndex = text.indexOf(marker);
  if (markerIndex < 0) {
    return text;
  }
  return text.slice(0, markerIndex).trim();
}

export function buildExportFilename(moInput) {
  return buildUnifiedExportFilename();
}

export function buildBngExportFilename(workOrderInput) {
  return buildUnifiedExportFilename();
}

export function buildChgExportFilename(workOrderInput) {
  return buildUnifiedExportFilename();
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
    const worksheet = buildCompatibleWorksheet(sheet.rows);
    window.XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  const output = writeWorkbookArray(workbook);
  const blob = new Blob(
    [output],
    { type: getExportMimeType() }
  );

  const filename = buildUnifiedExportFilename();
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
    const worksheet = buildCompatibleWorksheet(sheet.rows);
    window.XLSX.utils.book_append_sheet(workbook, worksheet, sheet.name);
  });

  const output = writeWorkbookArray(workbook);
  const blob = new Blob(
    [output],
    { type: getExportMimeType() }
  );

  const filename = buildUnifiedExportFilename();
  window.saveAs(blob, filename);
  return filename;
}

export function exportBngExcel(bundle, workOrderInput) {
  const snRowsData = Array.isArray(bundle?.snRows) ? bundle.snRows : [];
  if (snRowsData.length === 0) {
    throw new Error("沒有可匯出的超恩序號資料。");
  }

  const boxRecord = bundle?.boxRecord || {};
  const snRows = [
    ["序號", "MAC Address", "UUID", "BIOS", "FW"],
    ...snRowsData.map((row) => [
      String(row["序號"] ?? ""),
      String(row["MAC Address"] ?? ""),
      String(row.UUID ?? ""),
      String(row.BIOS ?? ""),
      String(row.FW ?? "")
    ])
  ];
  const boxRows = [[
    "PO",
    "Model",
    "料號",
    "SN",
    "思創PN",
    "Date"
  ], [
    String(boxRecord.PO ?? ""),
    String(boxRecord.Model ?? ""),
    String(boxRecord["料號"] ?? ""),
    String(boxRecord.SN ?? ""),
    String(boxRecord["思創PN"] ?? ""),
    String(boxRecord.Date ?? "")
  ]];

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, buildCompatibleWorksheet(snRows), "SN");
  window.XLSX.utils.book_append_sheet(workbook, buildCompatibleWorksheet(boxRows), "BOX");
  const output = writeWorkbookArray(workbook);
  const blob = new Blob(
    [output],
    { type: getExportMimeType() }
  );
  const filename = buildUnifiedExportFilename();
  window.saveAs(blob, filename);
  return filename;
}

export function generateChgExportBundle(args) {
  const workOrder = String(args?.workOrder ?? "").trim();
  const pn = String(args?.pn ?? "").trim();
  const fullPn = String(args?.fullPn ?? "").trim();
  const model = String(args?.model ?? "").trim();
  const po = String(args?.po ?? "").trim();
  const boxQty = String(args?.boxQty ?? "").trim();
  const labelQty = Number(args?.labelQty);

  if (!workOrder) {
    throw new Error("缺少工單，無法生成。");
  }
  if (!Number.isInteger(labelQty) || labelQty <= 0) {
    throw new Error("小張貼紙必須為正整數。");
  }

  const snRows = Array.from({ length: labelQty }, () => ({
    "工單": workOrder,
    PN: pn
  }));

  const boxRecord = {
    PO: po,
    PN: pn,
    "full PN": fullPn,
    "DDC PN": model,
    "DDC LOT": workOrder,
    QTY: boxQty,
    DATE: getTodayDateText()
  };

  return {
    snRows,
    boxRecord,
    generated: {
      labelQty
    }
  };
}

export function exportChgExcel(bundle, workOrderInput) {
  const snRowsData = Array.isArray(bundle?.snRows) ? bundle.snRows : [];
  if (snRowsData.length === 0) {
    throw new Error("沒有可匯出的 KOYA 標籤資料。");
  }
  const boxRecord = bundle?.boxRecord || {};
  const snRows = [
    ["工單", "PN"],
    ...snRowsData.map((row) => [
      String(row["工單"] ?? ""),
      String(row.PN ?? "")
    ])
  ];
  const boxRows = [[
    "PO",
    "PN",
    "full PN",
    "DDC PN",
    "DDC LOT",
    "QTY",
    "DATE"
  ], [
    String(boxRecord.PO ?? ""),
    String(boxRecord.PN ?? ""),
    String(boxRecord["full PN"] ?? ""),
    String(boxRecord["DDC PN"] ?? ""),
    String(boxRecord["DDC LOT"] ?? ""),
    String(boxRecord.QTY ?? ""),
    String(boxRecord.DATE ?? "")
  ]];

  const workbook = window.XLSX.utils.book_new();
  window.XLSX.utils.book_append_sheet(workbook, buildCompatibleWorksheet(snRows), "SN");
  window.XLSX.utils.book_append_sheet(workbook, buildCompatibleWorksheet(boxRows), "BOX");
  const output = writeWorkbookArray(workbook);
  const blob = new Blob(
    [output],
    { type: getExportMimeType() }
  );
  const filename = buildUnifiedExportFilename();
  window.saveAs(blob, filename);
  return filename;
}

function splitRangeValue(rawValue) {
  const normalized = normalizeRangeText(rawValue);
  if (!normalized) {
    return { normalized: "", start: "", end: "" };
  }
  const parts = normalized.split("~").map((part) => part.trim()).filter(Boolean);
  if (parts.length === 2) {
    return {
      normalized: `${parts[0]} ~ ${parts[1]}`,
      start: parts[0],
      end: parts[1]
    };
  }
  return {
    normalized,
    start: "",
    end: ""
  };
}

function inferRadix(start, end) {
  const text = `${String(start ?? "")}${String(end ?? "")}`.toUpperCase();
  return /[A-F]/.test(text) ? 16 : 10;
}

function toBigInt(value, radix) {
  const raw = String(value ?? "").trim().toUpperCase();
  if (!raw) {
    throw new Error("區間值為空白。");
  }
  if (radix === 16) {
    if (!/^[0-9A-F]+$/.test(raw)) {
      throw new Error(`非有效十六進位值：${raw}`);
    }
    return BigInt(`0x${raw}`);
  }
  if (!/^\d+$/.test(raw)) {
    throw new Error(`非有效十進位值：${raw}`);
  }
  return BigInt(raw);
}

function formatByRadix(valueBigInt, length, radix) {
  if (radix === 16) {
    return valueBigInt.toString(16).toUpperCase().padStart(length, "0");
  }
  return valueBigInt.toString(10).padStart(length, "0");
}

function expandRange(rawValue) {
  const { normalized, start, end } = splitRangeValue(rawValue);
  if (!start || !end) {
    throw new Error(`區間格式錯誤：${normalized || String(rawValue ?? "")}`);
  }

  const radix = inferRadix(start, end);
  const startBig = toBigInt(start, radix);
  const endBig = toBigInt(end, radix);
  if (endBig < startBig) {
    throw new Error(`區間起訖顛倒：${normalized}`);
  }

  const width = Math.max(start.length, end.length);
  const values = [];
  for (let cursor = startBig; cursor <= endBig; cursor += 1n) {
    values.push(formatByRadix(cursor, width, radix));
  }
  return { normalized, values };
}

function expandDecimalTailRange(rawValue, label) {
  const { normalized, start, end } = splitRangeValue(rawValue);
  if (!start || !end) {
    throw new Error(`${label}格式錯誤：${normalized || String(rawValue ?? "")}`);
  }

  const pureDecimal = /^\d+$/.test(start) && /^\d+$/.test(end);
  if (pureDecimal) {
    const startBig = BigInt(start);
    const endBig = BigInt(end);
    if (endBig < startBig) {
      throw new Error(`${label}起訖顛倒：${normalized}`);
    }
    const width = Math.max(start.length, end.length);
    const values = [];
    for (let cursor = startBig; cursor <= endBig; cursor += 1n) {
      values.push(cursor.toString(10).padStart(width, "0"));
    }
    return { normalized, values };
  }

  const startMatch = start.match(/^(.*?)(\d+)$/);
  const endMatch = end.match(/^(.*?)(\d+)$/);
  if (!startMatch || !endMatch || startMatch[1] !== endMatch[1]) {
    throw new Error(`${label}需為固定前綴 + 十進制尾碼區間：${normalized}`);
  }

  const prefix = startMatch[1];
  const startDigits = startMatch[2];
  const endDigits = endMatch[2];
  const startBig = BigInt(startDigits);
  const endBig = BigInt(endDigits);
  if (endBig < startBig) {
    throw new Error(`${label}起訖顛倒：${normalized}`);
  }

  const width = Math.max(startDigits.length, endDigits.length);
  const values = [];
  for (let cursor = startBig; cursor <= endBig; cursor += 1n) {
    values.push(`${prefix}${cursor.toString(10).padStart(width, "0")}`);
  }
  return { normalized, values };
}

function expandUuidRange(rawValue) {
  const source = String(rawValue ?? "").trim();
  if (!source || source === "0") {
    return { normalized: "無", values: [] };
  }
  const { normalized, start, end } = splitRangeValue(source);
  if (!start || !end) {
    throw new Error(`UUID 區間格式錯誤：${normalized || source}`);
  }

  const suffixRegex = /F{17}$/i;
  const startMatch = start.match(suffixRegex);
  const endMatch = end.match(suffixRegex);
  if (!startMatch || !endMatch) {
    throw new Error(`UUID 區間尾碼需為 17 個 F：${normalized}`);
  }

  const startPrefix = start.slice(0, -17);
  const endPrefix = end.slice(0, -17);
  const prefixRange = expandDecimalTailRange(`${startPrefix} ~ ${endPrefix}`, "UUID區間");
  const values = prefixRange.values.map((value) => `${value}FFFFFFFFFFFFFFFFF`);
  return { normalized: `${start} ~ ${end}`, values };
}

export function generateBngSerialBundle(args) {
  const workOrder = String(args?.workOrder ?? "").trim();
  const model = String(args?.model ?? "").trim();
  const systronPn = String(args?.systronPn ?? "").trim();
  const partNo = String(args?.partNo ?? "").trim();
  const dateText = formatBngDateText(args?.dateText);
  const qty = Number(args?.qty);
  const macQty = Number(args?.macQty);
  const macRangeRaw = String(args?.macRange ?? "").trim();
  const snRangeRaw = String(args?.snRange ?? "").trim();
  const uuidRangeRaw = String(args?.uuidRange ?? "").trim();
  const bios = String(args?.bios ?? "").trim();
  const fw = String(args?.fw ?? "").trim();

  if (!workOrder) {
    throw new Error("缺少工單，無法生成。");
  }
  if (!Number.isInteger(qty) || qty <= 0) {
    throw new Error("生產數量必須為正整數。");
  }

  const macRange = expandRange(macRangeRaw);
  const snRange = expandDecimalTailRange(snRangeRaw, "序號區間");
  const uuidRange = expandUuidRange(uuidRangeRaw);

  if (!Number.isInteger(macQty) || macQty <= 0) {
    throw new Error("MAC數量必須為正整數。");
  }
  if (macRange.values.length !== macQty) {
    throw new Error(`MAC 區間筆數 (${macRange.values.length}) 與 MAC數量 (${macQty}) 不一致。`);
  }
  if (snRange.values.length !== qty) {
    throw new Error(`序號區間筆數 (${snRange.values.length}) 與 生產數量 (${qty}) 不一致。`);
  }
  if (uuidRange.values.length > 0 && uuidRange.values.length !== qty) {
    throw new Error(`UUID 區間筆數 (${uuidRange.values.length}) 與 生產數量 (${qty}) 不一致。`);
  }

  const totalRows = Math.max(snRange.values.length, macRange.values.length, uuidRange.values.length || 0);
  const uuidFallback = uuidRange.values.length === 0 ? "無" : "";
  const snRows = Array.from({ length: totalRows }, (_, index) => ({
    "序號": snRange.values[index] || "",
    "MAC Address": macRange.values[index] || "",
    UUID: uuidRange.values[index] || uuidFallback,
    BIOS: index < qty ? bios : "",
    FW: index < qty ? fw : ""
  }));

  const boxRecord = {
    PO: workOrder,
    Model: formatBngBoxModel(model),
    "料號": partNo,
    SN: snRange.normalized,
    "思創PN": systronPn || model,
    Date: dateText
  };

  return {
    exportRows: snRows,
    snRows,
    boxRecord,
    generated: {
      macList: macRange.values,
      snList: snRange.values,
      uuidList: uuidRange.values
    },
    normalizedRanges: {
      mac: macRange.normalized,
      sn: snRange.normalized,
      uuid: uuidRange.normalized
    }
  };
}
