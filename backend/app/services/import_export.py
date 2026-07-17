import json
import zipfile
from collections.abc import Sequence
from dataclasses import dataclass
from datetime import date, datetime
from decimal import Decimal
from importlib import import_module
from io import BytesIO
from typing import Any, Literal, cast
from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.models import (
    Card,
    CardTemplate,
    FormBlock,
    FormField,
    Organization,
    OrgUnit,
    ReferenceItem,
    Registry,
)
from app.models.registry_schema import DEFAULT_CARD_TITLE_LABEL
from app.services.audit import AuditService
from app.services.cards import (
    CardRead,
    CardService,
    InvalidFieldValueError,
)
from app.services.permissions import PermissionDeniedError, PermissionService
from app.services.references import ReferenceListError, ReferenceListService

TABULAR_XLSX_ORDINAL_HEADER = "№ п/п"
TABULAR_XLSX_ORGANIZATION_HEADER = "Организация"
TABULAR_XLSX_SUPPORTED_FIELD_TYPES = {
    "text",
    "number",
    "date",
    "datetime",
    "bool",
    "select",
    "organization_ref",
    "org_unit_ref",
    "work_experience",
}
TABULAR_XLSX_FORMAT_VERSION = "tabular_card_xlsx_v2"
TABULAR_XLSX_SHEET_TITLE = "Карточки"
TABULAR_XLSX_METADATA_SHEET_TITLE = "_registry_engine"
TABULAR_XLSX_TEMPLATE_ROW_COUNT = 100
TABULAR_XLSX_MAX_ZIP_ENTRIES = 1_000
WORK_EXPERIENCE_COMPONENTS: tuple[
    Literal["days", "months", "years"],
    Literal["days", "months", "years"],
    Literal["days", "months", "years"],
] = ("days", "months", "years")
WORK_EXPERIENCE_PARTIAL_ERROR = (
    "заполните дни, месяцы и годы стажа либо оставьте все три значения пустыми."
)


def tabular_xlsx_title_header(card_title_label: object | None) -> str:
    if isinstance(card_title_label, str) and card_title_label.strip():
        return card_title_label.strip()
    return DEFAULT_CARD_TITLE_LABEL


def tabular_xlsx_fixed_headers(
    include_organization_column: bool,
    title_header: str = DEFAULT_CARD_TITLE_LABEL,
) -> tuple[str, ...]:
    return (
        (TABULAR_XLSX_ORDINAL_HEADER, title_header, TABULAR_XLSX_ORGANIZATION_HEADER)
        if include_organization_column
        else (TABULAR_XLSX_ORDINAL_HEADER, title_header)
    )


class ImportExportServiceError(ValueError):
    """Raised when import/export operations receive invalid parameters."""


class TabularCardImportValidationError(ImportExportServiceError):
    """Raised when a tabular XLSX upload contains preview errors."""

    def __init__(self, preview: dict[str, Any]) -> None:
        super().__init__("XLSX import contains invalid rows.")
        self.preview = preview


@dataclass(frozen=True)
class TabularWorkbookField:
    field: FormField
    block: FormBlock
    header: str


@dataclass(frozen=True)
class TabularWorkbookColumn:
    workbook_field: TabularWorkbookField
    header: str
    work_experience_component: Literal["days", "months", "years"] | None = None


@dataclass(frozen=True)
class TabularWorkbookConfiguration:
    registry_id: UUID
    template: CardTemplate
    fields: tuple[TabularWorkbookField, ...]
    organizations: tuple[Organization, ...]
    include_organization_column: bool
    fixed_organization_id: UUID | None
    organization_labels: dict[str, UUID]
    reference_labels: dict[UUID, dict[str, UUID]]
    unit_organization_ids: dict[UUID, UUID]
    import_mode: Literal["strict", "enrich_global_references"] = "strict"
    work_experience_as_of_date: date | None = None
    title_header: str = DEFAULT_CARD_TITLE_LABEL


@dataclass(frozen=True)
class _PendingGlobalImportReference:
    field_id: UUID
    raw_label: str
    list_id: UUID | None = None


@dataclass(frozen=True)
class _PlannedGlobalImportReference:
    list_id: UUID
    normalized_label: str
    display_label: str
    field_label: str


