import { normalizeRangeText } from "./utils.js";

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
  const serial = Number(serialNumber);
  if (!Number.isInteger(serial) || serial <= 0) {
    return "";
  }
  const week = String(weekNum2digit ?? "").trim().padStart(2, "0").slice(-2);
  if (!week) {
    return "";
  }
  return `106${week}62${String(serial).padStart(5, "0")}`;
}

export function getDatecode() {
  const now = new Date();
  const yy = String(now.getFullYear()).slice(-2);
  const ww = String(getISOWeek(now)).padStart(2, "0");
  return `D${yy}${ww}`;
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

function splitBngUuidForExport(value) {
  const text = String(value ?? "").trim();
  if (!text || text === "無") {
    return {
      uuid1: text,
      uuid2: ""
    };
  }
  const matched = text.match(/^([0-9A-F]{15})(F{17})$/i);
  if (!matched) {
    return {
      uuid1: text,
      uuid2: ""
    };
  }
  return {
    uuid1: matched[1].toUpperCase(),
    uuid2: matched[2].toUpperCase()
  };
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

export function generateBngSerialBundle(args) {
  const workOrder = String(args?.workOrder ?? "").trim();
  const model = String(args?.model ?? "").trim();
  const normalizedModel = formatBngBoxModel(model);
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
  const snRows = Array.from({ length: totalRows }, (_, index) => {
    const uuidParts = splitBngUuidForExport(uuidRange.values[index] || uuidFallback);
    return {
      "序號": snRange.values[index] || "",
      "MAC Address": macRange.values[index] || "",
      uuid1: uuidParts.uuid1,
      uuid2: uuidParts.uuid2,
      "機種名稱": index < qty ? normalizedModel : "",
      BIOS: index < qty ? bios : "",
      FW: index < qty ? fw : ""
    };
  });

  const boxRecord = {
    PO: workOrder,
    Model: normalizedModel,
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
