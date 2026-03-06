import { parseArrow } from "./utils.js";

export function applyParseRules(value, rules) {
  let parsed = String(value ?? "").trim();
  const activeRules = Array.isArray(rules) && rules.length > 0 ? rules : ["arrow"];

  for (const rule of activeRules) {
    if (rule === "arrow") {
      parsed = parseArrow(parsed);
      continue;
    }
    if (rule === "trim") {
      parsed = String(parsed).trim();
      continue;
    }
  }

  return parsed;
}

export function buildSerialByRule(serialRule, context) {
  const rule = serialRule || {};
  const serialNumber = Number(context?.serialNumber);
  if (!Number.isInteger(serialNumber) || serialNumber <= 0) {
    return "";
  }

  if (rule.type === "po_plus_fixed") {
    const purchaseOrder = String(context?.purchaseOrder ?? "").trim();
    if (!purchaseOrder) {
      return "";
    }
    const fixed = String(rule.fixed ?? "1");
    const padLength = Number(rule.padLength) || 4;
    return `${purchaseOrder}${fixed}${String(serialNumber).padStart(padLength, "0")}`;
  }

  if (rule.type === "lunfei_weekly") {
    const week = String(context?.weekNum2digit ?? "").trim().padStart(2, "0").slice(-2);
    if (!week) {
      return "";
    }
    return `106${week}62${String(serialNumber).padStart(5, "0")}`;
  }

  return "";
}

export function buildWorkbookByStrategy(strategy, args) {
  const active = String(strategy || "single_sn");
  const snList = Array.isArray(args?.snList) ? args.snList : [];
  if (snList.length === 0) {
    throw new Error("沒有可匯出的序號資料。");
  }

  if (active === "dual_sn_box") {
    const boxRecord = args?.boxRecord || {};
    const snRows = [["SN"], ...snList.map((item) => [item.SN ?? ""])];
    const boxRows = [[
      "P/N",
      "加工WO#",
      "對應PCBA",
      "工單",
      "Model",
      "日期"
    ], [
      String(boxRecord.pn ?? ""),
      String(boxRecord.processWo ?? ""),
      String(boxRecord.pcba ?? ""),
      String(boxRecord.workOrder ?? ""),
      String(boxRecord.model ?? ""),
      String(boxRecord.dateText ?? "")
    ]];
    return {
      sheets: [
        { name: "SN", rows: snRows },
        { name: "box", rows: boxRows }
      ]
    };
  }

  const columns = Array.isArray(args?.columns) && args.columns.length > 0
    ? args.columns
    : ["SN"];
  const rows = [columns, ...snList.map((item) => columns.map((column) => item[column] ?? ""))];
  return {
    sheets: [
      { name: "SN", rows }
    ]
  };
}
