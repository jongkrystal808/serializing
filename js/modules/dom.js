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