class TabularCardExchangeService:
    """Build and import the Russian-first wide card XLSX workbook."""

    def __init__(self, session: Session) -> None:
        self.session = session

    def options_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
    ) -> dict[str, Any]:
        permissions = PermissionService(self.session)
        if not permissions.has_permission(actor_user_id, "cards.manage", registry_id=registry_id):
            raise PermissionDeniedError("Недостаточно прав для работы с карточками реестра.")

        blocks = list(
            self.session.scalars(
                select(FormBlock)
                .where(FormBlock.registry_id == registry_id, FormBlock.archived_at.is_(None))
                .order_by(FormBlock.position, FormBlock.id)
            )
        )
        fields = list(
            self.session.scalars(
                select(FormField)
                .join(FormBlock, FormBlock.id == FormField.block_id)
                .where(
                    FormBlock.registry_id == registry_id,
                    FormBlock.archived_at.is_(None),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                    FormField.is_exportable.is_(True),
                )
                .order_by(FormBlock.position, FormField.position, FormField.id)
            )
        )
        blocks_by_id = {block.id: block for block in blocks}
        templates = list(
            self.session.scalars(
                select(CardTemplate)
                .where(
                    CardTemplate.registry_id == registry_id,
                    CardTemplate.archived_at.is_(None),
                    CardTemplate.is_active.is_(True),
                )
                .order_by(CardTemplate.position, CardTemplate.id)
            )
        )
        organizations = self._manageable_organizations(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )

        return {
            "registry_id": str(registry_id),
            "organizations": [
                {
                    "id": str(organization.id),
                    "name": organization.name,
                    "label": self._organization_label(organization),
                }
                for organization in organizations
            ],
            "templates": [
                {
                    "id": str(template.id),
                    "name": template.name,
                    "fields": [
                        self._field_option(
                            field=field,
                            block=blocks_by_id[field.block_id],
                        )
                        for field in fields
                        if field.id in self._template_field_ids(template)
                        and self._is_exportable_field(field)
                    ],
                }
                for template in templates
            ],
        }

    def export_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        card_template_id: UUID,
        field_ids: Sequence[UUID],
        organization_ids: Sequence[UUID],
        include_organization_column: bool = False,
        fixed_organization_id: UUID | None = None,
        import_mode: Literal["strict", "enrich_global_references"] = "strict",
        work_experience_as_of_date: date | None = None,
    ) -> bytes:
        configuration = self._configuration_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=card_template_id,
            field_ids=field_ids,
            organization_ids=organization_ids,
            include_organization_column=include_organization_column,
            fixed_organization_id=fixed_organization_id,
            import_mode=import_mode,
            work_experience_as_of_date=work_experience_as_of_date or date.today(),
            require_fixed_organization=False,
        )
        cards = CardService(self.session).list_visible_cards(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            organization_ids=list(organization_ids),
            include_descendant_organizations=False,
            card_template_ids=[card_template_id],
        )
        content = self._build_workbook(
            actor_user_id=actor_user_id,
            configuration=configuration,
            cards=cards,
        )
        AuditService(self.session).record_user_event(
            actor_user_id=actor_user_id,
            action="export",
            object_type="registry",
            object_id=registry_id,
            new_data_json={
                "export_type": "cards",
                "format": "tabular_xlsx",
                "card_template_id": str(card_template_id),
                "field_count": len(configuration.fields),
                "organization_count": len(configuration.organizations),
                "card_count": len(cards),
            },
        )
        return content

    def import_template_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        card_template_id: UUID,
        field_ids: Sequence[UUID],
        organization_ids: Sequence[UUID],
        include_organization_column: bool = False,
        fixed_organization_id: UUID | None = None,
        import_mode: Literal["strict", "enrich_global_references"] = "strict",
        work_experience_as_of_date: date | None = None,
    ) -> bytes:
        configuration = self._configuration_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=card_template_id,
            field_ids=field_ids,
            organization_ids=organization_ids,
            include_organization_column=include_organization_column,
            fixed_organization_id=fixed_organization_id,
            import_mode=import_mode,
            work_experience_as_of_date=work_experience_as_of_date or date.today(),
            require_fixed_organization=True,
        )
        return self._build_workbook(
            actor_user_id=actor_user_id,
            configuration=configuration,
            cards=None,
        )

    def _configuration_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        card_template_id: UUID,
        field_ids: Sequence[UUID],
        organization_ids: Sequence[UUID],
        include_organization_column: bool,
        fixed_organization_id: UUID | None,
        import_mode: Literal["strict", "enrich_global_references"] = "strict",
        work_experience_as_of_date: date | None = None,
        require_fixed_organization: bool,
    ) -> TabularWorkbookConfiguration:
        if not field_ids:
            raise ImportExportServiceError("Выберите хотя бы одно поле для XLSX.")
        if not organization_ids:
            raise ImportExportServiceError("Выберите хотя бы одну организацию для XLSX.")
        if len(set(field_ids)) != len(field_ids):
            raise ImportExportServiceError("Поля XLSX не должны повторяться.")
        if len(set(organization_ids)) != len(organization_ids):
            raise ImportExportServiceError("Организации XLSX не должны повторяться.")

        permissions = PermissionService(self.session)
        if not permissions.has_permission(actor_user_id, "cards.manage", registry_id=registry_id):
            raise PermissionDeniedError("Недостаточно прав для работы с карточками реестра.")

        template = self.session.get(CardTemplate, card_template_id)
        if (
            template is None
            or template.registry_id != registry_id
            or template.archived_at is not None
            or not template.is_active
        ):
            raise ImportExportServiceError("Шаблон карточки не найден или недоступен.")
        registry = self.session.get(Registry, registry_id)
        if registry is None or registry.archived_at is not None:
            raise ImportExportServiceError("Реестр не найден или недоступен.")

        blocks = list(
            self.session.scalars(
                select(FormBlock)
                .where(FormBlock.registry_id == registry_id, FormBlock.archived_at.is_(None))
                .order_by(FormBlock.position, FormBlock.id)
            )
        )
        blocks_by_id = {block.id: block for block in blocks}
        fields_by_id = {
            field.id: field
            for field in self.session.scalars(
                select(FormField)
                .join(FormBlock, FormBlock.id == FormField.block_id)
                .where(
                    FormBlock.registry_id == registry_id,
                    FormBlock.archived_at.is_(None),
                    FormField.archived_at.is_(None),
                    FormField.is_active.is_(True),
                    FormField.is_exportable.is_(True),
                )
            )
        }
        template_field_ids = self._template_field_ids(template)
        selected_fields: list[tuple[FormField, FormBlock]] = []
        for field_id in field_ids:
            field = fields_by_id.get(field_id)
            block = blocks_by_id.get(field.block_id) if field is not None else None
            if field is None or block is None or field.id not in template_field_ids:
                raise ImportExportServiceError("Выбранное поле не входит в шаблон карточки.")
            if not self._is_supported_field(field, block):
                raise ImportExportServiceError(
                    f"Поле «{field.label}» нельзя использовать в табличном XLSX."
                )
            selected_fields.append((field, block))

        ordered_fields = self._order_selected_fields(selected_fields)

        manageable_organizations = self._manageable_organizations(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
        )
        manageable_by_id = {
            organization.id: organization for organization in manageable_organizations
        }
        organizations: list[Organization] = []
        for organization_id in organization_ids:
            organization = manageable_by_id.get(organization_id)
            if organization is None:
                raise PermissionDeniedError("Нет прав на выбранную организацию.")
            organizations.append(organization)

        if include_organization_column:
            if fixed_organization_id is not None:
                raise ImportExportServiceError(
                    "Организация импорта задаётся только при скрытой колонке XLSX."
                )
        elif (
            fixed_organization_id is not None
            and not any(organization.id == fixed_organization_id for organization in organizations)
        ) or (require_fixed_organization and fixed_organization_id is None):
            raise ImportExportServiceError(
                "Выберите организацию для импорта при скрытой колонке XLSX."
            )

        headers = self._field_headers(ordered_fields)
        fields = tuple(
            TabularWorkbookField(field=field, block=block, header=headers[field.id])
            for field, block in ordered_fields
        )
        reference_labels = self._reference_labels(fields)
        reference_labels.update(
            self._organization_reference_labels(
                fields=fields,
                organizations=manageable_organizations,
            )
        )
        org_unit_labels, unit_organization_ids = self._organization_unit_reference_labels(
            fields=fields,
            organizations=organizations,
        )
        reference_labels.update(org_unit_labels)
        return TabularWorkbookConfiguration(
            registry_id=registry_id,
            template=template,
            fields=fields,
            organizations=tuple(organizations),
            include_organization_column=include_organization_column,
            fixed_organization_id=fixed_organization_id,
            organization_labels={
                self._organization_label(organization): organization.id
                for organization in organizations
            },
            reference_labels=reference_labels,
            unit_organization_ids=unit_organization_ids,
            import_mode=import_mode,
            work_experience_as_of_date=work_experience_as_of_date,
            title_header=tabular_xlsx_title_header(registry.card_title_label),
        )

    @staticmethod
    def _order_selected_fields(
        selected_fields: Sequence[tuple[FormField, FormBlock]],
    ) -> list[tuple[FormField, FormBlock]]:
        return sorted(
            selected_fields,
            key=lambda item: (
                item[1].position,
                item[1].id,
                item[0].position,
                item[0].id,
            ),
        )

    def _build_workbook(
        self,
        *,
        actor_user_id: UUID,
        configuration: TabularWorkbookConfiguration,
        cards: Sequence[Card] | None,
    ) -> bytes:
        openpyxl = _openpyxl()
        workbook = openpyxl.Workbook()
        sheet = workbook.active
        sheet.title = TABULAR_XLSX_SHEET_TITLE
        columns = self._workbook_columns(configuration.fields)
        headers = [
            *tabular_xlsx_fixed_headers(
                configuration.include_organization_column,
                configuration.title_header,
            ),
            *(column.header for column in columns),
        ]
        sheet.append([self._safe_export_cell_value(header) for header in headers])
        self._style_header_row(sheet, len(headers))
        sheet.freeze_panes = "A2"

        if cards is None:
            self._write_template_rows(sheet, configuration)
        else:
            card_service = CardService(self.session)
            for ordinal, card in enumerate(cards, start=1):
                card_read = card_service.read_card_for_actor(
                    actor_user_id=actor_user_id,
                    card_id=card.id,
                )
                values_by_field = self._card_values_by_field(card_read)
                row: list[object] = [ordinal, getattr(card, "display_name", None)]
                if configuration.include_organization_column:
                    row.append(
                        self._organization_label(
                            next(
                                organization
                                for organization in configuration.organizations
                                if organization.id == card.organization_id
                            )
                        )
                    )
                row.extend(
                    self._safe_export_cell_value(
                        self._display_column_value(
                            values_by_field.get(item.workbook_field.field.id),
                            item,
                            configuration.reference_labels.get(item.workbook_field.field.id, {}),
                        )
                    )
                    for item in columns
                )
                sheet.append([self._safe_export_cell_value(value) for value in row])

        self._write_metadata_sheet(
            workbook,
            configuration,
            importable=cards is None,
        )
        self._apply_sheet_formats(sheet, configuration, sheet.max_row)
        sheet.auto_filter.ref = (
            f"A1:{openpyxl.utils.get_column_letter(len(headers))}{max(2, sheet.max_row)}"
        )
        output = BytesIO()
        workbook.save(output)
        return output.getvalue()

    def _write_template_rows(
        self,
        sheet: Any,
        configuration: TabularWorkbookConfiguration,
    ) -> None:
        organization_label = (
            self._organization_label(configuration.organizations[0])
            if len(configuration.organizations) == 1
            else None
        )
        for ordinal in range(1, TABULAR_XLSX_TEMPLATE_ROW_COUNT + 1):
            row: list[object] = [ordinal, None]
            if configuration.include_organization_column:
                row.append(organization_label)
            row.extend(None for _ in self._workbook_columns(configuration.fields))
            sheet.append([self._safe_export_cell_value(value) for value in row])

    def _style_header_row(self, sheet: Any, column_count: int) -> None:
        openpyxl = _openpyxl()
        fill = openpyxl.styles.PatternFill("solid", fgColor="1F4E78")
        font = openpyxl.styles.Font(color="FFFFFF", bold=True)
        border = openpyxl.styles.Border(
            left=openpyxl.styles.Side(style="thin", color="808080"),
            right=openpyxl.styles.Side(style="thin", color="808080"),
            top=openpyxl.styles.Side(style="thin", color="808080"),
            bottom=openpyxl.styles.Side(style="thin", color="808080"),
        )
        for column in range(1, column_count + 1):
            cell = sheet.cell(row=1, column=column)
            cell.fill = fill
            cell.font = font
            cell.border = border
            cell.alignment = openpyxl.styles.Alignment(
                horizontal="center",
                vertical="center",
                wrap_text=True,
            )
        sheet.row_dimensions[1].height = 42

    def _apply_sheet_formats(
        self,
        sheet: Any,
        configuration: TabularWorkbookConfiguration,
        last_row: int,
    ) -> None:
        openpyxl = _openpyxl()
        border = openpyxl.styles.Border(
            left=openpyxl.styles.Side(style="thin", color="B7B7B7"),
            right=openpyxl.styles.Side(style="thin", color="B7B7B7"),
            top=openpyxl.styles.Side(style="thin", color="B7B7B7"),
            bottom=openpyxl.styles.Side(style="thin", color="B7B7B7"),
        )
        sheet.column_dimensions["A"].width = 10
        fixed_column_count = len(
            tabular_xlsx_fixed_headers(
                configuration.include_organization_column,
                configuration.title_header,
            )
        )
        sheet.column_dimensions["B"].width = max(22, min(36, len(configuration.title_header) + 6))
        if configuration.include_organization_column:
            sheet.column_dimensions["C"].width = 34
        for row in sheet.iter_rows(
            min_row=2,
            max_row=last_row,
            min_col=1,
            max_col=fixed_column_count,
        ):
            for cell in row:
                cell.border = border
                cell.alignment = openpyxl.styles.Alignment(vertical="top", wrap_text=True)
                if cell.column != 1:
                    cell.number_format = "@"

        for index, column in enumerate(
            self._workbook_columns(configuration.fields), start=fixed_column_count + 1
        ):
            letter = openpyxl.utils.get_column_letter(index)
            sheet.column_dimensions[letter].width = max(16, min(36, len(column.header) + 6))
            number_format = self._number_format_for_column(column)
            for row in range(2, last_row + 1):
                cell = sheet.cell(row=row, column=index)
                cell.border = border
                cell.alignment = openpyxl.styles.Alignment(vertical="top", wrap_text=True)
                if number_format is not None:
                    cell.number_format = number_format
            self._add_field_validation(
                sheet,
                column.workbook_field,
                last_row,
                configuration,
                column=index,
            )

        if configuration.include_organization_column:
            self._add_organization_validation(sheet, configuration, last_row)

    def _write_metadata_sheet(
        self,
        workbook: Any,
        configuration: TabularWorkbookConfiguration,
        *,
        importable: bool,
    ) -> None:
        metadata_sheet = workbook.create_sheet(TABULAR_XLSX_METADATA_SHEET_TITLE)
        metadata = {
            "format_version": TABULAR_XLSX_FORMAT_VERSION,
            "importable": importable,
            "import_mode": configuration.import_mode,
            "work_experience_as_of_date": (
                configuration.work_experience_as_of_date.isoformat()
                if configuration.work_experience_as_of_date is not None
                else None
            ),
            "title_header": configuration.title_header,
            "title_required": True,
            "registry_id": str(configuration.registry_id),
            "card_template_id": str(configuration.template.id),
            "field_columns": [
                {
                    "field_id": str(column.workbook_field.field.id),
                    "header": column.header,
                    "field_type": column.workbook_field.field.field_type,
                    "work_experience_component": column.work_experience_component,
                }
                for column in self._workbook_columns(configuration.fields)
            ],
            "organizations": [
                {"id": str(organization.id), "label": self._organization_label(organization)}
                for organization in configuration.organizations
            ],
            "include_organization_column": configuration.include_organization_column,
            "fixed_organization_id": (
                str(configuration.fixed_organization_id)
                if configuration.fixed_organization_id is not None
                else None
            ),
        }
        metadata_sheet["A1"] = "tabular_configuration"
        metadata_sheet["B1"] = json.dumps(metadata, ensure_ascii=False, separators=(",", ":"))
        metadata_sheet["A2"] = "organizations"
        for row, organization in enumerate(configuration.organizations, start=3):
            metadata_sheet.cell(
                row=row,
                column=1,
                value=self._safe_export_cell_value(self._organization_label(organization)),
            )
        self._define_named_range(
            workbook,
            self._organization_choices_name(),
            f"'{TABULAR_XLSX_METADATA_SHEET_TITLE}'!$A$3:$A${len(configuration.organizations) + 2}",
        )

        column = 3
        for item in configuration.fields:
            if not self._is_exportable_field(item.field) or item.field.field_type == "multi_select":
                continue
            labels = configuration.reference_labels.get(item.field.id)
            if not labels:
                continue
            metadata_sheet.cell(row=2, column=column, value=str(item.field.id))
            for row, label in enumerate(labels, start=3):
                metadata_sheet.cell(
                    row=row,
                    column=column,
                    value=self._safe_export_cell_value(label),
                )
            column_letter = _openpyxl().utils.get_column_letter(column)
            self._define_named_range(
                workbook,
                self._reference_choices_name(item.field.id),
                (
                    f"'{TABULAR_XLSX_METADATA_SHEET_TITLE}'!${column_letter}$3:"
                    f"${column_letter}${len(labels) + 2}"
                ),
            )
            column += 1
        metadata_sheet.sheet_state = "hidden"

    def _add_organization_validation(
        self,
        sheet: Any,
        configuration: TabularWorkbookConfiguration,
        last_row: int,
    ) -> None:
        if not configuration.organizations:
            return
        openpyxl = _openpyxl()
        validation = openpyxl.worksheet.datavalidation.DataValidation(
            type="list",
            formula1=f"={self._organization_choices_name()}",
            allow_blank=False,
        )
        sheet.add_data_validation(validation)
        validation.add(f"C2:C{last_row}")

    def _add_field_validation(
        self,
        sheet: Any,
        item: TabularWorkbookField,
        last_row: int,
        configuration: TabularWorkbookConfiguration,
        *,
        column: int,
    ) -> None:
        openpyxl = _openpyxl()
        letter = openpyxl.utils.get_column_letter(column)
        if item.field.field_type == "bool":
            validation = openpyxl.worksheet.datavalidation.DataValidation(
                type="list",
                formula1='"Да,Нет"',
                allow_blank=True,
            )
        elif item.field.field_type in {"select", "organization_ref", "org_unit_ref"}:
            if (
                configuration.import_mode == "enrich_global_references"
                and item.field.field_type == "select"
            ):
                return
            if not configuration.reference_labels.get(item.field.id):
                return
            validation = openpyxl.worksheet.datavalidation.DataValidation(
                type="list",
                formula1=f"={self._reference_choices_name(item.field.id)}",
                allow_blank=True,
            )
            if item.field.field_type == "multi_select":
                validation.showErrorMessage = False
                values = "; ".join(configuration.reference_labels[item.field.id])
                sheet.cell(row=1, column=column).comment = openpyxl.comments.Comment(
                    (
                        "Выберите значения из списка. Для нескольких значений "
                        f"перечислите их через «;». Доступно: {values}"
                    ),
                    "Реестровая система",
                )
            elif item.field.field_type == "org_unit_ref":
                sheet.cell(row=1, column=column).comment = openpyxl.comments.Comment(
                    "Выберите подразделение в формате «Организация → Управление → Отдел».",
                    "Реестровая система",
                )
        else:
            return
        sheet.add_data_validation(validation)
        validation.add(f"{letter}2:{letter}{last_row}")

    def _define_named_range(self, workbook: Any, name: str, reference: str) -> None:
        openpyxl = _openpyxl()
        workbook.defined_names.add(
            openpyxl.workbook.defined_name.DefinedName(name, attr_text=reference)
        )

    def _organization_choices_name(self) -> str:
        return "organization_choices"

    def _reference_choices_name(self, field_id: UUID) -> str:
        return f"field_{field_id.hex}_choices"

    def _number_format_for_field(self, field: FormField) -> str | None:
        return {
            "number": "0.############",
            "date": 'DD"."MM"."YYYY',
            "datetime": "DD.MM.YYYY HH:MM",
        }.get(field.field_type)

    def _number_format_for_column(self, column: TabularWorkbookColumn) -> str:
        if column.work_experience_component is not None:
            return "0"
        return self._number_format_for_field(column.workbook_field.field) or "@"

    def _workbook_columns(
        self,
        fields: Sequence[TabularWorkbookField],
    ) -> tuple[TabularWorkbookColumn, ...]:
        columns: list[TabularWorkbookColumn] = []
        labels = {"days": "дни", "months": "месяцы", "years": "годы"}
        for item in fields:
            if not self._is_exportable_field(item.field) or item.field.field_type == "multi_select":
                continue
            if item.field.field_type == "work_experience":
                columns.extend(
                    TabularWorkbookColumn(
                        workbook_field=item,
                        header=f"{item.header}: {labels[component]}",
                        work_experience_component=component,
                    )
                    for component in WORK_EXPERIENCE_COMPONENTS
                )
            else:
                columns.append(TabularWorkbookColumn(workbook_field=item, header=item.header))
        return tuple(columns)

    def _field_option(self, *, field: FormField, block: FormBlock) -> dict[str, Any]:
        supported = self._is_supported_field(field, block)
        return {
            "id": str(field.id),
            "label": field.label,
            "block_title": block.title,
            "field_type": field.field_type,
            "supported": supported,
            "unsupported_reason": (
                None
                if supported
                else "Для этого поля нельзя безопасно создать одну табличную колонку XLSX."
            ),
        }

    def _is_supported_field(self, field: FormField, block: FormBlock) -> bool:
        return (
            self._is_exportable_field(field)
            and field.field_type in TABULAR_XLSX_SUPPORTED_FIELD_TYPES
            and not block.is_repeatable
        )

    @staticmethod
    def _is_exportable_field(field: FormField) -> bool:
        return getattr(field, "is_exportable", True) is True

    def _template_field_ids(self, template: CardTemplate) -> set[UUID]:
        result: set[UUID] = set()
        for value in template.field_schema_json.get("field_ids", []):
            if not isinstance(value, str):
                continue
            try:
                result.add(UUID(value))
            except ValueError:
                continue
        return result

    def _manageable_organizations(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
    ) -> list[Organization]:
        permissions = PermissionService(self.session)
        organizations = list(
            self.session.scalars(
                select(Organization)
                .where(Organization.archived_at.is_(None), Organization.is_active.is_(True))
                .order_by(Organization.name, Organization.code, Organization.id)
            )
        )
        return [
            organization
            for organization in organizations
            if permissions.has_permission(
                actor_user_id,
                "cards.manage",
                organization_id=organization.id,
                registry_id=registry_id,
            )
        ]

    def _field_headers(self, fields: Sequence[tuple[FormField, FormBlock]]) -> dict[UUID, str]:
        totals: dict[str, int] = {}
        for field, _ in fields:
            totals[field.label] = totals.get(field.label, 0) + 1
        return {
            field.id: (field.label if totals[field.label] == 1 else f"{block.title}: {field.label}")
            for field, block in fields
        }

    def _organization_label(self, organization: Organization) -> str:
        return f"{organization.name} ({organization.code})"

    def _reference_labels(
        self,
        fields: Sequence[TabularWorkbookField],
    ) -> dict[UUID, dict[str, UUID]]:
        result: dict[UUID, dict[str, UUID]] = {}
        for item in fields:
            if item.field.field_type != "select":
                continue
            list_id = item.field.options_source_id
            if list_id is None:
                result[item.field.id] = {}
                continue
            items = list(
                self.session.scalars(
                    select(ReferenceItem)
                    .where(
                        ReferenceItem.list_id == list_id,
                        ReferenceItem.archived_at.is_(None),
                        ReferenceItem.is_active.is_(True),
                    )
                    .order_by(ReferenceItem.position, ReferenceItem.label, ReferenceItem.id)
                )
            )
            labels: dict[str, UUID] = {}
            for reference_item in items:
                label = reference_item.label
                if label in labels:
                    label = f"{reference_item.label} ({reference_item.code})"
                labels[label] = reference_item.id
            result[item.field.id] = labels
        return result

    def _organization_reference_labels(
        self,
        *,
        fields: Sequence[TabularWorkbookField],
        organizations: Sequence[Organization],
    ) -> dict[UUID, dict[str, UUID]]:
        if not any(item.field.field_type == "organization_ref" for item in fields):
            return {}
        labels = self._organization_reference_label_map(organizations)
        return {
            item.field.id: dict(labels)
            for item in fields
            if item.field.field_type == "organization_ref"
        }

    def _organization_unit_reference_labels(
        self,
        *,
        fields: Sequence[TabularWorkbookField],
        organizations: Sequence[Organization],
    ) -> tuple[dict[UUID, dict[str, UUID]], dict[UUID, UUID]]:
        if not any(item.field.field_type == "org_unit_ref" for item in fields):
            return {}, {}
        if not organizations:
            return {}, {}

        organizations_by_id = {organization.id: organization for organization in organizations}
        organization_labels = self._organization_reference_label_map(organizations)
        organization_labels_by_id = {
            organization_id: label for label, organization_id in organization_labels.items()
        }
        units = list(
            self.session.scalars(
                select(OrgUnit)
                .where(
                    OrgUnit.organization_id.in_(organizations_by_id),
                    OrgUnit.archived_at.is_(None),
                    OrgUnit.is_active.is_(True),
                )
                .order_by(OrgUnit.organization_id, OrgUnit.name, OrgUnit.code, OrgUnit.id)
            )
        )
        units_by_id = {unit.id: unit for unit in units}
        labels: dict[str, UUID] = {}
        unit_organization_ids: dict[UUID, UUID] = {}
        for unit in units:
            organization = organizations_by_id.get(unit.organization_id)
            if organization is None:
                continue
            unit_organization_ids[unit.id] = unit.organization_id
            path = self._organization_unit_path(unit, units_by_id)
            base_label = f"{organization_labels_by_id[organization.id]} → {' → '.join(path)}"
            label = base_label
            if label in labels:
                label = f"{base_label} ({unit.code})"
            labels[label] = unit.id
        return (
            {
                item.field.id: dict(labels)
                for item in fields
                if item.field.field_type == "org_unit_ref"
            },
            unit_organization_ids,
        )

    def _organization_reference_label_map(
        self,
        organizations: Sequence[Organization],
    ) -> dict[str, UUID]:
        organizations_by_id = {organization.id: organization for organization in organizations}
        names: dict[str, list[Organization]] = {}
        for organization in organizations:
            names.setdefault(organization.name, []).append(organization)

        labels: dict[str, UUID] = {}
        for organization in organizations:
            if len(names[organization.name]) == 1:
                label = organization.name
            else:
                label = " → ".join(self._organization_path(organization, organizations_by_id))
            if label in labels:
                label = f"{label} ({organization.code})"
            labels[label] = organization.id
        return labels

    def _organization_path(
        self,
        organization: Organization,
        organizations_by_id: dict[UUID, Organization],
    ) -> list[str]:
        path = [organization.name]
        parent_id = organization.parent_id
        seen = {organization.id}
        while parent_id is not None and parent_id not in seen:
            parent = organizations_by_id.get(parent_id)
            if parent is None:
                break
            path.append(parent.name)
            seen.add(parent.id)
            parent_id = parent.parent_id
        path.reverse()
        return path

    def _organization_unit_path(
        self,
        unit: OrgUnit,
        units_by_id: dict[UUID, OrgUnit],
    ) -> list[str]:
        path = [unit.name]
        parent_id = unit.parent_id
        seen = {unit.id}
        while parent_id is not None and parent_id not in seen:
            parent = units_by_id.get(parent_id)
            if parent is None or parent.organization_id != unit.organization_id:
                break
            path.append(parent.name)
            seen.add(parent.id)
            parent_id = parent.parent_id
        path.reverse()
        return path

    def _card_values_by_field(self, card_read: CardRead) -> dict[UUID, object | None]:
        values: dict[UUID, object | None] = {}
        for block in card_read.blocks.values():
            for instance in block.instances:
                for field in instance.fields.values():
                    values.setdefault(field.field_id, field.value)
        return values

    def _display_column_value(
        self,
        value: object | None,
        column: TabularWorkbookColumn,
        reference_labels: dict[str, UUID],
    ) -> object | None:
        if value is None:
            return None
        labels_by_id = {item_id: label for label, item_id in reference_labels.items()}
        field = column.workbook_field.field
        if column.work_experience_component is not None and isinstance(value, dict):
            component = value.get(column.work_experience_component)
            return (
                component
                if isinstance(component, int) and not isinstance(component, bool)
                else None
            )
        if field.field_type == "bool":
            return "Да" if value else "Нет"
        if field.field_type in {"select", "organization_ref", "org_unit_ref"} and isinstance(
            value, UUID
        ):
            return labels_by_id.get(value, "")
        return value

    def _safe_export_cell_value(self, value: object | None) -> object | None:
        if isinstance(value, str) and value[:1] in {"=", "+", "-", "@"}:
            return f"'{value}"
        return value

    def preview_import_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        xlsx_content: bytes,
    ) -> dict[str, Any]:
        configuration, rows, planned_references = self._read_import_workbook(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            xlsx_content=xlsx_content,
        )
        return self._import_preview_payload(configuration, rows, planned_references)

    def _import_preview_payload(
        self,
        configuration: TabularWorkbookConfiguration,
        rows: list[dict[str, Any]],
        planned_references: list[_PlannedGlobalImportReference],
    ) -> dict[str, Any]:
        preview_rows = [
            {
                "row_number": row["row_number"],
                "status": "invalid" if row["errors"] else "valid",
                "organization_label": row["organization_label"],
                "display_name": row["display_name"],
                "errors": row["errors"],
                "organization_id": row["organization_id"],
                "values": row["values"],
            }
            for row in rows
        ]
        invalid_rows = sum(1 for row in preview_rows if row["status"] == "invalid")
        return {
            "format_version": TABULAR_XLSX_FORMAT_VERSION,
            "registry_id": str(configuration.registry_id),
            "summary": {
                "total_rows": len(preview_rows),
                "valid_rows": len(preview_rows) - invalid_rows,
                "invalid_rows": invalid_rows,
                "would_create_cards": len(preview_rows) - invalid_rows,
                "would_create_reference_items": len(planned_references),
            },
            "new_reference_items": [
                {"field_label": item.field_label, "label": item.display_label}
                for item in planned_references
            ],
            "rows": preview_rows,
        }

    def commit_import_xlsx_for_actor(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        xlsx_content: bytes,
    ) -> dict[str, Any]:
        configuration, rows, planned_references = self._read_import_workbook(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            xlsx_content=xlsx_content,
        )
        preview = self._import_preview_payload(configuration, rows, planned_references)
        if preview["summary"]["invalid_rows"]:
            raise TabularCardImportValidationError(preview)

        card_service = CardService(self.session)
        field_values_written = 0
        created_reference_items = 0
        try:
            with self.session.begin_nested():
                configuration, rows, planned_references = self._read_import_workbook(
                    actor_user_id=actor_user_id,
                    registry_id=registry_id,
                    xlsx_content=xlsx_content,
                )
                transaction_preview = self._import_preview_payload(
                    configuration, rows, planned_references
                )
                if transaction_preview["summary"]["invalid_rows"]:
                    raise TabularCardImportValidationError(transaction_preview)
                reference_service = ReferenceListService(self.session)
                created_reference_ids: dict[tuple[UUID, str], UUID] = {}
                for planned_reference in planned_references:
                    item = reference_service.create_global_import_item_for_actor(
                        actor_user_id=actor_user_id,
                        list_id=planned_reference.list_id,
                        normalized_label=planned_reference.normalized_label,
                        display_label=planned_reference.display_label,
                    )
                    created_reference_ids[
                        (planned_reference.list_id, planned_reference.normalized_label)
                    ] = item.id
                created_reference_items = len(created_reference_ids)
                self._replace_pending_reference_values(rows, created_reference_ids)
                self._validate_import_rows(
                    actor_user_id=actor_user_id,
                    registry_id=registry_id,
                    configuration=configuration,
                    rows=rows,
                )
                final_preview = self._import_preview_payload(configuration, rows, [])
                if final_preview["summary"]["invalid_rows"]:
                    raise TabularCardImportValidationError(final_preview)
                for row in rows:
                    organization_id = row["organization_id"]
                    if not isinstance(organization_id, UUID):
                        raise ImportExportServiceError("Организация строки XLSX не определена.")
                    card = card_service.create_card_for_actor(
                        actor_user_id=actor_user_id,
                        registry_id=registry_id,
                        organization_id=organization_id,
                        card_template_id=configuration.template.id,
                        display_name=row["display_name"],
                    )
                    fields_by_id = {item.field.id: item for item in configuration.fields}
                    for field_id, value in row["values"].items():
                        if fields_by_id[field_id].field.field_type == "work_experience":
                            card_service.set_field_value_for_actor(
                                actor_user_id=actor_user_id,
                                card_id=card.id,
                                field_id=field_id,
                                value=value,
                                work_experience_as_of_date=configuration.work_experience_as_of_date,
                            )
                        else:
                            card_service.set_field_value_for_actor(
                                actor_user_id=actor_user_id,
                                card_id=card.id,
                                field_id=field_id,
                                value=value,
                            )
                        field_values_written += 1
                    if self._row_has_empty_required_field(row, configuration):
                        card_service._preserve_draft_lifecycle(
                            card,
                            actor_user_id=actor_user_id,
                        )
                AuditService(self.session).record_user_event(
                    actor_user_id=actor_user_id,
                    action="import_commit",
                    object_type="registry",
                    object_id=registry_id,
                    new_data_json={
                        "import_type": "cards",
                        "format": "tabular_xlsx",
                        "card_template_id": str(configuration.template.id),
                        "field_count": len(configuration.fields),
                        "organization_count": len(configuration.organizations),
                        "created_cards": len(rows),
                        "field_values_written": field_values_written,
                        "import_mode": configuration.import_mode,
                        "created_reference_items": created_reference_items,
                    },
                )
        except Exception:
            raise

        return {
            "format_version": TABULAR_XLSX_FORMAT_VERSION,
            "registry_id": str(registry_id),
            "summary": {
                "created_cards": len(rows),
                "field_values_written": field_values_written,
                "created_reference_items": created_reference_items,
            },
        }

    def _read_import_workbook(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        xlsx_content: bytes,
    ) -> tuple[
        TabularWorkbookConfiguration,
        list[dict[str, Any]],
        list[_PlannedGlobalImportReference],
    ]:
        self._inspect_xlsx_manifest(xlsx_content)
        try:
            formula_workbook = _openpyxl().load_workbook(
                BytesIO(xlsx_content),
                read_only=True,
                data_only=False,
            )
        except Exception as exc:
            raise ImportExportServiceError("Не удалось прочитать XLSX-файл.") from exc
        try:
            self._validate_workbook_structure(formula_workbook)
            self._reject_visible_data_formulas(formula_workbook)
        finally:
            formula_workbook.close()
        try:
            workbook = _openpyxl().load_workbook(
                BytesIO(xlsx_content),
                read_only=True,
                data_only=True,
            )
        except Exception as exc:
            raise ImportExportServiceError("Не удалось прочитать XLSX-файл.") from exc
        try:
            if (
                TABULAR_XLSX_SHEET_TITLE not in workbook.sheetnames
                or TABULAR_XLSX_METADATA_SHEET_TITLE not in workbook.sheetnames
            ):
                raise ImportExportServiceError(
                    "Выберите шаблон XLSX, скачанный из Реестровой системы."
                )
            metadata_raw = workbook[TABULAR_XLSX_METADATA_SHEET_TITLE]["B1"].value
            if not isinstance(metadata_raw, str):
                raise ImportExportServiceError("Служебная разметка XLSX не найдена.")
            try:
                metadata = json.loads(metadata_raw)
            except json.JSONDecodeError as exc:
                raise ImportExportServiceError("Служебная разметка XLSX повреждена.") from exc
            configuration = self._configuration_from_metadata(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                metadata=metadata,
            )
            sheet = workbook[TABULAR_XLSX_SHEET_TITLE]
            headers = [
                "" if value is None else str(self._logical_import_cell_value(value)).strip()
                for value in next(sheet.iter_rows(min_row=1, max_row=1, values_only=True), ())
            ]
            fixed_column_count = len(
                tabular_xlsx_fixed_headers(
                    configuration.include_organization_column,
                    configuration.title_header,
                )
            )
            columns = self._workbook_columns(configuration.fields)
            expected_headers = [
                *tabular_xlsx_fixed_headers(
                    configuration.include_organization_column,
                    configuration.title_header,
                ),
                *(column.header for column in columns),
            ]
            if headers[: len(expected_headers)] != expected_headers or any(
                value for value in headers[len(expected_headers) :]
            ):
                raise ImportExportServiceError(
                    "Заголовки XLSX не соответствуют выбранному шаблону."
                )

            rows: list[dict[str, Any]] = []
            max_rows = get_settings().max_import_rows
            for row_number, values in enumerate(
                sheet.iter_rows(min_row=2, values_only=True),
                start=2,
            ):
                if row_number - 1 > max_rows:
                    raise ImportExportServiceError(f"Превышен лимит строк XLSX: {max_rows}.")
                row_values = [
                    self._logical_import_cell_value(value)
                    for value in values[: len(expected_headers)]
                ]
                row_values.extend([None] * (len(expected_headers) - len(row_values)))
                display_name = self._normalized_label(row_values[1])
                field_values = row_values[fixed_column_count:]
                if display_name is None and all(
                    self._is_blank_cell(value) for value in field_values
                ):
                    continue
                errors: list[str] = []
                if display_name is None:
                    errors.append(f"{configuration.title_header}: заполните название карточки.")
                if configuration.include_organization_column:
                    organization_label = self._normalized_label(row_values[2])
                    organization_id = configuration.organization_labels.get(
                        organization_label or ""
                    )
                    if organization_id is None:
                        errors.append("Выберите организацию из списка XLSX.")
                else:
                    organization_id = configuration.fixed_organization_id
                    organization_label = self._organization_label(
                        next(
                            organization
                            for organization in configuration.organizations
                            if organization.id == organization_id
                        )
                    )
                parsed_values: dict[UUID, object] = {}
                field_column_offset = 0
                for item in configuration.fields:
                    if item.field.field_type == "work_experience":
                        raw_components = field_values[
                            field_column_offset : field_column_offset
                            + len(WORK_EXPERIENCE_COMPONENTS)
                        ]
                        field_column_offset += len(WORK_EXPERIENCE_COMPONENTS)
                        if all(self._is_blank_cell(value) for value in raw_components):
                            continue
                        if any(self._is_blank_cell(value) for value in raw_components):
                            errors.append(f"{item.header}: {WORK_EXPERIENCE_PARTIAL_ERROR}")
                            continue
                        try:
                            parsed_values[item.field.id] = self._parse_work_experience_components(
                                raw_components
                            )
                        except ImportExportServiceError as exc:
                            errors.append(f"{item.header}: {exc}")
                        continue
                    raw_value = field_values[field_column_offset]
                    field_column_offset += 1
                    if self._is_blank_cell(raw_value):
                        continue
                    try:
                        if (
                            configuration.import_mode == "enrich_global_references"
                            and item.field.field_type == "select"
                        ):
                            raw_label = self._normalized_label(raw_value)
                            if raw_label is None:
                                raise ImportExportServiceError(
                                    "значение отсутствует в справочнике."
                                )
                            parsed_values[item.field.id] = _PendingGlobalImportReference(
                                field_id=item.field.id,
                                raw_label=raw_label,
                            )
                        else:
                            parsed_values[item.field.id] = self._parse_import_value(
                                raw_value,
                                item.field,
                                configuration.reference_labels.get(item.field.id, {}),
                                organization_id=organization_id,
                                unit_organization_ids=configuration.unit_organization_ids,
                            )
                    except ImportExportServiceError as exc:
                        errors.append(f"{item.header}: {exc}")
                rows.append(
                    {
                        "row_number": row_number,
                        "organization_label": organization_label,
                        "organization_id": organization_id,
                        "display_name": display_name,
                        "values": parsed_values,
                        "errors": errors,
                    }
                )
            planned_references = self._plan_global_import_references(
                actor_user_id=actor_user_id,
                configuration=configuration,
                rows=rows,
            )
            self._validate_import_rows(
                actor_user_id=actor_user_id,
                registry_id=registry_id,
                configuration=configuration,
                rows=rows,
            )
            return configuration, rows, planned_references
        finally:
            workbook.close()

    def _inspect_xlsx_manifest(self, xlsx_content: bytes) -> None:
        settings = get_settings()
        try:
            with zipfile.ZipFile(BytesIO(xlsx_content)) as archive:
                entries = archive.infolist()
        except (OSError, zipfile.BadZipFile) as exc:
            raise ImportExportServiceError("Не удалось прочитать XLSX-файл.") from exc
        if len(entries) > TABULAR_XLSX_MAX_ZIP_ENTRIES:
            raise ImportExportServiceError("Превышен лимит файлов в XLSX-архиве.")
        if sum(entry.file_size for entry in entries) > settings.max_import_uncompressed_bytes:
            raise ImportExportServiceError("Превышен лимит распакованного размера XLSX-файла.")

    def _validate_workbook_structure(self, workbook: Any) -> None:
        settings = get_settings()
        if len(workbook.sheetnames) > settings.max_import_sheets:
            raise ImportExportServiceError("Превышен лимит листов XLSX.")
        total_cells = 0
        for sheet in workbook.worksheets:
            max_column = sheet.max_column or 0
            max_row = sheet.max_row or 0
            if max_column > settings.max_import_columns:
                raise ImportExportServiceError("Превышен лимит столбцов XLSX.")
            total_cells += max_row * max_column
            if total_cells > settings.max_import_cells:
                raise ImportExportServiceError("Превышен лимит ячеек XLSX.")

    def _reject_visible_data_formulas(self, workbook: Any) -> None:
        if TABULAR_XLSX_SHEET_TITLE not in workbook.sheetnames:
            return
        for row in workbook[TABULAR_XLSX_SHEET_TITLE].iter_rows():
            if any(cell.data_type == "f" for cell in row):
                raise ImportExportServiceError(
                    "XLSX не должен содержать формулы в данных карточек."
                )

    def _plan_global_import_references(
        self,
        *,
        actor_user_id: UUID,
        configuration: TabularWorkbookConfiguration,
        rows: list[dict[str, Any]],
    ) -> list[_PlannedGlobalImportReference]:
        if configuration.import_mode != "enrich_global_references":
            return []

        fields_by_id = {item.field.id: item for item in configuration.fields}
        planned_by_key: dict[tuple[UUID, str], _PlannedGlobalImportReference] = {}
        reference_service = ReferenceListService(self.session)
        for row in rows:
            for field_id, value in list(row["values"].items()):
                if not isinstance(value, _PendingGlobalImportReference):
                    continue
                workbook_field = fields_by_id.get(field_id)
                options_config = (
                    getattr(workbook_field.field, "options_config_json", None)
                    if workbook_field is not None
                    else None
                )
                raw_reference_list_id = (
                    getattr(workbook_field.field, "options_source_id", None)
                    if workbook_field is not None
                    else None
                )
                reference_list_id = (
                    raw_reference_list_id if isinstance(raw_reference_list_id, UUID) else None
                )
                organization_aware_resolution = isinstance(options_config, dict) and (
                    options_config.get("reference_resolution") == "by_card_organization"
                    or options_config.get("allow_owner_override") is True
                )
                if (
                    workbook_field is None
                    or getattr(workbook_field.field, "options_source_type", None)
                    != "reference_list"
                    or reference_list_id is None
                    or organization_aware_resolution
                ):
                    row["errors"].append(
                        f"{workbook_field.header if workbook_field is not None else field_id}: "
                        "для пополнения требуется глобальный справочник."
                    )
                    continue
                try:
                    resolution = reference_service.resolve_or_plan_global_import_item_for_actor(
                        actor_user_id=actor_user_id,
                        list_id=reference_list_id,
                        raw_label=value.raw_label,
                    )
                except ReferenceListError as exc:
                    row["errors"].append(f"{workbook_field.header}: {exc}")
                    continue
                if resolution.status == "existing":
                    if resolution.reference_item_id is None:
                        row["errors"].append(
                            f"{workbook_field.header}: значение справочника не определено."
                        )
                    else:
                        row["values"][field_id] = resolution.reference_item_id
                    continue
                key = (reference_list_id, resolution.normalized_label)
                planned_by_key.setdefault(
                    key,
                    _PlannedGlobalImportReference(
                        list_id=reference_list_id,
                        normalized_label=resolution.normalized_label,
                        display_label=resolution.display_label,
                        field_label=workbook_field.header,
                    ),
                )
                row["values"][field_id] = _PendingGlobalImportReference(
                    field_id=field_id,
                    raw_label=resolution.normalized_label,
                    list_id=reference_list_id,
                )
        return list(planned_by_key.values())

    def _replace_pending_reference_values(
        self,
        rows: list[dict[str, Any]],
        created_reference_ids: dict[tuple[UUID, str], UUID],
    ) -> None:
        for row in rows:
            for field_id, value in list(row["values"].items()):
                if not isinstance(value, _PendingGlobalImportReference):
                    continue
                item_id = (
                    created_reference_ids.get((value.list_id, value.raw_label))
                    if value.list_id is not None
                    else None
                )
                if item_id is None:
                    row["errors"].append("Значение справочника не было создано.")
                else:
                    row["values"][field_id] = item_id

    def _validate_import_rows(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        configuration: TabularWorkbookConfiguration,
        rows: list[dict[str, Any]],
    ) -> None:
        card_service = CardService(self.session)
        fields_by_id = {item.field.id: item for item in configuration.fields}
        for row in rows:
            organization_id = row["organization_id"]
            if not isinstance(organization_id, UUID):
                continue
            for field_id, value in row["values"].items():
                if isinstance(value, _PendingGlobalImportReference):
                    continue
                workbook_field = fields_by_id[field_id]
                try:
                    card_service.validate_field_value_for_actor(
                        actor_user_id=actor_user_id,
                        registry_id=registry_id,
                        organization_id=organization_id,
                        field_id=field_id,
                        value=value,
                    )
                except InvalidFieldValueError as exc:
                    row["errors"].append(f"{workbook_field.header}: {exc}")

    @staticmethod
    def _row_has_empty_required_field(
        row: dict[str, Any],
        configuration: TabularWorkbookConfiguration,
    ) -> bool:
        imported_field_ids = set(row["values"])
        return any(
            item.field.id not in imported_field_ids
            and getattr(item.field, "required_mode", None) in {"required", "required_on_publish"}
            for item in configuration.fields
        )

    def _configuration_from_metadata(
        self,
        *,
        actor_user_id: UUID,
        registry_id: UUID,
        metadata: object,
    ) -> TabularWorkbookConfiguration:
        if not isinstance(metadata, dict):
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        if metadata.get("format_version") != TABULAR_XLSX_FORMAT_VERSION:
            raise ImportExportServiceError("Версия XLSX-шаблона не поддерживается.")
        if metadata.get("importable") is False:
            raise ImportExportServiceError(
                "Выгруженный список XLSX не предназначен для импорта. Скачайте шаблон импорта."
            )
        if metadata.get("importable") is not True:
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        if metadata.get("registry_id") != str(registry_id):
            raise ImportExportServiceError("XLSX-шаблон относится к другому реестру.")
        template_id = self._metadata_uuid(metadata.get("card_template_id"), "шаблон карточки")
        import_mode = metadata.get("import_mode")
        if import_mode not in {"strict", "enrich_global_references"}:
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        raw_work_experience_as_of_date = metadata.get("work_experience_as_of_date")
        if not isinstance(raw_work_experience_as_of_date, str):
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        try:
            work_experience_as_of_date = date.fromisoformat(raw_work_experience_as_of_date)
        except ValueError as exc:
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.") from exc
        title_header = metadata.get("title_header")
        if (
            not isinstance(title_header, str)
            or not title_header.strip()
            or metadata.get("title_required") is not True
        ):
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        raw_columns = metadata.get("field_columns")
        raw_organizations = metadata.get("organizations")
        include_organization_column = metadata.get("include_organization_column", True)
        raw_fixed_organization_id = metadata.get("fixed_organization_id")
        if not isinstance(raw_columns, list) or not isinstance(raw_organizations, list):
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        if not isinstance(include_organization_column, bool):
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        fixed_organization_id = (
            self._metadata_uuid(raw_fixed_organization_id, "организация импорта")
            if raw_fixed_organization_id is not None
            else None
        )
        field_ids = [
            self._metadata_uuid(column.get("field_id"), "поле")
            for column in raw_columns
            if isinstance(column, dict)
        ]
        organization_ids = [
            self._metadata_uuid(organization.get("id"), "организация")
            for organization in raw_organizations
            if isinstance(organization, dict)
        ]
        if len(field_ids) != len(raw_columns) or len(organization_ids) != len(raw_organizations):
            raise ImportExportServiceError("Служебная разметка XLSX повреждена.")
        configuration = self._configuration_for_actor(
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=template_id,
            field_ids=list(dict.fromkeys(field_ids)),
            organization_ids=organization_ids,
            include_organization_column=include_organization_column,
            fixed_organization_id=fixed_organization_id,
            import_mode=cast(Literal["strict", "enrich_global_references"], import_mode),
            work_experience_as_of_date=work_experience_as_of_date,
            require_fixed_organization=True,
        )
        if configuration.title_header != title_header:
            raise ImportExportServiceError(
                "Заголовок названия карточки XLSX был изменён или устарел."
            )
        expected_columns = [
            {
                "field_id": str(column.workbook_field.field.id),
                "header": column.header,
                "field_type": column.workbook_field.field.field_type,
                "work_experience_component": column.work_experience_component,
            }
            for column in self._workbook_columns(configuration.fields)
        ]
        if raw_columns != expected_columns:
            raise ImportExportServiceError("Поля XLSX были изменены после скачивания шаблона.")
        expected_organizations = [
            {"id": str(organization.id), "label": self._organization_label(organization)}
            for organization in configuration.organizations
        ]
        if raw_organizations != expected_organizations:
            raise ImportExportServiceError("Список организаций XLSX был изменён или устарел.")
        return configuration

    def _metadata_uuid(self, value: object, label: str) -> UUID:
        if not isinstance(value, str):
            raise ImportExportServiceError(f"Служебное поле «{label}» XLSX повреждено.")
        try:
            return UUID(value)
        except ValueError as exc:
            raise ImportExportServiceError(f"Служебное поле «{label}» XLSX повреждено.") from exc

    def _parse_import_value(
        self,
        raw_value: object,
        field: FormField,
        reference_labels: dict[str, UUID],
        *,
        organization_id: UUID | None,
        unit_organization_ids: dict[UUID, UUID],
    ) -> object:
        if field.field_type == "text":
            return str(raw_value).strip()
        if field.field_type == "number":
            try:
                return Decimal(str(raw_value))
            except Exception as exc:
                raise ImportExportServiceError("нужно указать число.") from exc
        if field.field_type == "date":
            if isinstance(raw_value, datetime):
                return raw_value.date()
            if isinstance(raw_value, date):
                return raw_value
            return self._parse_date_text(str(raw_value))
        if field.field_type == "datetime":
            if isinstance(raw_value, datetime):
                return raw_value
            return self._parse_datetime_text(str(raw_value))
        if field.field_type == "bool":
            normalized = self._normalized_label(raw_value)
            if normalized == "Да":
                return True
            if normalized == "Нет":
                return False
            raise ImportExportServiceError("допустимы значения «Да» или «Нет».")
        if field.field_type == "select":
            label = self._normalized_label(raw_value)
            reference_id = reference_labels.get(label or "")
            if reference_id is None:
                raise ImportExportServiceError("значение отсутствует в справочнике.")
            return reference_id
        if field.field_type == "multi_select":
            labels = [
                label
                for part in str(raw_value).split(";")
                if (label := self._normalized_label(part)) is not None
            ]
            selected = [reference_labels.get(label) for label in labels]
            if not labels or any(item is None for item in selected):
                raise ImportExportServiceError("укажите значения справочника через «;».")
            return [cast(UUID, item) for item in selected]
        if field.field_type == "organization_ref":
            label = self._normalized_label(raw_value)
            selected_organization_id = reference_labels.get(label or "")
            if selected_organization_id is None:
                raise ImportExportServiceError("организация недоступна для выбора.")
            return selected_organization_id
        if field.field_type == "org_unit_ref":
            label = self._normalized_label(raw_value)
            org_unit_id = reference_labels.get(label or "")
            if (
                org_unit_id is None
                or organization_id is None
                or unit_organization_ids.get(org_unit_id) != organization_id
            ):
                raise ImportExportServiceError("подразделение недоступно выбранной организации.")
            return org_unit_id
        raise ImportExportServiceError("тип поля не поддерживается в XLSX.")

    def _parse_work_experience_components(self, values: Sequence[object]) -> dict[str, int]:
        parsed: dict[str, int] = {}
        for component, raw_value in zip(WORK_EXPERIENCE_COMPONENTS, values, strict=True):
            if isinstance(raw_value, bool):
                raise ImportExportServiceError("укажите стаж целыми неотрицательными числами.")
            try:
                value = int(str(raw_value))
            except (TypeError, ValueError) as exc:
                raise ImportExportServiceError(
                    "укажите стаж целыми неотрицательными числами."
                ) from exc
            if str(value) != str(raw_value).strip() or value < 0:
                raise ImportExportServiceError("укажите стаж целыми неотрицательными числами.")
            parsed[component] = value
        return parsed

    def _parse_date_text(self, value: str) -> date:
        for pattern in ("%d.%m.%Y", "%Y-%m-%d"):
            try:
                return datetime.strptime(value.strip(), pattern).date()
            except ValueError:
                continue
        raise ImportExportServiceError("укажите дату в формате ДД.ММ.ГГГГ.")

    def _parse_datetime_text(self, value: str) -> datetime:
        for pattern in ("%d.%m.%Y %H:%M", "%Y-%m-%dT%H:%M:%S"):
            try:
                return datetime.strptime(value.strip(), pattern)
            except ValueError:
                continue
        raise ImportExportServiceError("укажите дату и время в формате ДД.ММ.ГГГГ ЧЧ:ММ.")

    def _is_blank_cell(self, value: object) -> bool:
        return value is None or (isinstance(value, str) and not value.strip())

    def _normalized_label(self, value: object) -> str | None:
        if value is None:
            return None
        label = str(self._logical_import_cell_value(value)).strip()
        return label or None

    def _logical_import_cell_value(self, value: object) -> object:
        if (
            isinstance(value, str)
            and len(value) >= 2
            and value[0] == "'"
            and value[1] in {"=", "+", "-", "@"}
        ):
            return value[1:]
        return value


def _openpyxl() -> Any:
    return cast(Any, import_module("openpyxl"))
