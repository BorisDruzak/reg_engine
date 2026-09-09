from datetime import UTC, date, datetime
from io import BytesIO
from textwrap import wrap
from typing import Any
from uuid import UUID

from pydantic import ValidationError
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import (
    Card,
    CardEvent,
    CardEventChange,
    CardExportTemplate,
    CardTemplate,
    FormBlock,
    FormField,
    Organization,
    OrgUnit,
    Registry,
)
from app.schemas.card_export_templates import (
    CardListExportConfiguration,
    PersonnelChangesExportConfiguration,
)
from app.services.audit import AuditService
from app.services.cards import CardService, CardServiceError
from app.services.import_export import (
    TABULAR_XLSX_SUPPORTED_FIELD_TYPES,
    ImportExportServiceError,
    TabularCardExchangeService,
    _openpyxl,
)
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.references import ReferenceListError
from app.services.user_access import UserAccessError, UserAccessService


class CardExportTemplateService:
    """Persist validated export recipes and render only actor-visible card data."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def _authorize(self, actor_user_id: UUID, registry_id: UUID, *, manage: bool) -> None:
        permissions = PermissionService(self.session)
        allowed = permissions.has_permission(
            actor_user_id, "registry.schema.manage", registry_id=registry_id
        )
        if not manage:
            allowed = allowed or bool(
                permissions.get_organization_scope_ids(actor_user_id, registry_id=registry_id)
            )
        if not allowed:
            raise PermissionDeniedError("Недостаточно прав для работы с шаблонами выгрузки.")
        registry = self.session.get(Registry, registry_id)
        if registry is None or registry.archived_at is not None:
            raise ImportExportServiceError("Реестр не найден или недоступен.")

    def list_for_actor(
        self, *, actor_user_id: UUID, registry_id: UUID, include_archive: bool = False
    ) -> list[CardExportTemplate]:
        self._authorize(actor_user_id, registry_id, manage=False)
        query = select(CardExportTemplate).where(CardExportTemplate.registry_id == registry_id)
        if not include_archive:
            query = query.where(CardExportTemplate.archived_at.is_(None))
        return list(
            self.session.scalars(query.order_by(CardExportTemplate.name, CardExportTemplate.id))
        )

    def read_for_actor(
        self, *, actor_user_id: UUID, template_id: UUID, manage: bool = False
    ) -> CardExportTemplate:
        template = self.session.get(
            CardExportTemplate, template_id, with_for_update=manage, populate_existing=manage
        )
        if template is None:
            raise ImportExportServiceError("Шаблон выгрузки не найден или недоступен.")
        self._authorize(actor_user_id, template.registry_id, manage=manage)
        if template.archived_at is not None:
            raise ImportExportServiceError("Шаблон выгрузки архивирован.")
        return template

    def create_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        code: str,
        name: str,
        export_kind: str,
        card_template_id: UUID,
        configuration_json: dict[str, Any],
    ) -> CardExportTemplate:
        self._authorize(actor_user_id, registry_id, manage=True)
        configuration = self._validate_configuration(
            actor_user_id, registry_id, card_template_id, export_kind, configuration_json
        )[0]
        template = CardExportTemplate(
            registry_id=registry_id,
            code=self._required_text(code),
            name=self._required_text(name),
            export_kind=export_kind,
            configuration_json={"card_template_id": str(card_template_id), **configuration},
            created_by=actor_user_id,
            updated_by=actor_user_id,
        )
        self.session.add(template)
        self.session.flush()
        self._audit(actor_user_id, template, "create")
        return template

    def update_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        code: str | None = None,
        name: str | None = None,
        export_kind: str | None = None,
        card_template_id: UUID | None = None,
        configuration_json: dict[str, Any] | None = None,
    ) -> CardExportTemplate:
        template = self.read_for_actor(
            actor_user_id=actor_user_id, template_id=template_id, manage=True
        )
        old = self._snapshot(template)
        previous = dict(template.configuration_json)
        selected_template = card_template_id or UUID(previous.pop("card_template_id"))
        previous.pop("card_template_id", None)
        kind = export_kind or template.export_kind
        configuration = self._validate_configuration(
            actor_user_id,
            template.registry_id,
            selected_template,
            kind,
            configuration_json if configuration_json is not None else previous,
        )[0]
        new_code = self._required_text(code) if code is not None else template.code
        new_name = self._required_text(name) if name is not None else template.name
        template.code, template.name, template.export_kind = new_code, new_name, kind
        template.configuration_json = {"card_template_id": str(selected_template), **configuration}
        template.updated_by = actor_user_id
        self.session.flush()
        self._audit(actor_user_id, template, "update", old)
        return template

    def archive_for_actor(self, *, actor_user_id: UUID, template_id: UUID) -> CardExportTemplate:
        template = self.read_for_actor(
            actor_user_id=actor_user_id, template_id=template_id, manage=True
        )
        old = self._snapshot(template)
        template.archived_at = datetime.now(UTC)
        template.archived_by = actor_user_id
        template.updated_by = actor_user_id
        self.session.flush()
        self._audit(actor_user_id, template, "archive", old)
        return template

    @staticmethod
    def _required_text(value: str) -> str:
        if not value.strip():
            raise ImportExportServiceError("Код и название шаблона обязательны.")
        return value.strip()

    @staticmethod
    def _snapshot(template: CardExportTemplate) -> dict[str, Any]:
        return {
            "code": template.code,
            "name": template.name,
            "export_kind": template.export_kind,
            "configuration_json": template.configuration_json,
            "archived_at": template.archived_at,
        }

    def _audit(
        self,
        actor: UUID,
        template: CardExportTemplate,
        action: str,
        old: dict[str, Any] | None = None,
    ) -> None:
        AuditService(self.session).record_user_event(
            actor_user_id=actor,
            action=action,
            object_type="card_export_template",
            object_id=template.id,
            old_data_json=old,
            new_data_json=self._snapshot(template),
        )

    def _validate_configuration(
        self,
        actor: UUID,
        registry_id: UUID,
        card_template_id: UUID,
        kind: str,
        configuration: dict[str, Any],
    ) -> tuple[dict[str, Any], list[FormField], FormField]:
        try:
            if kind == "card_list":
                parsed = CardListExportConfiguration.model_validate(configuration)
                field_ids = parsed.field_ids
            elif kind == "personnel_changes":
                personnel = PersonnelChangesExportConfiguration.model_validate(configuration)
                parsed = personnel
                field_ids = [
                    personnel.position_field_id,
                    personnel.structural_unit_field_id,
                    personnel.appointment_date_field_id,
                    personnel.appointment_basis_field_id,
                ]
            else:
                raise ImportExportServiceError("Неизвестный вид выгрузки.")
        except ValidationError as exc:
            raise ImportExportServiceError(
                "Заполните корректно все параметры шаблона выгрузки."
            ) from exc
        permissions = PermissionService(self.session)
        if any(
            not permissions.can_see_organization(
                actor, organization_id, registry_id=registry_id
            )
            for organization_id in parsed.organization_ids
        ):
            raise PermissionDeniedError("Нет прав на выбранную организацию.")
        if len(set(field_ids)) != len(field_ids):
            raise ImportExportServiceError("Поля шаблона выгрузки не должны повторяться.")
        template = self.session.get(CardTemplate, card_template_id)
        if (
            template is None
            or template.registry_id != registry_id
            or template.archived_at is not None
            or not template.is_active
        ):
            raise ImportExportServiceError("Шаблон карточки не найден или недоступен.")
        cards = CardService(self.session)
        try:
            fio = cards._require_single_fio_field(template)
        except CardServiceError as exc:
            raise ImportExportServiceError(
                "Шаблон должен содержать одно активное текстовое поле ФИО (fio)."
            ) from exc
        template_ids = cards._template_field_ids(template)
        selected = []
        for field_id in dict.fromkeys([*field_ids, fio.id]):
            field = self.session.get(FormField, field_id)
            block = self.session.get(FormBlock, field.block_id) if field else None
            if (
                field is None
                or block is None
                or field.id not in template_ids
                or block.registry_id != registry_id
                or field.archived_at is not None
                or block.archived_at is not None
                or not field.is_active
                or not block.is_active
            ):
                raise ImportExportServiceError(
                    "Выбранное поле не входит в активный шаблон карточки."
                )
            if (
                not field.is_exportable
                or block.is_repeatable
                or field.field_type not in TABULAR_XLSX_SUPPORTED_FIELD_TYPES
            ):
                raise ImportExportServiceError("Выбранное поле недоступно для табличной выгрузки.")
            if not self._field_visible(actor, field, block):
                raise PermissionDeniedError("Нет прав на поле шаблона выгрузки.")
            if field_id in field_ids:
                selected.append(field)
        if kind == "personnel_changes":
            if selected[2].field_type != "date":
                raise ImportExportServiceError(
                    "Дата назначения должна соответствовать полю типа «Дата»."
                )
            if fio.id in field_ids:
                raise ImportExportServiceError(
                    "Поле ФИО определяется автоматически и не заменяет другие поля."
                )
            normalized = personnel.model_dump(mode="json")
        else:
            normalized = parsed.model_dump(mode="json")
        return normalized, selected, fio

    def _field_visible(self, actor: UUID, field: FormField, block: FormBlock) -> bool:
        return (
            field.sensitivity_level == "normal" and not block.is_admin_only
        ) or PermissionService(self.session).is_superuser(actor)

    def render_for_actor(
        self,
        *,
        actor_user_id: UUID,
        template_id: UUID,
        organization_id: UUID | None = None,
        period_from: date | None = None,
        period_to: date | None = None,
    ) -> bytes:
        template = self.read_for_actor(actor_user_id=actor_user_id, template_id=template_id)
        configuration = dict(template.configuration_json)
        try:
            card_template_id = UUID(configuration.pop("card_template_id"))
        except (KeyError, ValueError, TypeError) as exc:
            raise ImportExportServiceError(
                "Шаблон карточки не задан в настройках выгрузки."
            ) from exc
        configuration, fields, fio = self._validate_configuration(
            actor_user_id,
            template.registry_id,
            card_template_id,
            template.export_kind,
            configuration,
        )
        if template.export_kind == "personnel_changes" and (
            period_from is None or period_to is None or period_from > period_to
        ):
            raise ImportExportServiceError(
                "Укажите корректный период выгрузки: начало и окончание включительно."
            )
        organizations = self._saved_organizations_for_actor(
            actor_user_id, template.registry_id, configuration["organization_ids"]
        )
        book = _openpyxl().Workbook()
        if template.export_kind == "card_list":
            cards = CardService(self.session).list_visible_cards(
                actor_user_id=actor_user_id,
                registry_id=template.registry_id,
                organization_ids=[organization.id for organization in organizations],
                include_descendant_organizations=False,
                card_template_ids=[card_template_id],
            )
            sheet = book.active
            sheet.title = "Карточки"
            self._set_sheet_layout(sheet, [10, *([32] * len(fields))])
            self._append(sheet, ["№ п/п", *(f.label for f in fields)], header=True)
            for ordinal, card in enumerate(cards, 1):
                values = self._values(actor_user_id, card, fields)
                self._append(sheet, [ordinal, *(values.get(f.id) for f in fields)])
            sheet.freeze_panes = "B2"
            sheet.auto_filter.ref = sheet.dimensions
        else:
            assert period_from is not None and period_to is not None
            titles: set[str] = set()
            for ordinal, organization in enumerate(organizations, 1):
                sheet = book.active if ordinal == 1 else book.create_sheet()
                sheet.title = self._personnel_sheet_title(organization.name, ordinal, titles)
                self._set_sheet_layout(sheet, [26, 17, 22, 46])
                cards = CardService(self.session).list_visible_cards(
                    actor_user_id=actor_user_id,
                    registry_id=template.registry_id,
                    organization_ids=[organization.id],
                    include_descendant_organizations=False,
                    card_template_ids=[card_template_id],
                )
                self._personnel(
                    sheet,
                    actor_user_id,
                    organization.name,
                    cards,
                    fields,
                    fio,
                    period_from,
                    period_to,
                )
        for sheet in book.worksheets:
            self._set_print_options(sheet)
        output = BytesIO()
        book.save(output)
        return output.getvalue()

    def _saved_organizations_for_actor(
        self, actor: UUID, registry_id: UUID, organization_ids: list[str]
    ) -> list[Organization]:
        permissions = PermissionService(self.session)
        organizations: list[Organization] = []
        for raw_organization_id in organization_ids:
            organization_id = UUID(raw_organization_id)
            organization = self.session.get(Organization, organization_id)
            if organization is None or not permissions.can_see_organization(
                actor, organization_id, registry_id=registry_id
            ):
                raise PermissionDeniedError("Нет прав на выбранную организацию.")
            organizations.append(organization)
        return organizations

    @staticmethod
    def _personnel_sheet_title(name: str, ordinal: int, existing: set[str]) -> str:
        sanitized = name.translate(str.maketrans({character: " " for character in "[]:*?/\\"})).strip()
        base = (sanitized or "Организация")[:31]
        candidate = base
        suffix = 2
        while candidate.casefold() in existing:
            suffix_text = f" ({suffix})"
            candidate = f"{base[: 31 - len(suffix_text)]}{suffix_text}"
            suffix += 1
        existing.add(candidate.casefold())
        return candidate

    @staticmethod
    def _set_sheet_layout(sheet: Any, widths: list[int]) -> None:
        for index, width in enumerate(widths, 1):
            sheet.column_dimensions[_openpyxl().utils.get_column_letter(index)].width = width

    @staticmethod
    def _set_print_options(sheet: Any) -> None:
        sheet.sheet_properties.pageSetUpPr.fitToPage = True
        sheet.page_setup.orientation = "landscape"
        sheet.page_setup.paperSize = sheet.PAPERSIZE_A4
        sheet.page_setup.fitToWidth = 1
        sheet.page_setup.fitToHeight = 0
        sheet.print_options.horizontalCentered = True
        sheet.print_area = sheet.dimensions

    def _values(self, actor: UUID, card: Card, fields: list[FormField]) -> dict[UUID, object]:
        cards = CardService(self.session)
        read = cards.read_card_for_actor(actor_user_id=actor, card_id=card.id)
        raw = TabularCardExchangeService(self.session)._card_values_by_field(read)
        result: dict[UUID, object] = {}
        for field in fields:
            value = raw.get(field.id)
            if field.field_type == "select" and value is not None:
                options = cards.list_reference_items_for_card_field_for_actor(
                    actor_user_id=actor, card_id=card.id, field_id=field.id
                )
                value = next(
                    (item.label for item in options if item.id == value), "Недоступное значение"
                )
            elif field.field_type in {"organization_ref", "org_unit_ref"} and value is not None:
                resolver = (
                    cards.list_organization_options_for_actor
                    if field.field_type == "organization_ref"
                    else cards.list_org_unit_options_for_actor
                )
                options_read = resolver(actor_user_id=actor, card_id=card.id, field_id=field.id)
                value = next(
                    (item.label for item in options_read if item.id == value),
                    "Недоступное значение",
                )
            result[field.id] = value
        return result

    @staticmethod
    def _text(value: object) -> str:
        if value is None:
            return ""
        if isinstance(value, bool):
            return "Да" if value else "Нет"
        if isinstance(value, date):
            return value.strftime("%d.%m.%Y")
        if isinstance(value, dict):
            if value.get("redacted"):
                return "Скрыто"
            if {"days", "months", "years"} <= value.keys():
                from app.domain.work_experience import format_work_experience, parse_work_experience

                return format_work_experience(
                    parse_work_experience(
                        {key: value[key] for key in ("days", "months", "years")}
                    )
                )
            return "; ".join(
                f"{key}: {CardExportTemplateService._text(item)}" for key, item in value.items()
            )
        if isinstance(value, list):
            return "; ".join(CardExportTemplateService._text(item) for item in value)
        return str(value)

    def _append(
        self, sheet: Any, values: list[object], *, header: bool = False, merge_middle: bool = False
    ) -> None:
        styles = _openpyxl().styles
        wrapped_values = []
        for column, value in enumerate(values, 1):
            width = sheet.column_dimensions[_openpyxl().utils.get_column_letter(column)].width
            if merge_middle and column == 2:
                width += sheet.column_dimensions["C"].width
            wrapped_values.append(
                [
                    segment
                    for line in self._text(value).splitlines()
                    for segment in (wrap(line, max(1, int(width * 0.85))) or [""])
                ]
            )
        max_lines = max((len(lines) for lines in wrapped_values), default=1)
        if not header and max_lines > 26:
            # Excel caps row height at 409.5pt. Continue tall cells on bounded rows.
            for offset in range(0, max_lines, 26):
                part: list[object] = [
                    "\n".join(lines[offset : offset + 26])
                    if isinstance(value, str | dict | list)
                    else value
                    if offset == 0
                    else None
                    for value, lines in zip(values, wrapped_values, strict=True)
                ]
                self._append(sheet, part, merge_middle=merge_middle)
            return
        row = sheet.max_row + 1 if sheet.cell(1, 1).value is not None else 1
        border = styles.Border(
            **{
                side: styles.Side(style="thin", color="000000")
                for side in ("left", "right", "top", "bottom")
            }
        )
        for column, value in enumerate(values, 1):
            cell = sheet.cell(row, column)
            if isinstance(value, datetime):
                value = value.replace(tzinfo=None)
            if isinstance(value, (bool, dict, list)):
                value = self._text(value)
            cell.value = TabularCardExchangeService(self.session)._safe_export_cell_value(value)
            cell.number_format = (
                "DD.MM.YYYY"
                if isinstance(value, date)
                else "@"
                if isinstance(value, str)
                else "General"
            )
            cell.border = border
            cell.alignment = styles.Alignment(
                vertical="center",
                wrap_text=True,
                horizontal="center" if header or isinstance(value, int) else "left",
            )
            cell.font = styles.Font(name="Times New Roman", size=11, bold=header)
        sheet.row_dimensions[row].height = max(30, max_lines * 15)
        if merge_middle:
            sheet.merge_cells(start_row=row, start_column=2, end_row=row, end_column=3)

    def _heading(self, sheet: Any, text: str, *, section: bool = False) -> None:
        self._append(sheet, [text], header=True)
        sheet.row_dimensions[sheet.max_row].height = 18 if section else 22
        if section:
            sheet.cell(sheet.max_row, 1).alignment = _openpyxl().styles.Alignment(
                horizontal="left", vertical="center"
            )
        else:
            sheet.cell(sheet.max_row, 1).border = _openpyxl().styles.Border()
        sheet.merge_cells(
            start_row=sheet.max_row, start_column=1, end_row=sheet.max_row, end_column=4
        )

    def _personnel(
        self,
        sheet: Any,
        actor: UUID,
        organization: str,
        cards: list[Card],
        fields: list[FormField],
        fio: FormField,
        start: date,
        end: date,
    ) -> None:
        self._heading(sheet, "Сведения о кадровых изменениях")
        self._heading(sheet, organization)
        self._heading(sheet, f"За период с {start:%d.%m.%Y} по {end:%d.%m.%Y}")
        values = {card.id: self._values(actor, card, [*fields, fio]) for card in cards}
        position, unit, appointed, basis = fields
        hired = []
        for card in cards:
            value = values[card.id]
            appointed_on = value.get(appointed.id)
            if isinstance(appointed_on, date) and start <= appointed_on <= end:
                hired.append((appointed_on, card.id, value))
        hired.sort(key=lambda item: (item[0], item[1]))
        self._heading(sheet, "Вновь приняты", section=True)
        self._append(
            sheet,
            [
                "Фамилия, имя, отчество",
                "Должность / структурное подразделение",
                None,
                "Дата и основание назначения",
            ],
            header=True,
            merge_middle=True,
        )
        for day, _card, value in hired:
            self._append(
                sheet,
                [
                    value[fio.id] or "Не заполнено",
                    "\n".join(self._text(value[f.id]) for f in (position, unit)),
                    None,
                    f"{self._text(day)}\n{self._text(value[basis.id])}",
                ],
                merge_middle=True,
            )
        if not hired:
            self._append(sheet, ["Нет данных", None, None, None], merge_middle=True)
        events = list(
            self.session.scalars(
                select(CardEvent)
                .where(
                    CardEvent.card_id.in_(values),
                    CardEvent.occurred_on >= start,
                    CardEvent.occurred_on <= end,
                )
                .order_by(CardEvent.occurred_on, CardEvent.card_id, CardEvent.id)
            )
        )
        for kind, title in (("dismissal", "Уволены"), ("change", "Иные изменения")):
            self._heading(sheet, title, section=True)
            self._append(
                sheet,
                [
                    "Фамилия, имя, отчество",
                    "Должность" if kind == "dismissal" else "Содержание изменений",
                    "Дата увольнения" if kind == "dismissal" else None,
                    "Основание" if kind == "dismissal" else "Дата и основание изменений",
                ],
                header=True,
                merge_middle=kind == "change",
            )
            section_events = [event for event in events if event.event_type == kind]
            if not section_events:
                self._append(sheet, ["Нет данных", None, None, None], merge_middle=kind == "change")
            for event in section_events:
                value = values[event.card_id]
                content = (
                    value[position.id] if kind == "dismissal" else self._change_text(actor, event)
                )
                self._append(
                    sheet,
                    [
                        value[fio.id] or "Не заполнено",
                        content,
                        event.occurred_on if kind == "dismissal" else None,
                        event.basis_text
                        if kind == "dismissal"
                        else f"{event.occurred_on:%d.%m.%Y}\n{event.basis_text}",
                    ],
                    merge_middle=kind == "change",
                )

    def _change_text(self, actor: UUID, event: CardEvent) -> str:
        card = self.session.get(Card, event.card_id)
        assert card is not None
        changes = self.session.scalars(
            select(CardEventChange)
            .where(CardEventChange.card_event_id == event.id)
            .order_by(CardEventChange.field_id, CardEventChange.id)
        )
        lines = []
        for change in changes:
            field = self.session.get(FormField, change.field_id)
            block = self.session.get(FormBlock, field.block_id) if field else None
            if (
                field is None
                or block is None
                or not field.is_exportable
                or not self._field_visible(actor, field, block)
            ):
                continue
            old, new = change.old_value_json or {}, change.new_value_json or {}
            label = new.get("field", {}).get("label") or old.get("field", {}).get("label") or "Поле"
            lines.append(
                f"{label}: {self._snapshot_text(actor, card, field, old)} → "
                f"{self._snapshot_text(actor, card, field, new)}"
            )
        return "\n".join(lines) or "Изменены сведения карточки"

    def _snapshot_text(
        self, actor: UUID, card: Card, field: FormField, snapshot: dict[str, Any]
    ) -> str:
        value = snapshot.get("value")
        if value is None or isinstance(value, dict) and value.get("redacted"):
            return self._text(value)
        kind = snapshot.get("field", {}).get("type", field.field_type)
        if kind in {
            "select",
            "multi_select",
            "organization_ref",
            "org_unit_ref",
            "card_ref",
            "registry_ref",
            "user_ref",
        }:
            raw_values = value if isinstance(value, list) else [value]
            labels = []
            for raw in raw_values:
                try:
                    reference_id = UUID(str(raw))
                except (ValueError, TypeError, AttributeError):
                    labels.append("Недоступное значение")
                    continue
                labels.append(
                    self._historical_reference_label(actor, card, field, kind, reference_id)
                )
            return "; ".join(labels)
        if kind in {"date", "datetime"} and isinstance(value, str):
            try:
                if kind == "date":
                    return date.fromisoformat(value).strftime("%d.%m.%Y")
                return datetime.fromisoformat(value).strftime("%d.%m.%Y %H:%M")
            except ValueError:
                return "Недоступное значение"
        return self._text(value)

    def _historical_reference_label(
        self, actor: UUID, card: Card, field: FormField, kind: str, reference_id: UUID
    ) -> str:
        unavailable = "Недоступное значение"
        permissions = PermissionService(self.session)
        try:
            if kind in {"select", "multi_select"}:
                options = CardService(self.session).list_reference_items_for_card_field_for_actor(
                    actor_user_id=actor, card_id=card.id, field_id=field.id
                )
                return next(
                    (option.label for option in options if option.id == reference_id), unavailable
                )
            if kind == "organization_ref":
                if permissions.can_see_organization(
                    actor, reference_id, registry_id=card.registry_id
                ):
                    organization = self.session.get(Organization, reference_id)
                    return organization.name if organization else unavailable
            elif kind == "org_unit_ref":
                unit = self.session.get(OrgUnit, reference_id)
                if unit and permissions.can_see_organization(
                    actor, unit.organization_id, registry_id=card.registry_id
                ):
                    return unit.name
            elif kind == "card_ref":
                target = self.session.get(Card, reference_id)
                if target and permissions.can_see_organization(
                    actor, target.organization_id, registry_id=target.registry_id
                ):
                    return CardService(self.session).card_display_value(target) or "Не заполнено"
            elif kind == "registry_ref":
                self._authorize(actor, reference_id, manage=False)
                registry = self.session.get(Registry, reference_id)
                return registry.name if registry else unavailable
            elif kind == "user_ref":
                return (
                    UserAccessService(self.session)
                    .read_user_for_actor(actor_user_id=actor, user_id=reference_id)
                    .display_name
                )
        except (
            PermissionDeniedError,
            CardServiceError,
            ReferenceListError,
            ImportExportServiceError,
            UserAccessError,
        ):
            return unavailable
        return unavailable
