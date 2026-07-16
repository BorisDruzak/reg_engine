import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

import {
  getCardChangeNotificationSubscription,
  updateCardChangeNotificationSubscription,
} from "@/api/client";

const subscriptionQueryKey = (token: string, cardId: string) =>
  ["card-change-notification-subscription", token, cardId] as const;

export function CardChangeNotificationToggle({ token, cardId }: { token: string; cardId: string }) {
  const queryClient = useQueryClient();
  const queryKey = subscriptionQueryKey(token, cardId);
  const subscriptionQuery = useQuery({
    queryKey,
    queryFn: () => getCardChangeNotificationSubscription(token, cardId),
    enabled: Boolean(token && cardId),
  });
  const updateMutation = useMutation({
    mutationFn: (enabled: boolean) =>
      updateCardChangeNotificationSubscription(token, cardId, enabled),
    onSuccess: async () => {
      await queryClient.invalidateQueries({ queryKey });
    },
  });
  const enabled = subscriptionQuery.data?.enabled ?? false;
  const error = subscriptionQuery.error ?? updateMutation.error;

  return (
    <div className="card-change-notification-toggle">
      <button
        type="button"
        className="ghost-button"
        aria-pressed={enabled}
        disabled={subscriptionQuery.isLoading || updateMutation.isPending}
        onClick={() => updateMutation.mutate(!enabled)}
      >
        {enabled ? "Уведомления включены" : "Уведомлять об изменениях"}
      </button>
      {error ? (
        <p className="inline-alert" role="alert">
          Не удалось изменить настройки уведомлений.
        </p>
      ) : null}
    </div>
  );
}
