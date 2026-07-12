function copyWithTemporaryControl(text: string) {
  const control = document.createElement("textarea");
  control.value = text;
  control.setAttribute("readonly", "");
  control.style.position = "fixed";
  control.style.opacity = "0";
  control.style.pointerEvents = "none";
  document.body.append(control);
  control.select();
  const copied = document.execCommand("copy");
  control.remove();
  if (!copied) {
    throw new Error("Clipboard copy failed");
  }
}

export async function copyTextToClipboard(text: string) {
  const clipboard = typeof navigator === "undefined" ? undefined : navigator.clipboard;
  if (clipboard?.writeText) {
    try {
      await clipboard.writeText(text);
      return;
    } catch {
      // HTTP and restricted browser contexts can reject Clipboard API access.
    }
  }
  copyWithTemporaryControl(text);
}
