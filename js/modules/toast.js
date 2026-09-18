/**
 * Toast 通知模組
 *
 * showToast(message, type?, duration?)
 *   type: "success" | "error" | "info" (default: "info")
 *   duration: ms (default: 3000)
 */

const TOAST_ICONS = {
  success: "✓",
  error: "✕",
  info: "ℹ"
};

const DEFAULT_DURATION = 3000;
const MAX_TOASTS = 5;

let container = null;

function ensureContainer() {
  if (container && container.isConnected) {
    return container;
  }
  container = document.createElement("div");
  container.className = "toast-container";
  container.setAttribute("aria-live", "polite");
  container.setAttribute("aria-atomic", "false");
  document.body.appendChild(container);
  return container;
}

function pruneOldToasts() {
  const root = ensureContainer();
  const children = Array.from(root.children);
  while (children.length >= MAX_TOASTS) {
    const oldest = children.shift();
    oldest.remove();
  }
}

export function showToast(message, type = "info", duration = DEFAULT_DURATION) {
  if (typeof document === "undefined" || !document.body) {
    return;
  }
  const validType = ["success", "error", "info"].includes(type) ? type : "info";
  const root = ensureContainer();
  pruneOldToasts();

  const toast = document.createElement("div");
  toast.className = `toast toast-${validType}`;
  toast.setAttribute("role", validType === "error" ? "alert" : "status");

  const icon = document.createElement("span");
  icon.className = "toast-icon";
  icon.textContent = TOAST_ICONS[validType] || TOAST_ICONS.info;
  icon.setAttribute("aria-hidden", "true");

  const msg = document.createElement("span");
  msg.className = "toast-message";
  msg.textContent = String(message ?? "");

  toast.appendChild(icon);
  toast.appendChild(msg);
  root.appendChild(toast);

  const dismissTimeout = setTimeout(() => {
    dismissToast(toast);
  }, duration);

  toast.addEventListener("click", () => {
    clearTimeout(dismissTimeout);
    dismissToast(toast);
  }, { once: true });
}

function dismissToast(element) {
  if (!element || !element.isConnected) {
    return;
  }
  element.classList.add("toast-dismissing");
  element.addEventListener("animationend", () => {
    element.remove();
  }, { once: true });
  // Fallback removal in case animationend doesn't fire
  setTimeout(() => {
    if (element.isConnected) {
      element.remove();
    }
  }, 300);
}
