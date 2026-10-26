import { apiRequest } from "@/api/client";
import type { WorkExperienceValue } from "@/api/types";

export type MunicipalServiceKind =
  | "municipal"
  | "municipal_office"
  | "civil"
  | "state_office"
  | "military_contract"
  | "military_conscription"
  | "other_state"
  | "other_legal"
  | "municipal_additional";
export const municipalServiceKinds: Record<MunicipalServiceKind, string> = {
  municipal: "Муниципальная служба",
  municipal_office: "Муниципальная должность",
  civil: "Государственная гражданская служба",
  state_office: "Государственная должность",
  military_contract: "Военная служба по контракту",
  military_conscription: "Военная служба по призыву (×2)",
  other_state: "Иная государственная служба",
  other_legal: "Иные периоды по закону",
  municipal_additional: "Дополнительные периоды по муниципальному акту",
};
export type MunicipalServicePeriod = {
  id: string;
  kind: MunicipalServiceKind;
  start_date: string;
  end_date: string | null;
  included: boolean;
  confirmed: boolean;
  basis: string;
  pension_only: boolean;
};
export type MunicipalServiceBaseline = {
  years: number;
  months: number;
  days: number;
  as_of_date: string;
  basis: string;
  confirmed: boolean;
};
export type MunicipalServiceCalculation = {
  mode: "calculated";
  version: 1;
  method: "calendar_remainder_30_v1";
  periods: MunicipalServicePeriod[];
  baseline: MunicipalServiceBaseline | null;
};
export type MunicipalServiceResult = {
  value: WorkExperienceValue;
  as_of_date: string;
  server_date: string;
  forecast: boolean;
  included_count: number;
  excluded_count: number;
  review_count: number;
  overlaps: { period_ids: string[]; start_date: string; end_date: string; conflict: boolean }[];
  warnings: string[];
  can_save: boolean;
};
export type MunicipalServiceRead = {
  calculation: MunicipalServiceCalculation | null;
  result: MunicipalServiceResult | null;
  manual_value: WorkExperienceValue | null;
  manual_input?: WorkExperienceValue | null;
  manual_as_of_date?: string | null;
  server_date: string;
  source_date: string | null;
  can_manage: boolean;
  revision: string;
};
export type MunicipalServicePreviewRequest = {
  calculation: MunicipalServiceCalculation;
  as_of_date: string;
  block_instance_id: string | null;
};
export type MunicipalServiceSaveRequest = MunicipalServicePreviewRequest & {
  basis_text?: string;
  occurred_on?: string;
  expected_revision: string;
};
export type MunicipalServiceManualRequest = {
  days: number;
  months: number;
  years: number;
  confirm_manual: true;
  block_instance_id: string | null;
  basis_text?: string;
  occurred_on?: string;
  expected_revision: string;
  as_of_date?: string;
};
function endpoint(cardId: string, fieldId: string) {
  return `/api/v1/cards/${encodeURIComponent(cardId)}/fields/${encodeURIComponent(fieldId)}/municipal-service-experience`;
}
export function getMunicipalServiceExperience(
  token: string,
  cardId: string,
  fieldId: string,
  blockInstanceId: string | null,
) {
  const query = blockInstanceId
    ? `?${new URLSearchParams({ block_instance_id: blockInstanceId })}`
    : "";
  return apiRequest<MunicipalServiceRead>(`${endpoint(cardId, fieldId)}${query}`, { token });
}
export function previewMunicipalServiceExperience(
  token: string,
  cardId: string,
  fieldId: string,
  payload: MunicipalServicePreviewRequest,
) {
  return apiRequest<MunicipalServiceResult>(`${endpoint(cardId, fieldId)}/preview`, {
    token,
    method: "POST",
    body: payload,
  });
}
export function saveMunicipalServiceExperience(
  token: string,
  cardId: string,
  fieldId: string,
  payload: MunicipalServiceSaveRequest,
) {
  return apiRequest<MunicipalServiceRead>(endpoint(cardId, fieldId), {
    token,
    method: "PUT",
    body: payload,
  });
}
export function setManualMunicipalServiceExperience(
  token: string,
  cardId: string,
  fieldId: string,
  payload: MunicipalServiceManualRequest,
) {
  return apiRequest<MunicipalServiceRead>(`${endpoint(cardId, fieldId)}/manual`, {
    token,
    method: "POST",
    body: payload,
  });
}
