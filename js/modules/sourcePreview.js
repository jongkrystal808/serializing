function element(tag, text, parent) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = String(text);
  parent?.append(node);
  return node;
}

function table(parent, columns, rows) {
  const wrap = element("div", undefined, parent);
  wrap.className = "koya-model-table-wrap";
  const grid = element("table", undefined, wrap);
  grid.className = "koya-model-table";
  const head = element("tr", undefined, element("thead", undefined, grid));
  columns.forEach((name) => element("th", name, head));
  const body = element("tbody", undefined, grid);
  rows.forEach((values) => {
    const row = element("tr", undefined, body);
    values.forEach((value) => element("td", value, row));
  });
}

export function renderSourcePreview(panel, report) {
  panel.replaceChildren();
  panel.hidden = false;
  element("h3", `${report.label} 匯入預覽`, panel);
  element("p", "依目前表單執行，未保存設定或更新總表。前10頁各顯示最多20列、100欄，每格最多500字；筆數依完整資料計算。", panel);
  if (report.error) element("p", `預覽失敗：${report.error}`, panel).className = "status-message error";
  for (const file of report.files || []) {
    element("h4", `${file.used ? "採用" : "未採用"}：${file.file}`, panel);
    if (file.subject) element("p", `郵件主題：${file.subject}${file.reply ? "（回覆更新）" : ""}`, panel);
    if (file.error) element("p", file.error, panel).className = "error";
    for (const sheet of file.sheets || []) {
      const block = element("details", undefined, panel);
      block.open = true;
      element("summary", `${sheet.sheet}｜表頭第${sheet.header_row ?? "?"}列｜輸入${sheet.input_rows ?? "?"}筆 → 過濾後${sheet.filtered_rows ?? "?"}筆`, block);
      if (sheet.error) element("p", sheet.error, block).className = "error";
      if (!sheet.mappings?.length && sheet.headers) table(block, ["實際表頭"], sheet.headers.map((name) => [name]));
      (sheet.warnings || []).forEach((warning) => element("p", `提醒：${warning}`, block));
      if (sheet.mappings?.length) table(block, ["原始欄位置", "原始欄名", "改名後欄名"], sheet.mappings.map((item) => [item.position ?? "", item.original, item.output]));
      if (sheet.steps?.length) table(block, ["步驟", "操作", "剩餘筆數"], sheet.steps.map((item) => [`${({ filter: "過濾", transform: "轉換", cell: "儲存格補值", split: "拆列" })[item.kind] || item.kind}第${item.index}項`, item.op, item.rows]));
      for (const [key, title] of [["before", "處理前樣本"], ["after", "清理／過濾後樣本（尚未選欄與去重）"]]) {
        if (sheet[key]) {
          element("h4", title, block);
          const sample = sheet[key];
          table(block, [file.subject ? "原始表格列" : "Excel列", ...sample.columns], sample.rows.map((row, index) => [sample.row_numbers?.[index] ?? "", ...row]));
        }
      }
    }
  }
  if (report.output) {
    element("h4", `最終輸出：${report.output_rows}筆｜去重前${report.before_deduplicate}筆`, panel);
    table(panel, report.output.columns, report.output.rows);
  }
  (report.warnings || []).forEach((warning) => element("p", `提醒：${warning}`, panel));
  if (report.lookup_results?.length) table(panel, ["對照步驟", "來源", "匹配筆數", "未匹配筆數"], report.lookup_results.map((item) => [item.index, item.kind, item.matched, item.unmatched]));
  if (report.mail_updates?.length) table(panel, ["回覆主題", "替換舊列", "加入列"], report.mail_updates.map((item) => [item.subject, item.replaced, item.added]));
}
