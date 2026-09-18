const TRANSFORMS = {
  trim: ["去前後空白", {}], arrow_last: ["箭頭取最後新值", {}],
  replace: ["文字替換", { old: "原文字", new: "新文字（可留空）" }],
  remove_chars: ["移除指定字元", { chars: "要移除的字元" }],
  strip_integer_decimal: ["移除整數的小數尾碼", {}],
  zero_pad: ["數字左補零", { width: "位數" }],
  coalesce: ["按候選欄補值", { fields: { label: "候選欄（每列一個）", type: "textarea", required: true }, overwrite: { label: "覆寫", options: { if_empty: "只補空值", always: "總是覆寫" } } }],
  date_format: ["日期／月份轉換", { input_format: "日期輸入格式（如 %Y-%m-%d）", output_format: "輸出格式（如 %Y-%m）" }]
};
const FILTERS = {
  drop_empty_rows: ["排除全空列", {}],
  drop_empty_field: ["排除指定欄空值", { field: "欄名" }],
  drop_contains: ["排除包含文字的列", { fields: "欄名（每列一個，留空查全部）", value: "包含文字", case_sensitive: "區分大小寫" }],
  keep_digits: ["只保留固定長度數字", { field: "欄名", length: "位數" }]
};
const lines = (text) => String(text || "").split(/\r?\n/).map((item) => item.trim()).filter(Boolean);
const selectParam = (label, options) => ({ label, options });
const duplicate = selectParam("重複鍵", { error: "報錯", first: "取第一筆", last: "取最後一筆" });
const lookupParams = {
  keys: { label: "查找鍵（每列：資料欄=對照欄）", type: "textarea", required: true },
  fields: { label: "補值欄（每列：對照欄=輸出欄=if_empty 或 always）", type: "textarea", required: true },
  match: selectParam("匹配", { exact: "精確", family_prefix: "先精確，再匹配 XXXX 族群" }),
  key_match: selectParam("鍵比對", { trim_casefold: "去前後空白、忽略大小寫", exact: "完全一致", compact_casefold: "去全部空白、忽略大小寫" }),
  duplicate_keys: duplicate,
  on_unmatched: selectParam("未匹配", { keep: "保留原值", blank: "清空", error: "報錯" }),
  on_source_error: selectParam("對照來源失敗", { error: "停止來源", blank: "清空輸出並警告" })
};
const ADVANCED = {
  cell_values: { cell: ["儲存格補值／月份擷取", {
    target: "輸出欄", cells: { label: "儲存格（每列一個，依序取第一非空值）", type: "textarea", required: true },
    format: selectParam("格式", { raw: "原文字", date: "日期轉換" }),
    input_format: { label: "日期輸入格式", value: "%Y-%m-%d", required: false },
    output_format: { label: "日期輸出格式", value: "%Y-%m", required: false },
    overwrite: selectParam("覆寫", { always: "總是覆寫", if_empty: "只補空值" }),
    on_empty: selectParam("儲存格全空", { error: "報錯", blank: "填空白", keep: "保留原值" })
  }] },
  lookups: Object.fromEntries([["excel", "Excel對照"], ["koya_model", "KOYA型號主檔"], ["nyx_model", "NYX型號主檔"], ["koya_month", "KOYA月份PO主檔"], ["nyx_month", "NYX月份LOT主檔"]].map(([key, label]) => [key, [label, {
    ...(key === "excel" ? { path: "Excel路徑", sheet: { label: "工作表（留空第一頁）", required: false }, header_row: { label: "表頭列", type: "number", value: 1, max: 1000 } } : {}), ...lookupParams
  }]])),
  splits: { split: ["多工單拆列／用量計算", {
    field: "工單欄", separators: { label: "分隔符（每列一個；空白請填 SPACE，換行請填 NEWLINE）", type: "textarea", value: "/\n;\nNEWLINE", required: true },
    quantity_marker: { label: "數量標記", value: "*" }, quantity_field: { label: "數量輸出欄（留空不覆寫）", required: false },
    calculate: selectParam("用量計算", { none: "不計算", multiply: "數量 × 單位用量", proportional: "按數量比例分配原總用量" }),
    unit_field: { label: "單位用量欄（乘法必填）", required: false }, total_field: { label: "總用量欄（計算必填）", required: false },
    mark_field: { label: "拆列標記欄（可留空）", required: false }, apply_single: { label: "單工單也套用數量／計算", type: "checkbox" }, duplicate_keys: duplicate,
    rounding: selectParam("比例捨入", { half_even: "四捨六入五取偶", half_up: "四捨五入", floor: "向下取整", ceil: "向上取整" }),
    remainder: selectParam("比例差額分配", { largest: "分配給最大數量工單", first: "分配給第一筆", error: "有差額就報錯" })
  }] }
};
const kinds = ["columns", "transforms", "filters", ...Object.keys(ADVANCED)];

