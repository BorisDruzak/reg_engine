import { ApiError } from "@/api/client";
import { apiErrorMessageLabel, formatUiDateTime, uiText } from "@/app/uiText";

export function errorText(error: unknown) {
  if (error instanceof ApiError) {
    return apiErrorMessageLabel(error.message);
  }
  if (error instanceof Error) {
    return error.message;
  }
  return uiText.requestFailed;
}

export function shortId(value: string) {
  return value.slice(0, 8);
}

export function formatDate(value: string) {
  return formatUiDateTime(value);
}
