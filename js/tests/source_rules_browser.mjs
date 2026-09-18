// 使用已安裝的 Playwright；可用 PLAYWRIGHT_MODULE 指定其 index.mjs 路徑。
import assert from "node:assert/strict";
import http from "node:http";
import { readFile } from "node:fs/promises";
import { extname, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE ? pathToFileURL(process.env.PLAYWRIGHT_MODULE).href : "playwright");
const root = fileURLToPath(new URL("../../", import.meta.url));
const server = http.createServer(async (request, response) => {
  const path = new URL(request.url, "http://localhost").pathname;
  const file = resolve(root, `.${path === "/" ? "/index.html" : decodeURIComponent(path)}`);
  if (!file.startsWith(root)) { response.writeHead(403).end(); return; }
  try {
    const content = await readFile(file);
    const types = { ".js": "application/javascript", ".html": "text/html", ".css": "text/css", ".svg": "image/svg+xml", ".png": "image/png" };
    response.writeHead(200, { "Content-Type": types[extname(file)] || "application/octet-stream" }).end(content);
  } catch { response.writeHead(404).end(); }
});
await new Promise((done) => server.listen(0, "127.0.0.1", done));
const browser = await chromium.launch({ headless: true, executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE });
const errors = [], saved = [], previews = [];
const entries = [{ key: "yingbang", label: "營邦", is_custom: false, path_kind: "folder", path: "/mnt/alg",
  sheet_rule_label: "工作表", sheet_rule: "試產", file_rule_label: "", file_rule: "", recent_files_label: "檔案數", recent_files: 10, rules: null,
  rule_editable: true, rule_summary: "", rule_template: { version: 1, file_strategy: "first_valid", sheet_mode: "list", sheet_names: ["試產"],
    sheet_match: "exact", header_mode: "scan", header_row: 1, scan_rows: 5, header_keywords: ["工單"], keyword_condition: "any", keyword_match: "cell_exact",
    header_match: "trim_casefold", column_mode: "select", columns: [{ name: "工單", aliases: ["工單"] }], column_match: "trim_casefold",
    transforms: [], filters: [], deduplicate: "none", cell_values: [], lookups: [], splits: [], input_format: "excel", mail: {} } },
  { key: "custom_generic", label: "新客戶", is_custom: true, path_kind: "folder", path: "/mnt/netdisk/new", search_customer: "", work_order_column: "" }];
