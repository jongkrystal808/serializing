export function getRowValueByHeaderCandidates(row, headers) {
  if (!row || !Array.isArray(headers)) {
    return "";
  }
  const rowKeys = Object.keys(row);
  for (const header of headers) {
    const foundKey = rowKeys.find((key) => String(key).trim().toLowerCase() === String(header).trim().toLowerCase());
    if (foundKey) {
      return String(row[foundKey] ?? "").trim();
    }
  }
  return "";
}

// 【用途】依「編號備註」語意拆分 BNG 機種與備註，容許多種空白與全形標點。
export function splitBngModelAndRemark(modelValue) {
  const text = String(modelValue ?? "").trim();
  const match = text.match(/^(.*?)\s+(1[.．、](?:\s+|(?=\p{Script=Han}))[\s\S]*)$/u);
  if (!match) {
    return {
      model: text,
      remark: ""
    };
  }
  return {
    model: match[1].trim(),
    remark: match[2].trim()
  };
}

export function buildBngReceiptPrintPayload(args) {
  const {
    row,
    getColumnValue,
    normalizeRangeText
  } = args || {};
  const mo = getColumnValue(row, "MO");
  const workOrder = getColumnValue(row, "WORK_ORDER");
  const modelRaw = getColumnValue(row, "MODEL");
  const parsedModel = splitBngModelAndRemark(modelRaw);
  const ddcModel = getRowValueByHeaderCandidates(row, ["DDC Model", "Model", "MODEL"]) || parsedModel.model || modelRaw;
  const partNo = getColumnValue(row, "PART_NO");
  const qty = getColumnValue(row, "QTY");
  const macQty = getColumnValue(row, "MAC_QTY");
  const macRange = normalizeRangeText(getColumnValue(row, "MAC_RANGE"));

  return {
    mo,
    ddcModel,
    workOrder,
    model: parsedModel.model,
    macQty,
    partNo,
    macRange,
    qty,
    remark: parsedModel.remark
  };
}

export function renderBngReceiptPrintHtml(payload, escapeHtml) {
  return `
    <section class="bng-receipt-print-sheet">
      <table class="bng-receipt-print-table">
        <colgroup>
          <col class="bng-receipt-col-1">
          <col class="bng-receipt-col-2">
          <col class="bng-receipt-col-3">
          <col class="bng-receipt-col-4">
          <col class="bng-receipt-col-5">
          <col class="bng-receipt-col-6">
        </colgroup>
        <tbody>
          <tr>
            <th class="bng-receipt-label">MO</th>
            <td class="bng-receipt-value">${escapeHtml(payload.mo)}</td>
            <th class="bng-receipt-label">DDC Model</th>
            <td class="bng-receipt-value">${escapeHtml(payload.ddcModel)}</td>
            <th class="bng-receipt-label">Work Order Number</th>
            <td class="bng-receipt-value">${escapeHtml(payload.workOrder)}</td>
          </tr>
          <tr>
            <th class="bng-receipt-label">Model</th>
            <td class="bng-receipt-value" colspan="2">${escapeHtml(payload.model)}</td>
            <th class="bng-receipt-label">Number of MACs</th>
            <td class="bng-receipt-value">${escapeHtml(payload.macQty)}</td>
            <td class="bng-receipt-unit">PCS</td>
          </tr>
          <tr>
            <th class="bng-receipt-label">Part Number</th>
            <td class="bng-receipt-value" colspan="2">${escapeHtml(payload.partNo)}</td>
            <th class="bng-receipt-label">MAC range</th>
            <td class="bng-receipt-value" colspan="2">${escapeHtml(payload.macRange)}</td>
          </tr>
          <tr>
            <th class="bng-receipt-label">Quantity</th>
            <td class="bng-receipt-value">${escapeHtml(payload.qty)}</td>
            <td class="bng-receipt-unit">pcs</td>
            <th class="bng-receipt-label">Remark</th>
            <td colspan="2" class="bng-receipt-remark">${escapeHtml(payload.remark)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  `;
}
