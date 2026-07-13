import json
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from openpyxl import load_workbook
from starlette.responses import Response

from app.api.v1.endpoints import import_export as import_export_endpoint
from app.services import import_export


def test_tabular_xlsx_declares_user_facing_columns_and_supported_field_types() -> None:
    assert import_export.tabular_xlsx_fixed_headers(True) == (
        "№ п/п",
        "Организация",
    )
    assert import_export.tabular_xlsx_fixed_headers(False) == ("№ п/п",)
    assert getattr(import_export, "TABULAR_XLSX_SUPPORTED_FIELD_TYPES", None) == {
        "text",
        "number",
        "date",
        "datetime",
        "bool",
        "select",
        "multi_select",
    }


def test_xlsx_configuration_rejects_an_inactive_template(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    expected_registry_id = registry_id
    template = SimpleNamespace(
        id=uuid4(),
        registry_id=registry_id,
        archived_at=None,
        is_active=False,
    )

    class AllowCardsManage:
        def __init__(self, _session: object) -> None:
            pass

        def has_permission(
            self,
            user_id: object,
            permission_code: object,
            *,
            registry_id: object,
        ) -> bool:
            assert (user_id, permission_code, registry_id) == (
                actor_user_id,
                "cards.manage",
                expected_registry_id,
            )
            return True

    class TemplateSession:
        def get(self, model: object, _model_id: object) -> object:
            assert model is import_export.CardTemplate
            return template

    monkeypatch.setattr(import_export, "PermissionService", AllowCardsManage)
    service = import_export.TabularCardExchangeService(TemplateSession())  # type: ignore[arg-type]

    with pytest.raises(import_export.ImportExportServiceError, match="Шаблон карточки"):
        service._configuration_for_actor(  # noqa: SLF001
            actor_user_id=actor_user_id,
            registry_id=registry_id,
            card_template_id=template.id,
            field_ids=[uuid4()],
            organization_ids=[uuid4()],
            include_organization_column=True,
            fixed_organization_id=None,
            require_fixed_organization=False,
        )


def test_tabular_xlsx_orders_fields_by_block_then_field_position() -> None:
    first_block = SimpleNamespace(id=uuid4(), position=1)
    second_block = SimpleNamespace(id=uuid4(), position=2)
    first_field = SimpleNamespace(id=uuid4(), position=1)
    second_field = SimpleNamespace(id=uuid4(), position=2)
    later_block_field = SimpleNamespace(id=uuid4(), position=0)

    ordered = import_export.TabularCardExchangeService._order_selected_fields(
        [
            (later_block_field, second_block),
            (second_field, first_block),
            (first_field, first_block),
        ]
    )

    assert [field.id for field, _block in ordered] == [
        first_field.id,
        second_field.id,
        later_block_field.id,
    ]


def test_tabular_xlsx_template_is_wide_formatted_and_contains_hidden_mapping() -> None:
    field = SimpleNamespace(
        id=uuid4(),
        label="Дата рождения",
        field_type="date",
    )
    configuration = import_export.TabularWorkbookConfiguration(
        registry_id=uuid4(),
        template=SimpleNamespace(id=uuid4(), name="Сведения"),
        fields=(
            import_export.TabularWorkbookField(
                field=field,
                block=SimpleNamespace(id=uuid4(), title="Основные сведения"),
                header="Дата рождения",
            ),
        ),
        organizations=(SimpleNamespace(id=uuid4(), name="Администрация", code="admin"),),
        include_organization_column=True,
        fixed_organization_id=None,
        organization_labels={},
        reference_labels={},
    )

    content = import_export.TabularCardExchangeService(MagicMock())._build_workbook(
        actor_user_id=uuid4(),
        configuration=configuration,
        cards=None,
    )

    workbook = load_workbook(filename=__import__("io").BytesIO(content), data_only=True)
    sheet = workbook["Карточки"]
    assert [cell.value for cell in sheet[1][:3]] == ["№ п/п", "Организация", "Дата рождения"]
    assert sheet["A2"].value == 1
    assert sheet["B2"].value == "Администрация (admin)"
    assert sheet["C2"].number_format == "DD.MM.YYYY"
    assert workbook["_registry_engine"].sheet_state == "hidden"


def test_tabular_xlsx_template_hides_organization_column_and_records_import_target() -> None:
    field = SimpleNamespace(id=uuid4(), label="Дата рождения", field_type="date")
    organization = SimpleNamespace(id=uuid4(), name="Администрация", code="admin")
    configuration = import_export.TabularWorkbookConfiguration(
        registry_id=uuid4(),
        template=SimpleNamespace(id=uuid4(), name="Сведения"),
        fields=(
            import_export.TabularWorkbookField(
                field=field,
                block=SimpleNamespace(id=uuid4(), title="Основные сведения"),
                header="Дата рождения",
            ),
        ),
        organizations=(organization,),
        include_organization_column=False,
        fixed_organization_id=organization.id,
        organization_labels={},
        reference_labels={},
    )

    content = import_export.TabularCardExchangeService(MagicMock())._build_workbook(
        actor_user_id=uuid4(),
        configuration=configuration,
        cards=None,
    )

    workbook = load_workbook(filename=__import__("io").BytesIO(content), data_only=True)
    sheet = workbook["Карточки"]
    metadata = json.loads(workbook["_registry_engine"]["B1"].value)
    validations = {validation.sqref for validation in sheet.data_validations.dataValidation}

    assert [cell.value for cell in sheet[1][:2]] == ["№ п/п", "Дата рождения"]
    assert sheet["A2"].value == 1
    assert sheet["B2"].value is None
    assert "B2:B101" not in validations
    assert metadata["include_organization_column"] is False
    assert metadata["fixed_organization_id"] == str(organization.id)


def test_tabular_xlsx_template_offers_reference_values_for_single_and_multiple_selects() -> None:
    select_field = SimpleNamespace(id=uuid4(), label="Статус", field_type="select")
    multi_select_field = SimpleNamespace(id=uuid4(), label="Категории", field_type="multi_select")
    configuration = import_export.TabularWorkbookConfiguration(
        registry_id=uuid4(),
        template=SimpleNamespace(id=uuid4(), name="Сведения"),
        fields=(
            import_export.TabularWorkbookField(
                field=select_field,
                block=SimpleNamespace(id=uuid4(), title="Основные сведения"),
                header="Статус",
            ),
            import_export.TabularWorkbookField(
                field=multi_select_field,
                block=SimpleNamespace(id=uuid4(), title="Основные сведения"),
                header="Категории",
            ),
        ),
        organizations=(SimpleNamespace(id=uuid4(), name="Администрация", code="admin"),),
        include_organization_column=True,
        fixed_organization_id=None,
        organization_labels={},
        reference_labels={
            select_field.id: {"Новый": uuid4(), "Готово": uuid4()},
            multi_select_field.id: {"Основная": uuid4(), "Дополнительная": uuid4()},
        },
    )

    content = import_export.TabularCardExchangeService(MagicMock())._build_workbook(
        actor_user_id=uuid4(),
        configuration=configuration,
        cards=None,
    )

    workbook = load_workbook(filename=__import__("io").BytesIO(content), data_only=True)
    sheet = workbook["Карточки"]
    validations = {
        validation.sqref: validation for validation in sheet.data_validations.dataValidation
    }
    assert validations["B2:B101"].formula1 == "=organization_choices"
    assert validations["C2:C101"].formula1 == f"=field_{select_field.id.hex}_choices"
    assert validations["D2:D101"].formula1 == f"=field_{multi_select_field.id.hex}_choices"
    assert validations["D2:D101"].showErrorMessage is False


def test_xlsx_download_headers_are_safe_for_http_response_encoding() -> None:
    headers = import_export_endpoint.xlsx_download_headers("registry-cards.xlsx")

    response = Response(content=b"xlsx", headers=headers)

    assert response.headers["x-document-filename"] == "registry-cards.xlsx"
    assert response.headers["content-disposition"] == 'attachment; filename="registry-cards.xlsx"'