try {
  const page = await browser.newPage();
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/api/**", async (route) => {
    const request = route.request(), path = new URL(request.url()).pathname;
    let data = { entries: [], rows: [], rows_count: 0, records: [] };
    if (path === "/api/excel/load-default" && new URL(request.url()).searchParams.get("customer") === "deg") {
      data = { rows: [{ MO: "OTHER", "工令號": "01234567", "型號": "M2A", "數量": "200", PO: "11117157", "備註": "<img src=x onerror=alert(1)>" },
        { "工令號": "01234567", "型號": "M2B", "數量": "300" }], rows_count: 2, resolved_columns: { WORK_ORDER: "工令號" } };
    }
    if (path === "/api/excel/load-source") data = { rows: [{ "工令號": "20260323001", "型號": "OtherModel", "數量": "7" },
      { "工令號": "OTHER-WO", "型號": "NotMatched" }], rows_count: 2, resolved_columns: {} };
    if (path === "/api/shipment-sources") {
      if (request.method() === "POST") {
        const payload = request.postDataJSON(); saved.push(payload);
        const entry = { ...payload, key: "custom_deg", is_custom: true, sheet_rule_label: "工作表", file_rule_label: "檔名關鍵字", recent_files_label: "最近檔案數" };
        entries.push(entry); data = entry;
      } else data = { entries };
    } else if (path === "/api/shipment-sources/custom_deg") {
      const payload = request.postDataJSON(); saved.push(payload);
      const entry = entries.find((item) => item.key === "custom_deg");
      Object.assign(entry, payload); data = entry;
    } else if (path === "/api/shipment-sources/preview") {
      previews.push(request.postDataJSON());
      data = { label: "DEG", error: null, output_rows: 1, before_deduplicate: 2,
        output: { columns: ["工單"], rows: [["00000123"]] },
        files: [{ file: "/mnt/deg/example.xlsx", used: true, sheets: [{ sheet: "生產排程 2026", header_row: 3, input_rows: 3, filtered_rows: 2,
          mappings: [{ original: "製令單號", output: "工單" }], before: { columns: ["製令單號"], rows: [["123"]], row_numbers: [4] },
          after: { columns: ["工單"], rows: [["00000123"]], row_numbers: [4] } }] }] };
    } else if (path === "/api/shipment-refresh") data = { status: "succeeded", progress: 100,
      source_results: [{ label: "DEG", status: "retained", rows: 3, error: "缺少必需欄位", migration_status: "fallback", migration_reason: "輸出值或列順序不同" }] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({ success: true, data }) });
  });
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  await page.keyboard.press("Control+Shift+D");
  await page.locator("#btn-shipment-source-toggle").click();
  await page.locator("#btn-shipment-source-new").click();
  await page.locator("#shipment-source-name").fill("DEG");
  await page.locator("#shipment-source-path").fill("/mnt/deg");
  await page.locator("#shipment-source-search-customer").selectOption("deg");
  await page.locator("#shipment-source-work-order-column").fill("工單");
  await page.locator("#shipment-source-file-rule").fill("DEG");
  await page.locator('[name="source-rules-enabled"]').check();
  await page.locator('[name="source-rule-sheet_mode"]').selectOption("exact");
  await page.locator("#shipment-source-sheet-rule").fill("生產排程 2026");
  await page.locator('[name="source-rule-header_row"]').fill("3");
  await page.locator('[name="source-rule-header_mode"]').selectOption("scan");
  await page.locator('[name="source-rule-scan_rows"]').fill("");
  await page.locator('[name="source-rule-header_mode"]').selectOption("fixed");
  await page.locator('[name="source-rule-column_mode"]').selectOption("select");
  await page.locator('[data-add-rule="columns"]').click();
  const column = page.locator('[data-rule-rows="columns"]');
  await column.locator('[data-param="name"]').fill("工單");
  await column.locator('[data-param="aliases"]').fill("製令單號\n工單");
  await column.locator('[data-param="required"]').check();
  await page.locator('[data-add-rule="columns"]').click();
  const secondColumn = column.locator(".source-rule-row").nth(1);
  await secondColumn.locator('[data-param="name"]').fill("料號");
  await secondColumn.locator('[data-param="aliases"]').fill("產品品號");
  await secondColumn.getByRole("button", { name: "上移", exact: true }).click();
  await page.locator('[data-add-rule="transforms"]').click();
  const transform = page.locator('[data-rule-rows="transforms"]');
  await transform.locator('[data-param="op"]').selectOption("zero_pad");
  await transform.locator('[data-param="field"]').fill("工單");
  await transform.locator('[data-param="width"]').fill("8");
  await page.locator('[data-add-rule="filters"]').click();
  const filter = page.locator('[data-rule-rows="filters"]');
  await filter.locator('[data-param="op"]').selectOption("drop_contains");
  await filter.locator('[data-param="fields"]').fill("備註");
  await filter.locator('[data-param="value"]').fill("Total");
  await page.locator('[data-add-rule="cell_values"]').click();
  const cells = page.locator('[data-rule-rows="cell_values"]');
  await cells.locator('[data-param="target"]').fill("月份");
  await cells.locator('[data-param="cells"]').fill("B1\nA1");
  await cells.locator('[data-param="format"]').selectOption("date");
  await page.locator('[data-add-rule="splits"]').click();
  const splits = page.locator('[data-rule-rows="splits"]');
  await splits.locator('[data-param="field"]').fill("工單");
  await splits.locator('[data-param="quantity_field"]').fill("數量");
  await page.locator('[data-add-rule="lookups"]').click();
  const lookup = page.locator('[data-rule-rows="lookups"]');
  await lookup.locator('[data-param="path"]').fill("/mnt/master.xlsx");
  await lookup.locator('[data-param="keys"]').fill("料號=PN");
  await lookup.locator('[data-param="fields"]').fill("BIOS=BIOS=if_empty");
  await page.locator('[name="source-rule-input_format"]').selectOption("eml");
  assert.equal(await page.locator('[data-mail-settings]').isVisible(), true);
  await page.locator('[name="source-rule-input_format"]').selectOption("excel");
  await page.locator("#btn-shipment-source-preview").click();
  await page.locator("#shipment-source-preview").waitFor({ state: "visible" });
  assert.equal(saved.length, 0);
  assert.equal(previews[0].rules.header_row, 3);
  assert.match(await page.locator("#shipment-source-preview").textContent(), /最終輸出：1筆/);
  assert.match(await page.locator("#shipment-source-preview").textContent(), /Excel列/);
  assert.equal(await page.locator("#shipment-source-results").count(), 0);
  await filter.locator('[data-param="value"]').fill("total");
  assert.equal(await page.locator("#shipment-source-preview").isVisible(), false);
  await filter.locator('[data-param="value"]').fill("Total");
  await page.locator("#btn-shipment-source-save").click();
  await page.waitForFunction(() => document.querySelector("#shipment-source-select").value === "custom_deg");
  assert.equal(saved[0].rules.header_row, 3);
  assert.equal(saved[0].search_customer, "deg");
  assert.equal(saved[0].work_order_column, "工單");
  assert.equal(saved[0].rules.scan_rows, 10);
  assert.deepEqual(saved[0].rules.cell_values[0].cells, ["B1", "A1"]);
  assert.equal(saved[0].rules.splits[0].op, undefined);
  assert.deepEqual(saved[0].rules.splits[0].separators, ["/", ";", "\n"]);
  assert.deepEqual(saved[0].rules.lookups[0].keys, [{ field: "料號", lookup: "PN" }]);
  assert.deepEqual(saved[0].rules.lookups[0].fields, [{ lookup: "BIOS", target: "BIOS", overwrite: "if_empty" }]);
  assert.equal(await cells.locator('[data-param="format"]').inputValue(), "date");
  assert.equal(await lookup.locator('[data-param="fields"]').inputValue(), "BIOS=BIOS=if_empty");
  assert.deepEqual(saved[0].rules.columns, [{ name: "料號", aliases: ["產品品號"], required: false }, { name: "工單", aliases: ["製令單號", "工單"], required: true }]);
  assert.deepEqual(saved[0].rules.transforms, [{ op: "zero_pad", field: "工單", width: 8 }]);
  assert.deepEqual(saved[0].rules.filters, [{ op: "drop_contains", fields: ["備註"], value: "Total", case_sensitive: false }]);
  assert.equal(await transform.locator('[data-param="width"]').inputValue(), "8");
  // 切換內建來源再切回，確認規則重載且隱藏欄不妨礙原生表單驗證。
  await page.locator("#shipment-source-select").selectOption("yingbang");
  assert.equal(await page.locator("#btn-shipment-source-preview").isVisible(), true);
  assert.equal(await page.locator("#shipment-source-rules").isVisible(), true);
  assert.equal(await page.locator('[name="source-rules-enabled"]').isChecked(), true);
  assert.equal(await page.locator('[name="source-rule-file_strategy"]').inputValue(), "first_valid");
  assert.match(await page.locator("#shipment-source-rule-summary").textContent(), /儲存後才會改用/);
  await page.locator("#shipment-source-select").selectOption("custom_deg");
  assert.equal(await page.locator("#shipment-source-search-customer").inputValue(), "deg");
  assert.equal(await page.locator("#shipment-source-work-order-column").inputValue(), "工單");
  assert.equal(await page.locator('[name="source-rule-header_row"]').inputValue(), "3");
  await page.locator('[name="source-rule-sheet_mode"]').selectOption("list");
  await page.locator('[name="source-rule-sheet_names"]').fill("生產排程 2026\n備用");
  assert.equal(await page.locator("#shipment-source-sheet-rule").isDisabled(), false);
  await page.locator('[name="source-rules-enabled"]').uncheck();
  assert.equal(await page.locator('[name="source-rule-header_row"]').isDisabled(), true);
  const reloaded = page.waitForResponse((response) => response.url().endsWith("/api/shipment-sources") && response.request().method() === "GET");
  await page.locator("#btn-shipment-source-save").click();
  await reloaded;
  assert.equal(saved[1].rules, null);
  assert.equal(await page.locator("#deg-generator-card").isVisible(), false);
  await page.locator("#home-search-input").fill("01234567");
  await page.locator("#btn-home-query").click();
  await page.waitForFunction(() => document.getElementById("home-status").textContent.includes("已命中 泉影"));
  assert.equal(await page.locator("#deg-generator-card").isVisible(), true);
  assert.equal(await page.locator("#deg-generator-card").evaluate((card) => card.open), true);
  const preview = page.locator("#home-preview-panel");
  assert.equal(await preview.locator("tbody tr").count(), 2);
  for (const value of ["M2A", "M2B", "200", "300", "11117157", "<img src=x onerror=alert(1)>"]) assert.ok((await preview.textContent()).includes(value));
  assert.equal(await preview.locator("img").count(), 0);
  assert.equal(await preview.locator('.copyable-cell[data-copy-value="11117157"]').count(), 1);
  assert.equal(await page.locator("#btn-home-export").isDisabled(), true);
  await page.locator("#home-search-input").fill("20260323001");
  await page.locator("#btn-home-query").click();
  await page.waitForFunction(() => document.getElementById("home-status").textContent.includes("已命中 新客戶"));
  assert.equal(await preview.locator("tbody tr").count(), 1);
  assert.match(await preview.textContent(), /OtherModel/);
  assert.ok(!(await preview.textContent()).includes("NotMatched"));
  assert.equal(await page.locator("#deg-generator-card").isVisible(), false);
  assert.equal(await page.locator("#btn-home-export").isDisabled(), true);
  await page.locator("#home-search-input").fill("NO-SUCH-WO");
  await page.locator("#btn-home-query").click();
  assert.equal(await page.locator("#deg-generator-card").isVisible(), false);
  assert.deepEqual(errors, []);
  await page.setViewportSize({ width: 390, height: 844 });
  assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth), true);
  console.log("Source rules browser: preview without save, counts/samples/results, create/save/reload/switch/disable passed; no runtime errors.");
} finally {
  await browser.close();
  await new Promise((done) => server.close(done));
}
