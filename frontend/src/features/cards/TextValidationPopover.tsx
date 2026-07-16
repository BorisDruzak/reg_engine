import { useEffect } from "react";

export function TextValidationPopover({
  message,
  visible,
  onDismiss,
}: {
  message: string;
  visible: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    const timeout = window.setTimeout(onDismiss, 4_000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, visible]);

  if (!visible) return null;
  return <div className="text-validation-popover" role="alert">{message}</div>;
}
