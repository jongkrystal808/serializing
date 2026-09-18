import { getVecowLinkByApi, saveVecowLinkByApi } from "./api.js?v=0.3.60";

// 【用途】綁定超恩連結顯示與首頁後臺維護表單。
export function createVecowLinkController(showToast) {
  const ids = ["btn-vecow-link-toggle", "vecow-link-maintenance-card", "vecow-link-form", "vecow-link-url", "vecow-link-status", "btn-vecow-link-save", "home-vecow-link", "bng-vecow-link"];
  const nodes = ids.map((id) => document.getElementById(id));
  if (nodes.some((node) => !node)) throw new Error(`缺少 VECOW 連結元件：${ids.filter((id, index) => !nodes[index]).join("、")}`);
  const [toggle, card, form, input, status, save, homeLink, bngLink] = nodes;
  let url = "";
  let homeCustomer = "";

  // 【用途】僅將有效的 HTTP(S) 網址設定到連結，空白時隱藏。
  function render(value) {
    let safeUrl = "";
    try {
      const parsed = new URL(value);
      if (["http:", "https:"].includes(parsed.protocol) && !parsed.username && !parsed.password) safeUrl = parsed.href;
    } catch { /* 未設定連結時隱藏。 */ }
    url = safeUrl;
    [homeLink, bngLink].forEach((link) => {
      if (url) link.href = url;
      else link.removeAttribute("href");
      link.hidden = !url || (link === homeLink && homeCustomer !== "bng");
    });
  }

  // 【用途】重新載入資料庫連結並同步維護表單。
  async function load() {
    status.textContent = "正在載入連結…";
    save.disabled = true;
    try {
      const data = await getVecowLinkByApi();
      render(data.url);
      input.value = data.url || "";
      status.textContent = url ? "已載入連結設定。" : "尚未設定連結，請填入一覽表的分享網址。";
    } catch (error) {
      status.textContent = `連結載入失敗：${error.message}`;
      showToast(status.textContent, "error");
    } finally { save.disabled = false; }
  }

  toggle.addEventListener("click", () => {
    card.hidden = !card.hidden;
    toggle.setAttribute("aria-expanded", String(!card.hidden));
    if (!card.hidden) { card.scrollIntoView({ block: "nearest" }); void load(); }
  });
  form.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (save.disabled) return;
    save.disabled = true;
    save.textContent = "儲存中…";
    status.textContent = "正在儲存連結…";
    try {
      const data = await saveVecowLinkByApi(input.value.trim());
      render(data.url);
      input.value = data.url;
      status.textContent = url ? "連結已儲存。" : "連結已移除。";
      showToast(status.textContent, "success");
    } catch (error) {
      status.textContent = `連結儲存失敗：${error.message}`;
      showToast(status.textContent, "error");
    } finally { save.disabled = false; save.textContent = "儲存連結"; }
  });

  return {
    load,
    // 【用途】沿用現有後臺入口顯示與隱藏規則。
    setMaintenanceVisible(visible) {
      toggle.hidden = !visible;
      if (!visible) { card.hidden = true; toggle.setAttribute("aria-expanded", "false"); }
    },
    // 【用途】首頁顯示超恩查詢結果時同步顯示連結。
    setHomeCustomer(customer) { homeCustomer = customer; render(url); }
  };
}
