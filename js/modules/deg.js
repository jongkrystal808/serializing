import { generateSnByApi, exportWorkbookByApi, getHistoryByApi } from "./api.js";
import { normalizeText } from "./utils.js";

export function findDegWorkOrderRows(rows, query, exactOnly = false, column = null) {
  const target = normalizeText(query);
  if (!target) return [];
  const aliases = ["工單", "工單號碼", "工單號", "工單編號", "製令單號", "製令單", "MO", "M/O", "Work Order", "WO"].map(normalizeText);
  const tokens = (row) => {
    const key = Object.keys(row).find((name) => column ? normalizeText(name) === normalizeText(column) : aliases.includes(normalizeText(name)));
    return String(row[key] ?? "").split(/[\s,，;；/]+/).map((value) => normalizeText(value.split("*")[0])).filter(Boolean);
  };
  const exact = (rows || []).filter((row) => tokens(row).includes(target));
  return exactOnly || exact.length ? exact : (rows || []).filter((row) => tokens(row).some((value) => value.includes(target)));
}

export function setDegGeneratorVisible(visible) {
  const card = document.getElementById("deg-generator-card");
  if (!card) return;
  card.hidden = !visible;
  card.open = visible;
}

export function getDegTodayValues(today = new Date()) {
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  const weekday = today.getDay() || 7;
  const iso = new Date(Date.UTC(year, today.getMonth(), today.getDate()));
  iso.setUTCDate(iso.getUTCDate() + 4 - weekday);
  const week = String(Math.ceil(((iso - new Date(Date.UTC(iso.getUTCFullYear(), 0, 1))) / 86400000 + 1) / 7)).padStart(2, "0");
  const yy = String(year).slice(-2);
  return { hl: yy + week, pizza_carton: yy + month + day, week, weekday: String(weekday), year_last: String(year).slice(-1) };
}

export function initDegGenerator() {
  const form = document.getElementById("deg-form");
  if (!form) return;
  const field = (name) => form.elements.namedItem(name);
  const status = document.getElementById("deg-status");
  const output = document.getElementById("deg-output");
  const download = document.getElementById("deg-download");
  const copy = document.getElementById("deg-copy");
  const history = document.getElementById("deg-history");
  let serials = [];
  let busy = false;
  function invalidate() {
    serials = [];
    output.value = "";
    download.disabled = copy.disabled = true;
  }
  function today() {
    const values = getDegTodayValues();
    field("date_code").value = values[field("spec").value] || "";
    for (const name of ["week", "weekday", "year_last"]) field(name).value = values[name];
    invalidate();
  }
  function mode() {
    const spec = field("spec").value;
    form.querySelectorAll("[data-deg-specs]").forEach((label) => {
      const visible = label.dataset.degSpecs.split(" ").includes(spec);
      label.hidden = !visible;
      label.querySelectorAll("input").forEach((input) => { input.disabled = !visible; });
    });
    field("start_serial").max = spec === "pizza_carton" ? "999" : "99999";
    document.getElementById("deg-rule").textContent = {
      hl: "HL + DD + 三位產品碼 + YYWW + 五位流水號。例如 HLDDM2A263800001",
      pizza_box: "料號 + DD + 年份末位 + 兩位週數 + 週幾（週一=1）+ 000 + 五位流水號。批量時流水號遞增。",
      pizza_carton: "CO + YYMMDD + 兩位週數 + P + 三位流水號（001~999）。"
    }[spec];
    today();
  }
  async function run(action) {
    if (busy) return;
    busy = true;
    form.inert = true;
    form.querySelectorAll("button").forEach((button) => { button.disabled = true; });
    copy.disabled = download.disabled = history.disabled = true;
    try { await action(); }
    catch (error) { status.textContent = error.message || "操作失敗"; }
    finally {
      busy = false;
      form.inert = false;
      form.querySelectorAll("button").forEach((button) => { button.disabled = false; });
      copy.disabled = download.disabled = !serials.length;
      history.disabled = false;
    }
  }
  form.addEventListener("input", invalidate);
  field("spec").addEventListener("change", mode);
  document.getElementById("deg-today").addEventListener("click", today);
  form.addEventListener("submit", (event) => {
    event.preventDefault();
    run(async () => {
      invalidate();
      const deg = {};
      for (const name of ["spec", "product", "date_code", "year_last", "week", "weekday"]) deg[name] = field(name).value.trim();
      deg.start_serial = Number(field("start_serial").value);
      status.textContent = "正在生成泉影 DEG 序號…";
      const result = await generateSnByApi({ customer: "deg", key: deg.spec, qty: Number(field("qty").value), deg });
      serials = result.sn_list;
      output.value = serials.join("\n");
      status.textContent = `已生成 ${serials.length} 筆並儲存歷史。下載可重試。`;
    });
  });
  copy.addEventListener("click", () => run(async () => {
    await navigator.clipboard.writeText(serials.join("\n"));
    status.textContent = `已複製 ${serials.length} 筆序號。`;
  }));
  download.addEventListener("click", () => run(async () => {
    const result = await exportWorkbookByApi({ customer: "deg", sn_rows: serials.map((SN) => ({ SN })), file_name: "泉影DEG-SN.xlsx" });
    const url = URL.createObjectURL(result.blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = result.filename;
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    status.textContent = "已下載泉影 DEG 序號。";
  }));
  history.addEventListener("click", () => run(async () => {
    const result = await getHistoryByApi("deg");
    const list = document.getElementById("deg-history-output");
    list.replaceChildren();
    for (const record of result.records || []) {
      const row = document.createElement("p");
      row.textContent = `${record.created_at}｜${record.record}`;
      list.append(row);
    }
    if (!list.childElementCount) list.textContent = "尚無泉影 DEG 生成紀錄。";
    list.hidden = false;
    status.textContent = "已載入泉影 DEG 歷史。";
  }));
  mode();
}
