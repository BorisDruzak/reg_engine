export const uiText = {
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

export function formatUiDateTime(value: string) {
  return new Intl.DateTimeFormat("ru-RU", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}