function pairLines(text, name) {
  // ponytail: 每列以=配對，欄名含=時改用獨立欄位輸入。
  return lines(text).map((line) => {
    const parts = line.split("=").map((part) => part.trim());
    if (parts.length < 2 || parts.length > (name === "keys" ? 2 : 3) || !parts[0] || !parts[1]) throw new Error(`配對格式無效：${line}`);
    return name === "keys" ? { field: parts[0], lookup: parts[1] } : { lookup: parts[0], target: parts[1], overwrite: parts[2] || "if_empty" };
  });
}

export function describeSourceRules(entry) {
  const rules = entry.rules;
  if (!rules) return "";
  const fields = rules.column_mode === "select" ? `指定欄位：${rules.columns.map((item) => item.name).join("、")}` : "保留全部欄位";
  return `${fields}；表頭：${rules.header_mode === "scan" ? "關鍵字掃描" : `第${rules.header_row}列`}；轉換${rules.transforms.length}項／過濾${rules.filters.length}項；擷取${rules.cell_values?.length || 0}項／拆列${rules.splits?.length || 0}項／對照${rules.lookups?.length || 0}項`;
}

export function createSourceRulesEditor(form) {
  const root = document.getElementById("shipment-source-rules");
  const enabled = form.elements.namedItem("source-rules-enabled");
  const control = (name) => form.elements.namedItem(`source-rule-${name}`);
  const mailControl = (name) => form.elements.namedItem(`source-mail-${name}`);
  const sections = Object.fromEntries(kinds.map((name) => [name, root.querySelector(`[data-rule-rows="${name}"]`)]));
  let custom = false;
  let sourceIsCustom = false;

  function input(labelText, type = "text", value = "", required = false) {
    const label = document.createElement("label");
    label.append(document.createTextNode(labelText));
    const node = document.createElement(type === "textarea" ? "textarea" : "input");
    if (type !== "textarea") node.type = type;
    if (type === "checkbox") node.checked = Boolean(value);
    else node.value = value;
    node.required = required;
    if (type === "number") { node.min = "1"; node.max = "100"; node.step = "1"; }
    if (["text", "textarea"].includes(type)) { node.maxLength = 20000; node.spellcheck = false; }
    label.append(node);
    return { label, node };
  }

  function row(container) {
    const node = document.createElement("div");
    node.className = "source-rule-row";
    const actions = document.createElement("div");
    actions.className = "source-rule-row-actions";
    for (const [text, action] of [["上移", () => { if (node.previousElementSibling) container.insertBefore(node, node.previousElementSibling); }],
      ["下移", () => { if (node.nextElementSibling) container.insertBefore(node.nextElementSibling, node); }], ["移除", () => node.remove()]]) {
      const button = document.createElement("button");
      button.type = "button"; button.className = "btn-secondary"; button.textContent = text;
      button.addEventListener("click", action); actions.append(button);
    }
    node.append(actions); container.append(node);
    return node;
  }

  function addColumn(item = { name: "", aliases: [], required: false }) {
    const node = row(sections.columns);
    for (const [name, text, type, value, required] of [
      ["name", "輸出欄名", "text", item.name, true],
      ["aliases", "原始／候選欄名（每列一個）", "textarea", (item.aliases || []).join("\n"), true],
      ["position", "原始欄位置（從1起算；留空使用候選欄名）", "number", item.position || "", false],
      ["required", "必需欄位", "checkbox", item.required, false]]) {
      const field = input(text, type, value, required);
      field.node.dataset.param = name; node.insertBefore(field.label, node.lastElementChild);
      if (name === "position") field.node.max = "200";
    }
    sync();
  }

  function addOperation(kind, item = {}) {
    const available = ADVANCED[kind] || (kind === "transforms" ? TRANSFORMS : FILTERS);
    const node = row(sections[kind]);
    const label = document.createElement("label"); label.append(document.createTextNode("操作"));
    const select = document.createElement("select"); select.dataset.param = kind === "lookups" ? "kind" : "op";
    for (const [value, [text]] of Object.entries(available)) {
      const option = document.createElement("option"); option.value = value; option.textContent = text; select.append(option);
    }
    select.value = item[select.dataset.param] || Object.keys(available)[0]; label.append(select); node.insertBefore(label, node.lastElementChild);
    const params = document.createElement("div"); params.className = "source-rule-params";
    node.insertBefore(params, node.lastElementChild);
    function populate(values) {
      params.replaceChildren();
      const fields = kind === "transforms" ? { field: "欄名（改名後）", ...available[select.value][1] } : available[select.value][1];
      for (const [name, descriptor] of Object.entries(fields)) {
        const spec = typeof descriptor === "string" ? { label: descriptor } : descriptor;
        const type = spec.type || (name === "case_sensitive" ? "checkbox" : ["width", "length"].includes(name) ? "number" : name === "fields" ? "textarea" : "text");
        let value = values[name] ?? spec.value ?? (["width", "length"].includes(name) ? 8 : "");
        if (kind === "lookups" && ["keys", "fields"].includes(name)) value = (values[name] || []).map((pair) => name === "keys" ? `${pair.field}=${pair.lookup}` : `${pair.lookup}=${pair.target}=${pair.overwrite || "if_empty"}`).join("\n");
        else if (["fields", "cells", "separators"].includes(name) && Array.isArray(value)) value = value.map((part) => part === " " ? "SPACE" : part === "\n" ? "NEWLINE" : part).join("\n");
        else if (name === "fields" && value === "all") value = "";
        const field = input(spec.label, type, value, spec.required ?? !["new", "fields", "case_sensitive", "apply_single"].includes(name));
        if (spec.max) field.node.max = spec.max;
        if (spec.options) {
          const selector = document.createElement("select");
          for (const [key, text] of Object.entries(spec.options)) { const option = document.createElement("option"); option.value = key; option.textContent = text; selector.append(option); }
          selector.value = value || Object.keys(spec.options)[0];
          field.node.replaceWith(selector); field.node = selector;
        }
        field.node.dataset.param = name; params.append(field.label);
      }
      sync();
    }
    select.addEventListener("change", () => populate({})); populate(item);
  }

  function visible(name, show) {
    const node = control(name);
    node.parentElement.hidden = !show;
    node.disabled = !show || !custom || !enabled.checked;
  }

  function sync() {
    sections.columns.querySelectorAll(".source-rule-row").forEach((node) => { node.querySelector('[data-param="aliases"]').required = !node.querySelector('[data-param="position"]').value; });
    root.hidden = !custom;
    enabled.disabled = !custom;
    const active = custom && enabled.checked;
    root.querySelector("[data-rule-settings]").hidden = !active;
    root.querySelectorAll("[data-rule-settings] input, [data-rule-settings] select, [data-rule-settings] textarea, [data-rule-settings] button").forEach((node) => { node.disabled = !active; });
    visible("sheet_names", control("sheet_mode").value === "list");
    visible("sheet_match", control("sheet_mode").value !== "first");
    visible("header_row", control("header_mode").value === "fixed");
    for (const name of ["scan_rows", "header_keywords", "keyword_condition", "keyword_match", "header_match"]) visible(name, control("header_mode").value === "scan");
    const sheet = document.getElementById("shipment-source-sheet-rule");
    const mailPanel = root.querySelector("[data-mail-settings]");
    mailPanel.hidden = control("input_format").value === "excel";
    mailPanel.querySelectorAll("input, select, textarea").forEach((node) => { node.disabled = !active || mailPanel.hidden; });
    if (sourceIsCustom) {
      sheet.parentElement.hidden = false;
      sheet.required = true;
      sheet.disabled = false;
    } else if (custom) {
      const usesSheet = !active || ["exact", "contains"].includes(control("sheet_mode").value);
      sheet.parentElement.hidden = !usesSheet;
      sheet.required = active && usesSheet;
      sheet.disabled = !usesSheet;
    } else sheet.disabled = false;
  }

  root.addEventListener("change", sync);
  root.addEventListener("input", (event) => { if (event.target.dataset.param === "position") sync(); });
  for (const kind of kinds) root.querySelector(`[data-add-rule="${kind}"]`).addEventListener("click", () => {
    if (sections[kind].children.length >= 200) return;
    if (kind === "columns") addColumn(); else addOperation(kind);
  });

  return {
    load(entry) {
      custom = Boolean(entry.is_custom || entry.rule_editable);
      sourceIsCustom = Boolean(entry.is_custom);
      const rules = entry.rules || entry.rule_template || {};
      if (entry.rules && rules.version !== 1) throw new Error("此頁面不支援已保存的匯入規則版本，請更新前端");
      enabled.checked = Boolean(entry.rules || entry.rule_template);
      const defaults = {
        file_strategy: "merge_recent", sheet_mode: entry.sheet_rule ? "exact" : "first", sheet_match: "exact",
        header_mode: "fixed", header_row: 1, scan_rows: 10, keyword_condition: "any", keyword_match: "cell_exact",
        header_match: "trim_casefold", column_mode: "all", column_match: "trim_casefold", deduplicate: "all_columns",
        input_format: "excel",
      };
      for (const [name, value] of Object.entries(defaults)) control(name).value = rules[name] ?? value;
      control("sheet_names").value = (rules.sheet_names || []).join("\n");
      control("header_keywords").value = (rules.header_keywords || []).join("\n");
      for (const [name, value] of Object.entries({ location: "body_or_attachment", table: "first", min_columns: 1, strike: "mark", reply_prefixes: ["RE", "FW", "FWD"], update_keys: [], base_search: true })) {
        const saved = rules.mail?.[name] ?? value;
        if (typeof value === "boolean") mailControl(name).checked = saved;
        else mailControl(name).value = Array.isArray(saved) ? saved.join("\n") : saved;
      }
      for (const kind of Object.keys(sections)) sections[kind].replaceChildren();
      for (const item of rules.columns || []) addColumn(item);
      for (const kind of kinds.filter((name) => name !== "columns")) for (const item of rules[kind] || []) addOperation(kind, item);
      sync();
    },
    read() {
      if (!custom || !enabled.checked) return null;
      const rules = { version: 1 };
      rules.input_format = control("input_format").value;
      rules.mail = rules.input_format === "excel" ? {} : {
        location: mailControl("location").value, table: mailControl("table").value, min_columns: Number(mailControl("min_columns").value), strike: mailControl("strike").value,
        reply_prefixes: lines(mailControl("reply_prefixes").value), update_keys: lines(mailControl("update_keys").value), base_search: mailControl("base_search").checked
      };
      for (const name of ["file_strategy", "sheet_mode", "sheet_match", "header_mode", "keyword_condition", "keyword_match", "header_match", "column_mode", "column_match", "deduplicate"]) rules[name] = control(name).value;
      rules.header_row = rules.header_mode === "fixed" ? Number(control("header_row").value) : 1;
      rules.scan_rows = rules.header_mode === "scan" ? Number(control("scan_rows").value) : 10;
      rules.sheet_names = rules.sheet_mode === "list" ? lines(control("sheet_names").value) : [];
      rules.header_keywords = rules.header_mode === "scan" ? lines(control("header_keywords").value) : [];
      for (const [kind, container] of Object.entries(sections)) rules[kind] = Array.from(container.children, (node) => {
        const item = {};
        node.querySelectorAll("[data-param]").forEach((field) => {
          const name = field.dataset.param;
          if (name === "position" && !field.value) return;
          item[name] = field.type === "checkbox" ? field.checked : ["width", "length", "header_row", "position"].includes(name) ? Number(field.value)
            : ["aliases", "fields"].includes(name) ? lines(field.value) : name === "old" || name === "new" || name === "chars" || name === "value" ? field.value : field.value.trim();
          if (kind === "lookups" && ["keys", "fields"].includes(name)) item[name] = pairLines(field.value, name);
          else if (["cells", "separators"].includes(name)) item[name] = lines(field.value).map((part) => part === "SPACE" ? " " : part === "NEWLINE" ? "\n" : part);
          if (name === "fields" && kind === "filters" && !item[name].length) item[name] = "all";
        });
        if (kind === "cell_values" || kind === "splits") delete item.op;
        return item;
      });
      if (rules.column_mode === "select" && !rules.columns.length) throw new Error("指定欄位模式至少需要新增一個欄位");
      if (rules.sheet_mode === "list" && !rules.sheet_names.length) throw new Error("請填寫工作表清單");
      if (rules.header_mode === "scan" && !rules.header_keywords.length) throw new Error("請填寫表頭關鍵字");
      return rules;
    }
  };
}
