import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useRef, useState } from "react";

import {
  listCardChangeNotifications,
  markAllCardChangeNotificationsRead,
  markCardChangeNotificationRead,
} from "@/api/client";
import { errorText } from "@/components/common/dataUtils";
import { formatValue } from "@/features/cards/fieldEditorUtils";

const inboxQueryKey = (token: string) => ["card-change-notifications", token] as const;
const unavailableValue = "Недоступно";

export function CardChangeNotificationBell({
  token,
  onOpenCard,
}: {
  token: string;
  onOpenCard: (cardId: string) => void | Promise<void>;
}) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const shellRef = useRef<HTMLDivElement>(null);
  const queryKey = inboxQueryKey(token);
  const inboxQuery = useQuery({
    queryKey,
    queryFn: () => listCardChangeNotifications(token),
    enabled: Boolean(token),
    refetchInterval: 10_000,
    refetchOnWindowFocus: false,
    staleTime: 15_000,
  });
  const markReadMutation = useMutation({
    mutationFn: (notificationId: string) => markCardChangeNotificationRead(token, notificationId),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const markAllReadMutation = useMutation({
    mutationFn: () => markAllCardChangeNotificationsRead(token),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const unreadCount = inboxQuery.data?.unread_count ?? 0;
  const bellLabel = notificationBellLabel(unreadCount);
  const error = inboxQuery.error ?? markReadMutation.error ?? markAllReadMutation.error;

  useEffect(() => {
    if (!open) return;

    const dismissOnOutsidePointer = (event: PointerEvent) => {
      if (!(event.target instanceof Node) || !shellRef.current?.contains(event.target)) {
        setOpen(false);
      }
    };
    const dismissOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    document.addEventListener("pointerdown", dismissOnOutsidePointer);
    document.addEventListener("keydown", dismissOnEscape);
    return () => {
      document.removeEventListener("pointerdown", dismissOnOutsidePointer);
      document.removeEventListener("keydown", dismissOnEscape);
    };
  }, [open]);

  async function handleOpenNotification(notificationId: string, cardId: string) {
    try {
      await markReadMutation.mutateAsync(notificationId);
      setOpen(false);
      await onOpenCard(cardId);
    } catch {
      // The existing Russian error mapping is rendered below; keep the current panel available.
    }
  }

  return (
    <div ref={shellRef} className="notification-bell-shell">
      <button
        type="button"
        className="notification-bell"
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-label={bellLabel}
        onClick={() => setOpen((current) => !current)}
      >
        <BellIcon />
        {unreadCount > 0 ? <span className="notification-bell-count">{unreadCount}</span> : null}
      </button>
      {open ? (
        <section
          className="notification-popover"
          role="dialog"
          aria-modal="false"
          aria-label="Уведомления"
        >
          <header className="notification-popover-header">
            <h3>Уведомления</h3>
            <button
              type="button"
              className="ghost-button"
              disabled={unreadCount === 0 || markAllReadMutation.isPending}
              onClick={() => markAllReadMutation.mutate()}
            >
              Отметить все прочитанными
            </button>
          </header>
          <div className="notification-popover-content">
            {error ? (
              <p className="data-alert" role="alert">
                {errorText(error)}
              </p>
            ) : null}
            {inboxQuery.isLoading ? <p className="data-empty">Загрузка уведомлений...</p> : null}
            {!inboxQuery.isLoading && !error && (inboxQuery.data?.items.length ?? 0) === 0 ? (
              <p className="data-empty">Новых уведомлений нет</p>
            ) : null}
            {!inboxQuery.isLoading && !error && (inboxQuery.data?.items.length ?? 0) > 0 ? (
              <div className="notification-list">
                {inboxQuery.data?.items.map((notification) => (
                  <button
                    type="button"
                    key={notification.id}
                    className={
                      notification.read_at ? "notification-row" : "notification-row is-unread"
                    }
                    disabled={markReadMutation.isPending}
                    onClick={() => handleOpenNotification(notification.id, notification.card_id)}
                  >
                    <strong>{notification.card_display_name}</strong>
                    <span className="notification-row-meta">{notification.actor_display_name}</span>
                    {notification.changes.map((change, index) => (
                      <span
                        className="notification-change"
                        key={`${notification.id}:${change.label}:${index}`}
                      >
                        <b>{change.label}</b>
                        <span>Было: {formatNotificationValue(change.before)}</span>
                        <span>Стало: {formatNotificationValue(change.after)}</span>
                      </span>
                    ))}
                  </button>
                ))}
              </div>
            ) : null}
          </div>
        </section>
      ) : null}
    </div>
  );
}

function notificationBellLabel(unreadCount: number) {
  if (unreadCount === 0) {
    return "Уведомления: новых нет";
  }
  if (unreadCount === 1) {
    return "Уведомления: 1 непрочитанное";
  }
  return `Уведомления: ${unreadCount} непрочитанных`;
}

function formatNotificationValue(value: unknown): string {
  if (
    value === "Недоступное значение" ||
    (value !== null && typeof value === "object" && !Array.isArray(value))
  ) {
    return unavailableValue;
  }
  if (Array.isArray(value)) {
    return value.some((item) => item !== null && typeof item === "object")
      ? unavailableValue
      : value.map(formatNotificationValue).join(", ");
  }
  return formatValue(value);
}

function BellIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 24 24" focusable="false">
      <path d="M18 9a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4" />
    </svg>
  );
}
