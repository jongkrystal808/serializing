// 【用途】在單一受控邊界解析已完成語境編碼的模板，並以 DocumentFragment 原子替換內容。
export function replaceChildrenFromTrustedTemplate(target, trustedHtml) {
  if (!target) {
    return;
  }
  const documentValue = target.ownerDocument || globalThis.document;
  if (!documentValue || typeof documentValue.createElement !== "function") {
    throw new Error("無法渲染模板：document 尚未就緒。");
  }
  const template = documentValue.createElement("template");
  template.innerHTML = String(trustedHtml ?? "");
  target.replaceChildren(template.content.cloneNode(true));
}

// 【用途】以節點 clone 複製既有面板，不經過 HTML 字串重新解析。
export function cloneChildrenInto(target, source) {
  if (!target) {
    return;
  }
  const children = source
    ? Array.from(source.childNodes, (node) => node.cloneNode(true))
    : [];
  target.replaceChildren(...children);
}
