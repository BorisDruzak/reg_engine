export const uiText = {
  productName: "Реестровая система",
  brandSubtitle: "Базовая схема v1",
  adminWorkspace: "Панель администратора",
  publicCardEdit: "Публичное редактирование карточки",
  signedIn: "Вход выполнен",
  signIn: "Войти",
  signingIn: "Вход...",
  signOut: "Выйти",
  email: "Электронная почта",
  password: "Пароль",
  overview: "Обзор",
  organizations: "Организации",
  registries: "Реестры",
  cards: "Карточки",
  users: "Пользователи",
  access: "Доступ",
  audit: "Аудит",
  primaryNavigation: "Основная навигация",
  summary: "Сводка",
  organizationName: "Название",
  displayName: "Имя",
  code: "Код",
  type: "Тип",
  status: "Статус",
  schemaBlocks: "Блоки формы",
  schemaFields: "Поля формы",
  technicalCode: "Технический код",
  title: "Название",
  repeatable: "Повторяемый",
  field: "Поле",
  block: "Блок",
  options: "Варианты",
  cardFields: "Поля карточки",
  currentValue: "Текущее значение",
  save: "Сохранить",
  saved: "Сохранено",
  roles: "Роли",
  permissions: "Права",
  user: "Пользователь",
  role: "Роль",
  superuser: "Суперпользователь",
  organization: "Организация",
  scope: "Область",
  accessGrants: "Права доступа",
  action: "Действие",
  object: "Объект",
  source: "Источник",
  time: "Время",
  publicEdit: "Публичное редактирование",
  publicTokenMissing: "Токен публичной ссылки отсутствует.",
  loadingCard: "Загрузка карточки",
  expires: "Действует до",
  noEditablePublicFields: "В этой публичной ссылке нет редактируемых полей.",
  requestFailed: "Запрос не выполнен",
  noData: "Нет данных",
  invalidEmailOrPassword: "Неверная электронная почта или пароль.",
  bearerTokenRequired: "Нужен действующий сеанс. Войдите снова.",
  bearerTokenExpired: "Срок действия сеанса истек. Войдите снова.",
  bearerTokenInvalid: "Сеанс недействителен. Войдите снова.",
  bearerTokenUserInactive: "Пользователь отключен или недоступен.",
  integrityConstraintViolation: "Данные нарушают ограничения базы.",
  internalServiceError: "Внутренняя ошибка сервиса.",
  notFound: "Запись не найдена.",
  empty: "Пусто",
  jsonObjectRequired: "JSON-поле должно содержать объект.",
  numberRequired: "Числовое поле должно содержать число.",
  yes: "Да",
  no: "Нет",
  none: "Нет",
  global: "Глобально",
  descendants: "С потомками",
  exact: "Только выбранная",
} as const;

const sectionLabels = {
  overview: uiText.overview,
  organizations: uiText.organizations,
  registries: uiText.registries,
  cards: uiText.cards,
  users: uiText.users,
  access: uiText.access,
  audit: uiText.audit,
} as const;

export const visibleSections = Object.entries(sectionLabels).map(([id, label]) => ({
  id: id as VisibleSection,
  label,
}));

export type VisibleSection = keyof typeof sectionLabels;

export function sectionLabel(section: VisibleSection) {
  return sectionLabels[section];
}

export function saveLabel(label: string) {
  return `${uiText.save} ${label}`;
}

export function savedLabel(label: string) {
  return `${uiText.saved}: ${label}`;
}

export function instanceLabel(ordinal: number) {
  return `экземпляр ${ordinal + 1}`;
}

export function booleanLabel(value: boolean) {
  return value ? uiText.yes : uiText.no;
}

export function activityLabel(value: boolean) {
  return value ? "Активно" : "Неактивно";
}

export function fallbackLabel(value: string | null | undefined) {
  if (!value) {
    return uiText.none;
  }
  return value;
}

export function organizationTypeLabel(value: string) {
  const labels: Record<string, string> = {
    organization: "Организация",
    department: "Подразделение",
    unit: "Отдел",
  };
  return labels[value] ?? value;
}

export function fieldTypeLabel(value: string) {
  const labels: Record<string, string> = {
    bool: "Да/нет",
    card_ref: "Ссылка на карточку",
    date: "Дата",
    datetime: "Дата и время",
    json: "JSON",
    multi_select: "Множественный выбор",
    number: "Число",
    organization_ref: "Ссылка на организацию",
    org_unit_ref: "Ссылка на подразделение",
    registry_ref: "Ссылка на реестр",
    select: "Выбор",
    text: "Текст",
    user_ref: "Ссылка на пользователя",
  };
  return labels[value] ?? value;
}

