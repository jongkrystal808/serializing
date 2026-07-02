export function normalizeClgBase(rawBase) {
  const value = String(rawBase ?? "10").trim();
  if (value === "16") {
    return "16";
  }
  if (value === "cycle_0_6") {
    return "cycle_0_6";
  }
  if (value === "cycle_1_6") {
    return "cycle_1_6";
  }
  return "10";
}

export function getClgInputValues(ui) {
  return {
    prefix: String(ui?.clgPrefixInput?.value ?? "").trim(),
    startSerial: String(ui?.clgStartInput?.value ?? "").trim(),
    countText: String(ui?.clgCountInput?.value ?? "").trim(),
    suffix: String(ui?.clgSuffixInput?.value ?? "").trim(),
    base: normalizeClgBase(ui?.clgBaseSelect?.value)
  };
}

function toBigIntByBase(text, base) {
  const value = String(text ?? "").trim().toUpperCase();
  if (!value) {
    throw new Error("起始流水號不可空白。");
  }
  if (base === "16") {
    if (!/^[0-9A-F]+$/.test(value)) {
      throw new Error("起始流水號格式不正確（16 進制只允許 0-9、A-F）。");
    }
    return BigInt(`0x${value}`);
  }
  if (base === "cycle_0_6") {
    if (!/^\d+$/.test(value)) {
      throw new Error("起始流水號格式不正確（0–6 循環進位制只允許數字）。");
    }
    if (!/[0-6]$/.test(value)) {
      throw new Error("起始流水號格式不正確（0–6 循環進位制個位數必須是 0~6）。");
    }
    return BigInt(value);
  }
  if (base === "cycle_1_6") {
    if (!/^\d+$/.test(value)) {
      throw new Error("起始流水號格式不正確（1–6 循環進位制只允許數字）。");
    }
    if (!/[1-6]$/.test(value)) {
      throw new Error("起始流水號格式不正確（1–6 循環進位制個位數必須是 1~6）。");
    }
    return BigInt(value);
  }
  if (!/^\d+$/.test(value)) {
    throw new Error("起始流水號格式不正確（10 進制只允許數字）。");
  }
  return BigInt(value);
}

function formatByBase(valueBigInt, base) {
  if (base === "16") {
    return valueBigInt.toString(16).toUpperCase();
  }
  return valueBigInt.toString(10);
}

function getNextCycle06Value(currentValue) {
  const lastDigit = currentValue % 10n;
  if (lastDigit >= 0n && lastDigit <= 5n) {
    return currentValue + 1n;
  }
  if (lastDigit === 6n) {
    return currentValue + 4n;
  }
  throw new Error("0–6 循環進位制計算失敗：序號個位數必須介於 0~6。");
}

function getNextCycle16Value(currentValue) {
  const lastDigit = currentValue % 10n;
  if (lastDigit >= 1n && lastDigit <= 5n) {
    return currentValue + 1n;
  }
  if (lastDigit === 6n) {
    return currentValue + 5n;
  }
  throw new Error("1–6 循環進位制計算失敗：序號個位數必須介於 1~6。");
}

function getNextClgValue(currentValue, base) {
  if (base === "cycle_0_6") {
    return getNextCycle06Value(currentValue);
  }
  if (base === "cycle_1_6") {
    return getNextCycle16Value(currentValue);
  }
  return currentValue + 1n;
}

export function buildClgSerialList(inputs) {
  const prefix = String(inputs?.prefix ?? "");
  const startSerial = String(inputs?.startSerial ?? "").trim();
  const suffix = String(inputs?.suffix ?? "");
  const base = normalizeClgBase(inputs?.base);
  const countRaw = inputs?.count ?? inputs?.countText;
  const count = Number(countRaw);

  if (!startSerial) {
    throw new Error("請輸入起始流水號。");
  }
  if (!Number.isInteger(count) || count <= 0) {
    throw new Error("請輸入正確的生成數量。");
  }

  const startValue = toBigIntByBase(startSerial, base);
  const serialWidth = startSerial.length;
  const serials = [];
  let current = startValue;

  for (let index = 0; index < count; index += 1) {
    const core = formatByBase(current, base).padStart(serialWidth, "0");
    serials.push(`${prefix}${core}${suffix}`);
    current = getNextClgValue(current, base);
  }

  return serials;
}

export function buildClgPlannedSerialPreview(inputs, getErrorMessage) {
  const prefix = String(inputs?.prefix ?? "");
  const startSerial = String(inputs?.startSerial ?? "").trim();
  const suffix = String(inputs?.suffix ?? "");
  const base = normalizeClgBase(inputs?.base);
  const count = Number(inputs?.countText);

  try {
    if (!startSerial) {
      throw new Error("請輸入起始流水號，才能預覽序號。");
    }
    if (!Number.isInteger(count) || count <= 0) {
      throw new Error("請輸入正確的生成數量，才能預覽序號。");
    }
    const startValue = toBigIntByBase(startSerial, base);
    const serialWidth = startSerial.length;
    const firstTen = [];
    const lastTen = [];
    let current = startValue;

    for (let index = 0; index < count; index += 1) {
      const core = formatByBase(current, base).padStart(serialWidth, "0");
      const serialText = `${prefix}${core}${suffix}`;
      if (firstTen.length < 10) {
        firstTen.push(serialText);
      }
      if (lastTen.length === 10) {
        lastTen.shift();
      }
      lastTen.push(serialText);
      current = getNextClgValue(current, base);
    }

    return {
      total: count,
      firstTen,
      lastTen,
      error: ""
    };
  } catch (error) {
    return {
      total: 0,
      firstTen: [],
      lastTen: [],
      error: typeof getErrorMessage === "function" ? getErrorMessage(error) : String(error?.message ?? error)
    };
  }
}
