import { useEffect } from "react";

export function TextValidationPopover({
  messages,
  visible,
  onDismiss,
}: {
  messages: string[];
  visible: boolean;
  onDismiss: () => void;
}) {
  useEffect(() => {
    if (!visible) return;
    const timeout = window.setTimeout(onDismiss, 4_000);
    return () => window.clearTimeout(timeout);
  }, [onDismiss, visible]);

  if (!visible) return null;
  return (
    <div className="text-validation-popover" role="alert">
      {messages.length === 1 ? (
        messages[0]
      ) : (
        <ul>
          {messages.map((message) => (
            <li key={message}>{message}</li>
          ))}
        </ul>
      )}
    </div>
  );
}
