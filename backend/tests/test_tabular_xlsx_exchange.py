from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

from openpyxl import load_workbook

from app.services import import_export


def test_tabular_xlsx_declares_user_facing_columns_and_supported_field_types() -> None:
    assert getattr(import_export, "TABULAR_XLSX_FIXED_HEADERS", None) == (
        "№ п/п",
        "Организация",
    )
    assert getattr(import_export, "TABULAR_XLSX_SUPPORTED_FIELD_TYPES", None) == {
        "text",
        "number",
        "date",
        "datetime",
        "bool",
        "select",
        "multi_select",
    }


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
