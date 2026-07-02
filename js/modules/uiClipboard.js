// 【用途】使用舊版 document.execCommand('copy') 作為剪貼簿 fallback（支援非 HTTPS 情境）
function copyTextByExecCommand(value) {
  const textarea = document.createElement("textarea");
  textarea.value = String(value ?? "");
  textarea.setAttribute("readonly", "");
  textarea.style.position = "fixed";
  textarea.style.top = "0";
  textarea.style.left = "0";
  textarea.style.opacity = "0";
  textarea.style.pointerEvents = "none";
  document.body.appendChild(textarea);

  let copied = false;
  try {
    textarea.focus();
    textarea.select();
    textarea.setSelectionRange(0, textarea.value.length);
    copied = document.execCommand("copy");
  } finally {
    textarea.remove();
  }
  return copied;
}

// 【用途】優先使用 Clipboard API，失敗時自動降級為 execCommand 複製
export async function copyTextToClipboard(value) {
  const text = String(value ?? "");
  const canUseClipboardApi = Boolean(window.isSecureContext && navigator?.clipboard?.writeText);

  if (canUseClipboardApi) {
    try {
      await navigator.clipboard.writeText(text);
      return;
    } catch (error) {
      // Clipboard API 在權限被拒或瀏覽器限制時，改走舊版 fallback
    }
  }

  const copied = copyTextByExecCommand(text);
  if (!copied) {
    throw new Error("Clipboard write failed.");
  }
}

export function bindSheetCopyCells(ui, onCopyError) {
  bindSheetCopyCellsIn(ui.previewPanel, onCopyError);
}

export function bindSheetCopyCellsIn(rootElement, onCopyError) {
  if (!rootElement) {
    return;
  }
  const cells = rootElement.querySelectorAll(".copyable-cell");
  cells.forEach((cell) => {
    cell.addEventListener("click", async () => {
      const value = cell.getAttribute("data-copy-value") || "";
      try {
        await copyTextToClipboard(value);
        cell.classList.add("copied");
        setTimeout(() => {
          cell.classList.remove("copied");
        }, 700);
      } catch (error) {
        onCopyError();
      }
    });
  });
}

export function bindCopyButtons(ui, onCopyError) {
  const buttons = ui.previewPanel.querySelectorAll(".copy-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      const copiedText = button.getAttribute("data-copied-text") || "已複製 ✓";
      const copyValue = button.getAttribute("data-copy-value") || "";
      try {
        await copyTextToClipboard(copyValue);
        button.textContent = copiedText;
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove("copied");
        }, 1500);
      } catch (error) {
        onCopyError();
      }
    });
  });
}

export function bindCopyButtonsIn(rootElement, onCopyError) {
  if (!rootElement) {
    return;
  }
  const buttons = rootElement.querySelectorAll(".copy-btn");
  buttons.forEach((button) => {
    button.addEventListener("click", async () => {
      const originalText = button.textContent;
      const copiedText = button.getAttribute("data-copied-text") || "已複製 ✓";
      const copyValue = button.getAttribute("data-copy-value") || "";
      try {
        await copyTextToClipboard(copyValue);
        button.textContent = copiedText;
        button.classList.add("copied");
        setTimeout(() => {
          button.textContent = originalText;
          button.classList.remove("copied");
        }, 1500);
      } catch (error) {
        onCopyError();
      }
    });
  });
}