export function optionsSourceLabel(value: string | null | undefined) {
  const labels: Record<string, string> = {
    reference_list: "Справочник",
  };
  return value ? (labels[value] ?? value) : uiText.none;
}

export function lifecycleStatusLabel(value: string) {
  const labels: Record<string, string> = {
    active: "Активно",
    archived: "Архив",
    draft: "Черновик",
    inactive: "Неактивно",
    superseded: "Заменено",
  };
  return labels[value] ?? value;
}

export function grantScopeLabel(includeDescendants: boolean) {
  return includeDescendants ? uiText.descendants : uiText.exact;
}

export function roleDisplayNameLabel(code: string, fallbackName: string) {
  const labels: Record<string, string> = {
    auditor: "Аудитор",
    org_admin: "Администратор организации",
    registry_admin: "Администратор реестра",
    system_admin: "Системный администратор",
  };
  return labels[code] ?? fallbackName;
}

export function userDisplayNameLabel(value: string) {
  const labels: Record<string, string> = {
    "System Admin": "Системный администратор",
    "System admin": "Системный администратор",
  };
  return labels[value] ?? value;
}

export function roleDescriptionLabel(code: string, fallbackDescription: string | null | undefined) {
  const labels: Record<string, string> = {
    auditor: "Роль только для чтения аудита.",
    org_admin: "Управление веткой организации и карточками.",
    registry_admin: "Управление схемой реестра и карточками.",
    system_admin: "Полное администрирование системы.",
  };
  return labels[code] ?? fallbackDescription ?? "";
}

export function permissionDescriptionLabel(
  code: string,
  fallbackDescription: string | null | undefined,
) {
  const labels: Record<string, string> = {
    "access_grants.manage": "Управление правами доступа.",
    "audit.read": "Чтение событий аудита.",
    "cards.manage": "Управление карточками в разрешенной области организаций.",
    "organizations.manage": "Управление организациями в разрешенной области.",
    "permissions.read": "Чтение прав.",
    "registry.schema.manage": "Управление схемой реестра, блоками и полями.",
    "roles.read": "Чтение ролей.",
    "users.manage": "Управление пользователями.",
  };
  return labels[code] ?? fallbackDescription ?? "";
}

export function auditActionLabel(value: string) {
  const labels: Record<string, string> = {
    archive: "Архивация",
    create: "Создание",
    delete: "Удаление",
    public_edit: "Публичное редактирование",
    public_link_create: "Создание публичной ссылки",
    transfer: "Перевод",
    update: "Обновление",
  };
  return labels[value] ?? value;
}

export function auditObjectTypeLabel(value: string) {
  const labels: Record<string, string> = {
    access_grant: "Право доступа",
    card: "Карточка",
    field_value: "Значение поля",
    form_block: "Блок формы",
    form_field: "Поле формы",
    organization: "Организация",
    public_link: "Публичная ссылка",
    reference_item: "Элемент справочника",
    reference_list: "Справочник",
    registry: "Реестр",
    role: "Роль",
    user: "Пользователь",
  };
  return labels[value] ?? value;
}

export function auditSourceLabel(value: string | null | undefined) {
  if (!value) {
    return uiText.none;
  }
  const labels: Record<string, string> = {
    api: "API",
    public_link: "Публичная ссылка",
    system: "Система",
  };
  return labels[value] ?? value;
}

export function apiErrorMessageLabel(message: string) {
  const labels: Record<string, string> = {
    "Bearer token has expired.": uiText.bearerTokenExpired,
    "Bearer token is required.": uiText.bearerTokenRequired,
    "Bearer token user is not active.": uiText.bearerTokenUserInactive,
    "Field value references a missing field.": uiText.notFound,
    "Form field was not found.": uiText.notFound,
    "Integrity constraint violation.": uiText.integrityConstraintViolation,
    "Internal service error.": uiText.internalServiceError,
    "Invalid bearer token.": uiText.bearerTokenInvalid,
    "Invalid email or password.": uiText.invalidEmailOrPassword,
    "Not Found": uiText.notFound,
    "Temporary dev actor header is disabled. Use production auth when available.":
      uiText.bearerTokenRequired,
  };
  if (message.startsWith("Unsupported field type:")) {
    return "Неподдерживаемый тип поля.";
  }
  return labels[message] ?? uiText.requestFailed;
}

export function runtimeErrorMessageLabel(message: string) {
  const localMessages = new Set<string>([uiText.jsonObjectRequired, uiText.numberRequired]);
  return localMessages.has(message) ? message : apiErrorMessageLabel(message);
}

export function formatUiDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
