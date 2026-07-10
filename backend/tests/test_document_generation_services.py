import os
from collections.abc import Iterator
from copy import deepcopy
from dataclasses import replace
from datetime import UTC, date, datetime
from io import BytesIO
from pathlib import Path
from types import SimpleNamespace
from typing import Any
from uuid import UUID, uuid4
from zipfile import ZipFile

import pytest
from alembic import command
from alembic.config import Config
from pypdf import PdfReader
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.models import (
    AccessGrant,
    AuditEvent,
    CardTemplate,
    FormField,
    Permission,
    Role,
    StoredFile,
    User,
    role_permissions,
)
from app.services.attachments import LocalFilesystemAttachmentStorage
from app.services.card_print import validate_card_print_layout
from app.services.cards import CardFieldRead, CardRead, CardService, FileRefValueRead
from app.services.documents import DocumentService, DocumentServiceError, _RenderContext
from app.services.organizations import OrganizationService
from app.services.permissions import PermissionDeniedError
from app.services.registry_schema import RegistrySchemaService


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL document tests.")

    database_name = make_url(database_url).database or ""
    if database_name == "reg_engine" or not database_name.endswith("_test"):
        pytest.fail("TEST_DATABASE_URL must point to a disposable database ending with '_test'.")

    return database_url


def _alembic_config() -> Config:
    backend_root = Path(__file__).resolve().parents[1]
    config = Config(str(backend_root / "alembic.ini"))
    config.set_main_option("script_location", str(backend_root / "migrations"))
    return config


def _run_alembic_upgrade(database_url: str) -> None:
    previous_url = os.environ.get("TEST_DATABASE_URL")
    os.environ["TEST_DATABASE_URL"] = database_url
    try:
        command.upgrade(_alembic_config(), "head")
    finally:
        if previous_url is None:
            os.environ.pop("TEST_DATABASE_URL", None)
        else:
            os.environ["TEST_DATABASE_URL"] = previous_url


def _reset_public_schema(engine: Engine) -> None:
    with engine.connect().execution_options(isolation_level="AUTOCOMMIT") as connection:
        connection.execute(text("DROP SCHEMA IF EXISTS public CASCADE"))
        connection.execute(text("CREATE SCHEMA public"))


def _render_docx_xml_from_card(template_body: str, card: CardRead) -> str:
    service = object.__new__(DocumentService)
    rendered_text = service._render_plain_text_template(template_body, _RenderContext(card=card))
    content = service._build_docx_from_text(rendered_text)
    with ZipFile(BytesIO(content)) as docx:
        return docx.read("word/document.xml").decode("utf-8")


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _binary_docx_bytes(body_text: str) -> bytes:
    escaped_text = body_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body><w:p><w:r><w:t xml:space="preserve">{escaped_text}</w:t></w:r></w:p>'
        "</w:body></w:document>"
    )
    buffer = BytesIO()
    with ZipFile(buffer, "w") as archive:
        archive.writestr(
            "[Content_Types].xml",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">'
            '<Default Extension="rels" '
            'ContentType="application/vnd.openxmlformats-package.relationships+xml"/>'
            '<Default Extension="xml" ContentType="application/xml"/>'
            '<Override PartName="/word/document.xml" '
            'ContentType="application/vnd.openxmlformats-officedocument.'
            'wordprocessingml.document.main+xml"/>'
            "</Types>",
        )
        archive.writestr(
            "_rels/.rels",
            '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
            '<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/'
            'relationships"><Relationship Id="rId1" '
            'Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/'
            'officeDocument" Target="word/document.xml"/></Relationships>',
        )
        archive.writestr("word/document.xml", document_xml)
    return buffer.getvalue()


def _card_read_with_file_ref(value: FileRefValueRead | None) -> CardRead:
    return CardRead(
        card_id=uuid4(),
        registry_id=uuid4(),
        card_template_id=uuid4(),
        card_template_name="Базовый шаблон",
        organization_id=uuid4(),
        display_name="File ref render card",
        fields={
            "main.support_file": CardFieldRead(
                field_id=uuid4(),
                code="support_file",
                field_type="file_ref",
                value=value,
            )
        },
    )


def _card_print_layout(field_id: UUID) -> dict[str, Any]:
    return {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [
            {
                "id": "heading",
                "kind": "heading",
                "page": 1,
                "row": 1,
                "column": 1,
                "row_span": 2,
                "column_span": 12,
                "text": "Печатная форма",
            },
            {
                "id": "text-field",
                "kind": "field",
                "page": 1,
                "row": 4,
                "column": 1,
                "row_span": 2,
                "column_span": 8,
                "field_id": str(field_id),
                "label": "Текстовое поле",
            },
        ],
    }


def _card_print_section_layout(field_id: UUID) -> dict[str, Any]:
    return {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "baseline_mm": 4, "row_height_mm": 8, "snap_mm": 2},
        "sections": [
            {
                "id": "main-section",
                "kind": "section",
                "title": "Основной блок",
                "page": 1,
                "x_mm": 12,
                "y_mm": 24,
                "width_mm": 186,
                "height_mm": 64,
                "grid_columns": 12,
                "items": [
                    {
                        "id": "heading",
                        "kind": "heading",
                        "row": 1,
                        "column": 1,
                        "row_span": 1,
                        "column_span": 12,
                        "text": "Печатная форма",
                    },
                    {
                        "id": "text-field",
                        "kind": "field",
                        "row": 2,
                        "column": 1,
                        "row_span": 2,
                        "column_span": 8,
                        "field_id": str(field_id),
                        "label": "Текстовое поле",
                        "show_label": True,
                    },
                ],
            }
        ],
        "overlays": [
            {
                "id": "bottom-line",
                "kind": "line",
                "page": 1,
                "x_mm": 12,
                "y_mm": 96,
                "width_mm": 186,
                "height_mm": 2,
            }
        ],
    }


def _card_read_for_print_layout(field_id: UUID) -> CardRead:
    return CardRead(
        card_id=uuid4(),
        registry_id=uuid4(),
        card_template_id=uuid4(),
        organization_id=uuid4(),
        display_name="Печатная карточка",
        fields={
            "main.text": CardFieldRead(
                field_id=field_id,
                code="text",
                field_type="text",
                value="Значение для печати",
            )
        },
    )


@pytest.fixture(scope="module")
def migrated_test_engine() -> Iterator[Engine]:
    database_url = _require_test_database_url()
    engine = create_engine(database_url)

    _reset_public_schema(engine)
    _run_alembic_upgrade(database_url)

    try:
        yield engine
    finally:
        engine.dispose()


@pytest.fixture()
def db_session(migrated_test_engine: Engine) -> Iterator[Session]:
    connection = migrated_test_engine.connect()
    transaction = connection.begin()
    session = Session(bind=connection, expire_on_commit=False)

    try:
        yield session
    finally:
        session.close()
        transaction.rollback()
        connection.close()


def _create_user(
    session: Session,
    email: str,
    display_name: str = "Test user",
    *,
    is_superuser: bool = False,
) -> User:
    user = User(email=email, display_name=display_name, is_superuser=is_superuser)
    session.add(user)
    session.flush()
    return user


def _create_role_with_permissions(
    session: Session,
    role_code: str,
    permission_codes: list[str],
) -> Role:
    role = Role(code=role_code, name=role_code)
    session.add(role)
    session.flush()

    for permission_code in permission_codes:
        permission = Permission(code=permission_code, description=permission_code)
        session.add(permission)
        session.flush()
        session.execute(
            role_permissions.insert().values(
                role_id=role.id,
                permission_id=permission.id,
            )
        )

    session.flush()
    return role


def _grant_access(
    session: Session,
    *,
    user_id: UUID,
    role_id: UUID,
    organization_id: UUID | None = None,
    registry_id: UUID | None = None,
    include_descendants: bool = True,
    created_by: UUID | None = None,
) -> AccessGrant:
    grant = AccessGrant(
        user_id=user_id,
        role_id=role_id,
        organization_id=organization_id,
        registry_id=registry_id,
        include_descendants=include_descendants,
        created_by=created_by,
    )
    session.add(grant)
    session.flush()
    return grant


def _document_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "documents-system@example.test", is_superuser=True)
    schema_admin = _create_user(db_session, "documents-schema-admin@example.test")
    card_admin = _create_user(db_session, "documents-card-admin@example.test")
    sibling_admin = _create_user(db_session, "documents-sibling-admin@example.test")
    no_access_user = _create_user(db_session, "documents-no-access@example.test")
    schema_role = _create_role_with_permissions(
        db_session,
        "documents_schema_admin",
        ["registry.schema.manage"],
    )
    card_role = _create_role_with_permissions(
        db_session,
        "documents_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="documents-root",
        name="Documents Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="documents-child",
        name="Documents Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="documents-sibling",
        name="Documents Sibling",
        created_by=system_admin.id,
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="documents-registry",
        name="Documents Registry",
    )

    _grant_access(
        db_session,
        user_id=schema_admin.id,
        role_id=schema_role.id,
        registry_id=registry.id,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=card_admin.id,
        role_id=card_role.id,
        organization_id=child.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )
    _grant_access(
        db_session,
        user_id=sibling_admin.id,
        role_id=card_role.id,
        organization_id=sibling.id,
        registry_id=registry.id,
        include_descendants=True,
        created_by=system_admin.id,
    )

    block = schema_service.create_block_for_actor(
        actor_user_id=schema_admin.id,
        registry_id=registry.id,
        code="main",
        title="Основной блок",
    )
    field = schema_service.create_field_for_actor(
        actor_user_id=schema_admin.id,
        block_id=block.id,
        code="full_name",
        label="Название",
        field_type="text",
    )
    card_service = CardService(db_session)
    card = card_service.create_card_for_actor(
        actor_user_id=card_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Тестовая карточка",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=card_admin.id,
        card_id=card.id,
        field_id=field.id,
        value="Значение из карточки",
    )

    return {
        "system_admin": system_admin,
        "schema_admin": schema_admin,
        "card_admin": card_admin,
        "sibling_admin": sibling_admin,
        "no_access_user": no_access_user,
        "root": root,
        "child": child,
        "sibling": sibling,
        "registry": registry,
        "block": block,
        "field": field,
        "card": card,
    }


@pytest.fixture()
def document_service(db_session: Session, tmp_path: Path) -> DocumentService:
    return DocumentService(
        db_session,
        storage=LocalFilesystemAttachmentStorage(tmp_path, key_prefix="generated_documents"),
    )


def test_pdf_renderer_supports_cyrillic_text() -> None:
    service = object.__new__(DocumentService)

    content = service._build_pdf_from_text("Карточка: Тест\nПоле: Значение")

    assert content.startswith(b"%PDF")
    extracted_text = _extract_pdf_text(content)
    assert "Карточка: Тест" in extracted_text
    assert "Поле: Значение" in extracted_text


def test_card_print_layout_renderers_use_structured_layout_and_card_values() -> None:
    field_id = uuid4()
    card = _card_read_for_print_layout(field_id)
    layout = _card_print_layout(field_id)
    service = object.__new__(DocumentService)

    docx_content = service._build_docx_from_card_print_layout(layout, _RenderContext(card=card))
    with ZipFile(BytesIO(docx_content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "Печатная форма" in rendered_xml
    assert "Текстовое поле: Значение для печати" in rendered_xml

    pdf_content = service._build_pdf_from_card_print_layout(layout, _RenderContext(card=card))
    assert pdf_content.startswith(b"%PDF")
    extracted_text = _extract_pdf_text(pdf_content)
    assert "Печатная форма" in extracted_text
    assert "Текстовое поле: Значение для печати" in extracted_text


def test_card_print_layout_docx_renders_sections_as_editable_word_tables() -> None:
    field_id = uuid4()
    card = _card_read_for_print_layout(field_id)
    layout = _card_print_section_layout(field_id)
    service = object.__new__(DocumentService)

    docx_content = service._build_docx_from_card_print_layout(layout, _RenderContext(card=card))

    with ZipFile(BytesIO(docx_content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "<w:tbl>" in rendered_xml
    assert "<w:gridSpan" in rendered_xml
    assert "Основной блок" in rendered_xml
    assert "Печатная форма" in rendered_xml
    section = layout["sections"][0]
    assert isinstance(section, dict)
    items = section["items"]
    assert isinstance(items, list)
    field_item = items[1]
    assert isinstance(field_item, dict)
    field_value = card.fields["main.text"].value
    assert f"{field_item['label']}: {field_value}" in rendered_xml


def test_linked_generation_uses_current_form_layout_without_persisting_expansion() -> None:
    field_id = uuid4()
    card_template_id = uuid4()
    card = replace(_card_read_for_print_layout(field_id), card_template_id=card_template_id)
    card_template = SimpleNamespace(
        id=card_template_id,
        registry_id=card.registry_id,
        archived_at=None,
        is_active=True,
        field_schema_json={
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "section-main",
                        "row": 1,
                        "column": 1,
                        "row_span": 4,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "field-current",
                                "kind": "field",
                                "field_id": str(field_id),
                                "row": 1,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 6,
                            }
                        ],
                    }
                ],
            }
        },
    )

    class FakeSession:
        def get(self, model: type[object], object_id: UUID) -> object | None:
            if model is CardTemplate and object_id == card_template_id:
                return card_template
            if model is FormField and object_id == field_id:
                return SimpleNamespace(label="РўРµРєСЃС‚РѕРІРѕРµ РїРѕР»Рµ")
            return None

    layout = {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [
            {
                "id": "linked-card",
                "kind": "card_layout",
                "card_template_id": str(card_template_id),
                "page": 1,
                "x_mm": 15.0,
                "y_mm": 30.0,
                "width_mm": 180.0,
                "height_mm": 220.0,
            }
        ],
        "overlays": [
            {
                "id": "signature-line",
                "kind": "line",
                "page": 1,
                "x_mm": 15.0,
                "y_mm": 260.0,
                "width_mm": 80.0,
                "height_mm": 1.0,
            },
            {
                "id": "brand-image",
                "kind": "image",
                "page": 1,
                "x_mm": 20.0,
                "y_mm": 20.0,
                "width_mm": 30.0,
                "height_mm": 20.0,
                "alt": "Эмблема карточки",
            },
            {
                "id": "card-qr",
                "kind": "qr_code",
                "page": 1,
                "x_mm": 160.0,
                "y_mm": 220.0,
                "width_mm": 24.0,
                "height_mm": 24.0,
                "text": "QR-CARD-42",
            },
        ],
    }
    persisted_layout = deepcopy(layout)
    service = DocumentService(FakeSession(), storage=SimpleNamespace())  # type: ignore[arg-type]
    render_context = _RenderContext(card=card)

    render_layout = service._expand_linked_card_layouts_for_generation(layout, render_context)
    docx_content = service._build_docx_from_card_print_layout(layout, render_context)
    pdf_content = service._build_pdf_from_card_print_layout(layout, render_context)

    assert layout == persisted_layout
    assert render_layout["items"][0]["source_item_id"] == "field-current"
    assert [overlay["id"] for overlay in render_layout["overlays"]] == [
        "signature-line",
        "brand-image",
        "card-qr",
    ]
    assert docx_content.startswith(b"PK")
    with ZipFile(BytesIO(docx_content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    field_value = str(card.fields["main.text"].value)
    assert field_value in rendered_xml
    assert "Эмблема карточки" in rendered_xml
    assert "QR-CARD-42" in rendered_xml
    assert pdf_content.startswith(b"%PDF")
    pdf_text = "".join(_extract_pdf_text(pdf_content).split())
    assert "".join(field_value.split()) in pdf_text
    assert "Эмблемакарточки" in pdf_text
    assert "QR-CARD-42" in pdf_text


def test_convert_production_legacy_print_view_promotes_print_only_items_to_overlays(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    card_template_id = uuid4()
    document_template_id = uuid4()
    first_field_id = uuid4()
    second_field_id = uuid4()
    legacy_block_id = uuid4()
    previous_layout: dict[str, Any] = {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [
            {
                "id": "legacy-heading",
                "kind": "heading",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 12.0,
                "width_mm": 186.0,
                "height_mm": 8.0,
                "text": "Печатная форма карточки",
            },
            {
                "id": "legacy-first-field",
                "kind": "field",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 24.0,
                "width_mm": 90.0,
                "height_mm": 16.0,
                "field_id": str(first_field_id),
                "label": "Первое поле",
            },
            {
                "id": "legacy-second-field",
                "kind": "field",
                "page": 1,
                "x_mm": 108.0,
                "y_mm": 24.0,
                "width_mm": 90.0,
                "height_mm": 16.0,
                "field_id": str(second_field_id),
                "label": "Второе поле",
            },
            {
                "id": "legacy-block",
                "kind": "block",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 40.0,
                "width_mm": 186.0,
                "height_mm": 4.0,
                "block_id": str(legacy_block_id),
            },
            {
                "id": "legacy-static-note",
                "kind": "static_text",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 44.0,
                "width_mm": 186.0,
                "height_mm": 10.0,
                "text": "Служебная пометка",
            },
            {
                "id": "legacy-metadata",
                "kind": "metadata",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 58.0,
                "width_mm": 90.0,
                "height_mm": 8.0,
                "metadata_key": "card.display_name",
                "style": {"font_size": 10, "bold": True},
            },
            {
                "id": "legacy-page-number",
                "kind": "page_number",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 70.0,
                "width_mm": 40.0,
                "height_mm": 8.0,
                "style": {"font_size": 9, "align": "left"},
            },
            {
                "id": "legacy-print-date",
                "kind": "print_date",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 82.0,
                "width_mm": 40.0,
                "height_mm": 8.0,
                "style": {"font_size": 9, "align": "left"},
            },
            {
                "id": "brand-image",
                "kind": "image",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 96.0,
                "width_mm": 30.0,
                "height_mm": 20.0,
                "alt": "Эмблема карточки",
            },
            {
                "id": "card-qr",
                "kind": "qr_code",
                "page": 1,
                "x_mm": 160.0,
                "y_mm": 96.0,
                "width_mm": 24.0,
                "height_mm": 24.0,
                "text": "QR-CARD-42",
            },
            {
                "id": "legacy-line",
                "kind": "line",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 124.0,
                "width_mm": 186.0,
                "height_mm": 1.0,
                "style": {"border_color": "#1E293B"},
            },
            {
                "id": "legacy-rectangle",
                "kind": "rectangle",
                "page": 1,
                "x_mm": 108.0,
                "y_mm": 58.0,
                "width_mm": 90.0,
                "height_mm": 62.0,
                "style": {"border": "thin", "border_color": "#64748B"},
            },
        ],
        "overlays": [
            {
                "id": "brand-image",
                "kind": "image",
                "page": 1,
                "x_mm": 20.0,
                "y_mm": 20.0,
                "width_mm": 30.0,
                "height_mm": 20.0,
                "alt": "Эмблема карточки",
            },
            {
                "id": "card-qr",
                "kind": "qr_code",
                "page": 1,
                "x_mm": 160.0,
                "y_mm": 220.0,
                "width_mm": 24.0,
                "height_mm": 24.0,
                "text": "QR-CARD-42",
            },
        ],
        "sections": [
            {
                "id": "legacy-section",
                "kind": "section",
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 130.0,
                "width_mm": 186.0,
                "height_mm": 32.0,
                "grid_columns": 12,
                "items": [
                    {
                        "id": "legacy-heading",
                        "kind": "heading",
                        "row": 1,
                        "column": 1,
                        "row_span": 1,
                        "column_span": 12,
                        "text": "Печатная форма карточки",
                    },
                    {
                        "id": "legacy-static-note",
                        "kind": "static_text",
                        "row": 2,
                        "column": 1,
                        "row_span": 1,
                        "column_span": 12,
                        "text": "Служебная пометка",
                    },
                ],
            }
        ],
    }
    previous_snapshot = deepcopy(previous_layout)
    card = replace(_card_read_for_print_layout(first_field_id), card_template_id=card_template_id)
    card_template = SimpleNamespace(
        id=card_template_id,
        registry_id=card.registry_id,
        archived_at=None,
        is_active=True,
        field_schema_json={
            "form_layout": {
                "columns": 12,
                "sections": [
                    {
                        "id": "section-main",
                        "row": 1,
                        "column": 1,
                        "row_span": 4,
                        "column_span": 12,
                        "items": [
                            {
                                "id": "field-current",
                                "kind": "field",
                                "field_id": str(first_field_id),
                                "row": 1,
                                "column": 1,
                                "row_span": 1,
                                "column_span": 6,
                            }
                        ],
                    }
                ],
            }
        },
    )
    template = SimpleNamespace(
        id=document_template_id,
        registry_id=registry_id,
        card_template_id=card_template_id,
        template_format="card_print_layout_v1",
    )
    previous_version = SimpleNamespace(
        id=uuid4(),
        version_number=1,
        layout_json=previous_layout,
    )
    next_version = SimpleNamespace(
        id=uuid4(),
        template_id=document_template_id,
        version_number=2,
        template_format="card_print_layout_v1",
        layout_json=None,
    )

    class FakeSession:
        def flush(self) -> None:
            return None

        def get(self, model: type[object], object_id: UUID) -> object | None:
            if model is CardTemplate and object_id == card_template_id:
                return card_template
            if model is FormField and object_id == first_field_id:
                return SimpleNamespace(label="Текущее поле")
            return None

    service = DocumentService(FakeSession(), storage=SimpleNamespace())  # type: ignore[arg-type]
    audit_events: list[dict[str, object]] = []

    monkeypatch.setattr(service, "_get_active_template", lambda _template_id: template)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "_latest_template_version", lambda _template_id: previous_version)
    monkeypatch.setattr(service, "_next_template_version_number", lambda _template_id: 2)
    monkeypatch.setattr(
        service,
        "_card_print_allowed_field_ids",
        lambda **_payload: {first_field_id, second_field_id},
    )
    monkeypatch.setattr(
        service,
        "_card_print_allowed_block_ids",
        lambda **_payload: {legacy_block_id},
    )
    monkeypatch.setattr(
        service,
        "_create_card_print_template_version",
        lambda **payload: (
            setattr(next_version, "layout_json", payload["layout_json"]) or next_version
        ),
    )

    class FakeAuditService:
        def __init__(self, _session: object) -> None:
            pass

        def record_user_event(self, **payload: object) -> None:
            audit_events.append(payload)

    monkeypatch.setattr("app.services.documents.AuditService", FakeAuditService)

    result = service.convert_print_view_to_linked_card_for_actor(
        actor_user_id=actor_user_id,
        template_id=document_template_id,
    )

    assert result is next_version
    assert result.version_number == 2
    assert previous_version.layout_json == previous_snapshot
    converted_layout = result.layout_json
    assert converted_layout["composition_mode"] == "linked_card"
    assert len(converted_layout["items"]) == 1
    assert converted_layout["items"][0]["kind"] == "card_layout"
    assert converted_layout["items"][0]["card_template_id"] == str(card_template_id)
    converted_overlays = converted_layout["overlays"]
    assert isinstance(converted_overlays, list)
    overlay_ids = [overlay["id"] for overlay in converted_overlays]
    assert overlay_ids == [
        "brand-image",
        "card-qr",
        "legacy-line",
        "legacy-rectangle",
        "legacy-heading",
        "legacy-static-note",
        "legacy-metadata",
        "legacy-page-number",
        "legacy-print-date",
    ]
    assert len(overlay_ids) == len(set(overlay_ids))
    assert "legacy-first-field" not in overlay_ids
    assert "legacy-second-field" not in overlay_ids
    assert "legacy-block" not in overlay_ids
    overlays_by_id = {overlay["id"]: overlay for overlay in converted_overlays}
    assert overlays_by_id["legacy-heading"]["text"] == "Печатная форма карточки"
    assert overlays_by_id["legacy-static-note"]["text"] == "Служебная пометка"
    assert overlays_by_id["legacy-metadata"]["metadata_key"] == "card.display_name"
    assert overlays_by_id["legacy-page-number"]["kind"] == "page_number"
    assert overlays_by_id["legacy-print-date"]["kind"] == "print_date"
    assert overlays_by_id["brand-image"]["alt"] == "Эмблема карточки"
    assert overlays_by_id["card-qr"]["text"] == "QR-CARD-42"
    assert overlays_by_id["legacy-line"] == {
        "id": "legacy-line",
        "kind": "line",
        "page": 1,
        "x_mm": 12.0,
        "y_mm": 124.0,
        "width_mm": 186.0,
        "height_mm": 1.0,
        "style": {"border_color": "#1E293B"},
    }
    assert overlays_by_id["legacy-rectangle"] == {
        "id": "legacy-rectangle",
        "kind": "rectangle",
        "page": 1,
        "x_mm": 108.0,
        "y_mm": 58.0,
        "width_mm": 90.0,
        "height_mm": 62.0,
        "style": {"border": "thin", "border_color": "#64748B"},
    }
    assert validate_card_print_layout(converted_layout).errors == []
    assert validate_card_print_layout(previous_version.layout_json).errors == []

    render_context = _RenderContext(card=card)
    expected_rendered_text = [
        "Печатная форма карточки",
        "Служебная пометка",
        card.display_name,
        "Страница 1",
        date.today().isoformat(),
        "Эмблема карточки",
        "QR-CARD-42",
    ]
    docx_content = service._build_docx_from_card_print_layout(converted_layout, render_context)
    assert docx_content.startswith(b"PK")
    with ZipFile(BytesIO(docx_content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    for expected_text in expected_rendered_text:
        assert rendered_xml.count(expected_text) == 1

    pdf_content = service._build_pdf_from_card_print_layout(converted_layout, render_context)
    assert pdf_content.startswith(b"%PDF")
    pdf_text = "".join(_extract_pdf_text(pdf_content).split())
    for expected_text in expected_rendered_text:
        assert pdf_text.count("".join(expected_text.split())) == 1
    assert audit_events == [
        {
            "actor_user_id": actor_user_id,
            "action": "document_template_version_create",
            "object_type": "document_template",
            "object_id": document_template_id,
            "new_data_json": {
                "version_id": str(next_version.id),
                "version_number": 2,
                "template_format": "card_print_layout_v1",
            },
        }
    ]


@pytest.mark.parametrize("overlay_kind", ["field", "block", "card_layout", "unknown"])
def test_convert_print_view_rejects_unsupported_explicit_overlay_without_writes(
    monkeypatch: pytest.MonkeyPatch,
    overlay_kind: str,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    card_template_id = uuid4()
    document_template_id = uuid4()
    previous_layout: dict[str, Any] = {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [],
        "overlays": [
            {
                "id": f"unsupported-{overlay_kind}",
                "kind": overlay_kind,
                "page": 1,
                "x_mm": 20.0,
                "y_mm": 20.0,
                "width_mm": 40.0,
                "height_mm": 8.0,
            }
        ],
    }
    previous_snapshot = deepcopy(previous_layout)
    template = SimpleNamespace(
        id=document_template_id,
        registry_id=registry_id,
        card_template_id=card_template_id,
        template_format="card_print_layout_v1",
    )
    previous_version = SimpleNamespace(
        id=uuid4(),
        version_number=1,
        layout_json=previous_layout,
    )

    class FakeSession:
        def flush(self) -> None:
            return None

    service = DocumentService(FakeSession(), storage=SimpleNamespace())  # type: ignore[arg-type]
    created_versions: list[dict[str, object]] = []
    audit_events: list[dict[str, object]] = []
    requested_version_numbers: list[UUID] = []

    monkeypatch.setattr(service, "_get_active_template", lambda _template_id: template)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "_latest_template_version", lambda _template_id: previous_version)
    monkeypatch.setattr(service, "_card_print_allowed_field_ids", lambda **_payload: set())
    monkeypatch.setattr(service, "_card_print_allowed_block_ids", lambda **_payload: set())
    monkeypatch.setattr(
        service,
        "_next_template_version_number",
        lambda template_id: requested_version_numbers.append(template_id) or 2,
    )
    monkeypatch.setattr(
        service,
        "_create_card_print_template_version",
        lambda **payload: created_versions.append(payload),
    )

    class FakeAuditService:
        def __init__(self, _session: object) -> None:
            pass

        def record_user_event(self, **payload: object) -> None:
            audit_events.append(payload)

    monkeypatch.setattr("app.services.documents.AuditService", FakeAuditService)

    converted_layout = service._linked_card_conversion_layout(
        previous_layout,
        card_template_id=card_template_id,
    )
    validation = validate_card_print_layout(converted_layout)

    assert any(
        f"overlay 'unsupported-{overlay_kind}' has unsupported kind '{overlay_kind}'" in error
        for error in validation.errors
    )
    with pytest.raises(
        DocumentServiceError,
        match="Связанный макет карточки содержит недопустимые параметры",
    ):
        service.convert_print_view_to_linked_card_for_actor(
            actor_user_id=actor_user_id,
            template_id=document_template_id,
        )

    assert previous_version.layout_json == previous_snapshot
    assert requested_version_numbers == []
    assert created_versions == []
    assert audit_events == []


def test_card_print_version_save_rejects_linked_template_identity_mismatch(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    document_template_id = uuid4()
    expected_card_template_id = uuid4()
    foreign_card_template_id = uuid4()
    template = SimpleNamespace(
        id=document_template_id,
        registry_id=registry_id,
        card_template_id=expected_card_template_id,
        template_format="card_print_layout_v1",
    )
    layout = {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [
            {
                "id": "linked-card",
                "kind": "card_layout",
                "card_template_id": str(foreign_card_template_id),
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 12.0,
                "width_mm": 186.0,
                "height_mm": 273.0,
            }
        ],
    }

    class FakeSession:
        def flush(self) -> None:
            return None

    service = DocumentService(FakeSession(), storage=SimpleNamespace())  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_get_active_template", lambda _template_id: template)
    monkeypatch.setattr(service, "_require_schema_permission", lambda *_args: None)
    monkeypatch.setattr(service, "_card_print_allowed_field_ids", lambda **_kwargs: set())
    monkeypatch.setattr(service, "_card_print_allowed_block_ids", lambda **_kwargs: set())
    monkeypatch.setattr(service, "_next_template_version_number", lambda _template_id: 2)
    monkeypatch.setattr(
        service,
        "_create_card_print_template_version",
        lambda **_kwargs: SimpleNamespace(id=uuid4(), version_number=2),
    )
    monkeypatch.setattr(
        service,
        "_record_card_print_template_version_audit",
        lambda **_kwargs: None,
    )

    with pytest.raises(
        DocumentServiceError,
        match="Связанный макет карточки не соответствует шаблону печатной формы",
    ):
        service.create_card_print_template_version_for_actor(
            actor_user_id=actor_user_id,
            template_id=document_template_id,
            layout_json=layout,
        )


def test_card_print_generation_rejects_document_template_for_another_card_template(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    registry_id = uuid4()
    document_card_template_id = uuid4()
    card_template_id = uuid4()
    template = SimpleNamespace(
        id=uuid4(),
        registry_id=registry_id,
        card_template_id=document_card_template_id,
        template_format="card_print_layout_v1",
        output_filename_template="{{ card.display_name }}.docx",
        output_content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        name="Печатная форма",
    )
    card = replace(
        _card_read_for_print_layout(uuid4()),
        registry_id=registry_id,
        card_template_id=card_template_id,
    )

    class FakeSession:
        def add(self, _value: object) -> None:
            return None

        def flush(self) -> None:
            return None

    class FakeStorage:
        backend_name = "test"

        def write_bytes(self, _content: bytes) -> SimpleNamespace:
            return SimpleNamespace(
                storage_key="generated/test.docx",
                content_length_bytes=4,
                checksum_sha256="0" * 64,
            )

    class FakeCardService:
        def __init__(self, _session: object) -> None:
            pass

        def read_card_for_actor(self, **_kwargs: object) -> CardRead:
            return card

    class FakeAuditService:
        def __init__(self, _session: object) -> None:
            pass

        def record_user_event(self, **_payload: object) -> None:
            return None

    service = DocumentService(FakeSession(), storage=FakeStorage())  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_get_active_template", lambda _template_id: template)
    monkeypatch.setattr(service, "_require_card_manage_permission", lambda *_args, **_kwargs: None)
    monkeypatch.setattr(
        service,
        "_latest_template_version",
        lambda _template_id: SimpleNamespace(id=uuid4()),
    )
    monkeypatch.setattr(service, "_render_template_content", lambda *_args: b"docx")
    monkeypatch.setattr("app.services.documents.CardService", FakeCardService)
    monkeypatch.setattr("app.services.documents.AuditService", FakeAuditService)

    with pytest.raises(
        DocumentServiceError,
        match="Печатная форма не соответствует шаблону карточки",
    ):
        service.generate_document_for_actor(
            actor_user_id=actor_user_id,
            template_id=template.id,
            card_id=card.card_id,
        )


def test_linked_generation_uses_schema_fallback_for_legacy_card_template() -> None:
    field_id = uuid4()
    block_id = uuid4()
    card_template_id = uuid4()
    card = replace(_card_read_for_print_layout(field_id), card_template_id=card_template_id)
    card_template = SimpleNamespace(
        id=card_template_id,
        registry_id=card.registry_id,
        archived_at=None,
        is_active=True,
        field_schema_json={"field_ids": [str(field_id)]},
    )
    block = SimpleNamespace(id=block_id, registry_id=card.registry_id, position=0, title="Раздел")
    field = SimpleNamespace(
        id=field_id,
        block_id=block_id,
        position=0,
        label="Поле",
    )

    class ScalarResult:
        def __init__(self, values: list[object]) -> None:
            self.values = values

        def all(self) -> list[object]:
            return self.values

    class FakeSession:
        def __init__(self) -> None:
            self.scalar_results = iter(([block], [field]))

        def get(self, model: type[object], object_id: UUID) -> object | None:
            if model is CardTemplate and object_id == card_template_id:
                return card_template
            return None

        def scalars(self, _statement: object) -> ScalarResult:
            return ScalarResult(list(next(self.scalar_results)))

    layout = {
        "version": "card_print_layout_v1",
        "page": {
            "format": "A4",
            "width_mm": 210,
            "height_mm": 297,
            "margin_mm": {"top": 12, "right": 12, "bottom": 12, "left": 12},
        },
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [
            {
                "id": "linked-card",
                "kind": "card_layout",
                "card_template_id": str(card_template_id),
                "page": 1,
                "x_mm": 12.0,
                "y_mm": 12.0,
                "width_mm": 186.0,
                "height_mm": 273.0,
            }
        ],
    }
    service = DocumentService(FakeSession(), storage=SimpleNamespace())  # type: ignore[arg-type]

    render_layout = service._expand_linked_card_layouts_for_generation(
        layout,
        _RenderContext(card=card),
    )

    assert render_layout["items"][0]["field_id"] == str(field_id)
    assert render_layout["items"][0]["source_item_id"] == f"field-{field_id}"


def test_linked_preview_maps_validation_details_to_safe_russian(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    registry_id = uuid4()
    layout = {
        "version": "card_print_layout_v1",
        "page": {"format": "A4", "width_mm": 210, "height_mm": 297},
        "grid": {"columns": 12, "row_height_mm": 8},
        "items": [
            {
                "id": "linked-card",
                "kind": "card_layout",
                "card_template_id": "not-a-uuid",
            }
        ],
    }
    service = DocumentService(SimpleNamespace(), storage=SimpleNamespace())  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_require_registry_read_permission", lambda *_args: None)
    monkeypatch.setattr(service, "_get_active_registry", lambda _registry_id: None)
    monkeypatch.setattr(service, "_card_print_allowed_field_ids", lambda **_kwargs: set())
    monkeypatch.setattr(service, "_card_print_allowed_block_ids", lambda **_kwargs: set())

    with pytest.raises(
        DocumentServiceError,
        match="Связанный макет карточки содержит недопустимые параметры",
    ):
        service.preview_card_print_layout_for_actor(
            actor_user_id=uuid4(),
            registry_id=registry_id,
            layout_json=layout,
        )


def test_docx_text_v1_renders_active_file_ref_as_safe_attachment_text() -> None:
    attachment_id = uuid4()
    card = _card_read_with_file_ref(
        FileRefValueRead(
            attachment_id=attachment_id,
            title="Скан заявления",
            original_filename="statement.pdf",
            content_type="application/pdf",
            content_length_bytes=128,
            scanner_status="deferred",
            archived_at=None,
        )
    )

    rendered_xml = _render_docx_xml_from_card("Файл: {{ fields.main.support_file }}", card)

    assert "Файл: Скан заявления (statement.pdf)" in rendered_xml
    assert str(attachment_id) not in rendered_xml
    assert "FileRefValueRead" not in rendered_xml
    assert "stored_file" not in rendered_xml
    assert "w:hyperlink" not in rendered_xml
    assert "/api/v1/attachments" not in rendered_xml
    assert "/attachments/" not in rendered_xml


def test_docx_text_v1_renders_empty_file_ref_as_empty_text() -> None:
    card = _card_read_with_file_ref(None)

    rendered_xml = _render_docx_xml_from_card("Файл: {{ fields.main.support_file }}", card)

    assert "Файл: " in rendered_xml
    assert "None" not in rendered_xml
    assert "FileRefValueRead" not in rendered_xml


def test_docx_text_v1_renders_archived_file_ref_with_archive_marker() -> None:
    attachment_id = uuid4()
    card = _card_read_with_file_ref(
        FileRefValueRead(
            attachment_id=attachment_id,
            title="Архивная справка",
            original_filename="old-reference.docx",
            content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
            content_length_bytes=256,
            scanner_status="deferred",
            archived_at=datetime(2026, 6, 30, tzinfo=UTC),
        )
    )

    rendered_xml = _render_docx_xml_from_card("Файл: {{ fields.main.support_file }}", card)

    assert "Файл: Архивная справка (old-reference.docx) (архив)" in rendered_xml
    assert str(attachment_id) not in rendered_xml
    assert "FileRefValueRead" not in rendered_xml


def test_document_template_creation_requires_schema_permission_and_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)

    with pytest.raises(PermissionDeniedError):
        document_service.create_template_for_actor(
            actor_user_id=context["no_access_user"].id,
            registry_id=context["registry"].id,
            code="summary",
            name="Сводка",
            template_body="Карточка: {{ card.display_name }}",
        )

    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="summary",
        name="Сводка",
        template_body="Карточка: {{ card.display_name }}",
    )

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "document_template",
            AuditEvent.object_id == template.id,
            AuditEvent.action == "document_template_create",
        )
    )
    assert template.template_format == "docx_text_v1"
    assert audit_event is not None


def test_generated_document_renders_schema_driven_card_data_to_storage(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="card-summary",
        name="Сводка карточки",
        template_body=(
            "Карточка: {{ card.display_name }}\n"
            "Поле: {{ fields.main.full_name }}\n"
            "ID: {{ card.id }}"
        ),
        output_filename_template="{{ card.display_name }}.docx",
    )

    generated = document_service.generate_document_for_actor(
        actor_user_id=context["card_admin"].id,
        template_id=template.id,
        card_id=context["card"].id,
    )

    stored_file = db_session.get(StoredFile, generated.stored_file_id)
    assert stored_file is not None
    assert generated.card_id == context["card"].id
    assert generated.template_id == template.id
    assert generated.output_filename == "Тестовая карточка.docx"
    assert stored_file.original_filename == "Тестовая карточка.docx"
    assert (
        stored_file.content_type
        == "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
    )

    content = document_service.read_generated_document_content_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
    )
    with ZipFile(BytesIO(content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "Карточка: Тестовая карточка" in rendered_xml
    assert "Поле: Значение из карточки" in rendered_xml
    assert str(context["card"].id) in rendered_xml

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == generated.id,
            AuditEvent.action == "generated_document_generate",
        )
    )
    assert audit_event is not None


def test_generated_document_download_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="download-audit",
        name="Download audit",
        template_body="РљР°СЂС‚РѕС‡РєР°: {{ card.display_name }}",
    )
    generated = document_service.generate_document_for_actor(
        actor_user_id=context["card_admin"].id,
        template_id=template.id,
        card_id=context["card"].id,
    )

    content = document_service.read_generated_document_content_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
    )

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == generated.id,
            AuditEvent.action == "generated_document_download",
        )
    )
    assert content
    assert audit_event is not None
    assert audit_event.new_data_json is not None
    assert audit_event.new_data_json["stored_file_id"] == str(generated.stored_file_id)


def test_generated_document_download_audit_boundary_unit(
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    actor_user_id = uuid4()
    generated_document_id = uuid4()
    card_id = uuid4()
    stored_file_id = uuid4()
    registry_id = uuid4()
    organization_id = uuid4()
    audit_events: list[dict[str, Any]] = []

    generated = SimpleNamespace(
        id=generated_document_id,
        card_id=card_id,
        stored_file_id=stored_file_id,
        archived_at=None,
    )
    card = SimpleNamespace(
        id=card_id,
        registry_id=registry_id,
        organization_id=organization_id,
    )
    stored_file = SimpleNamespace(
        id=stored_file_id,
        storage_key="generated/doc.docx",
        content_length_bytes=9,
    )

    class FakeSession:
        def get(self, model: type[object], object_id: UUID) -> object | None:
            if model is StoredFile and object_id == stored_file_id:
                return stored_file
            return None

    class FakeStorage:
        backend_name = "fake"

        def read_bytes(self, storage_key: str) -> bytes:
            assert storage_key == "generated/doc.docx"
            return b"doc-bytes"

    class FakePermissionService:
        def __init__(self, session: FakeSession) -> None:
            self.session = session

        def can_see_organization(
            self,
            checked_actor_user_id: UUID,
            checked_organization_id: UUID,
            *,
            registry_id: UUID,
        ) -> bool:
            assert checked_actor_user_id == actor_user_id
            assert checked_organization_id == organization_id
            assert registry_id == card.registry_id
            return True

    class FakeAuditService:
        def __init__(self, session: FakeSession) -> None:
            self.session = session

        def record_user_event(self, **kwargs: Any) -> None:
            audit_events.append(kwargs)

    service = DocumentService(FakeSession(), storage=FakeStorage())  # type: ignore[arg-type]
    monkeypatch.setattr(service, "_get_generated_document", lambda object_id: generated)
    monkeypatch.setattr(
        service,
        "_get_readable_card",
        lambda object_id, *, include_archive: card,
    )
    monkeypatch.setattr("app.services.documents.PermissionService", FakePermissionService)
    monkeypatch.setattr("app.services.documents.AuditService", FakeAuditService)

    content = service.read_generated_document_content_for_actor(
        actor_user_id=actor_user_id,
        generated_document_id=generated_document_id,
    )

    assert content == b"doc-bytes"
    assert audit_events == [
        {
            "actor_user_id": actor_user_id,
            "action": "generated_document_download",
            "object_type": "generated_document",
            "object_id": generated_document_id,
            "new_data_json": {
                "stored_file_id": str(stored_file_id),
                "content_length_bytes": 9,
            },
        }
    ]


def test_generated_pdf_renders_docx_text_v1_card_data_to_storage(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="card-summary-pdf",
        name="PDF summary",
        template_body=(
            "Карточка: {{ card.display_name }}\n"
            "Поле: {{ fields.main.full_name }}\n"
            "ID: {{ card.id }}"
        ),
        output_filename_template="{{ card.display_name }}.docx",
    )

    generated = document_service.generate_pdf_for_actor(
        actor_user_id=context["card_admin"].id,
        template_id=template.id,
        card_id=context["card"].id,
        title="PDF summary",
    )

    stored_file = db_session.get(StoredFile, generated.stored_file_id)
    card_read = CardService(db_session).read_card_for_actor(
        actor_user_id=context["card_admin"].id,
        card_id=context["card"].id,
    )
    field_value = card_read.fields["main.full_name"].value
    assert stored_file is not None
    assert generated.card_id == context["card"].id
    assert generated.template_id == template.id
    assert generated.content_type == "application/pdf"
    assert generated.output_filename == f"{context['card'].display_name}.pdf"
    assert stored_file.original_filename == f"{context['card'].display_name}.pdf"
    assert stored_file.content_type == "application/pdf"

    content = document_service.read_generated_document_content_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
    )
    assert content.startswith(b"%PDF")
    extracted_text = _extract_pdf_text(content)
    assert f"Карточка: {context['card'].display_name}" in extracted_text
    assert f"Поле: {field_value}" in extracted_text
    assert str(context["card"].id) in extracted_text

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == generated.id,
            AuditEvent.action == "generated_document_pdf_generate",
        )
    )
    assert audit_event is not None


def test_generated_pdf_rejects_binary_template_until_converter_boundary(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template, _version = document_service.create_binary_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="binary-pdf",
        name="Binary PDF",
        original_filename="binary-template.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content=_binary_docx_bytes("Binary {{ card.display_name }}"),
    )

    with pytest.raises(DocumentServiceError, match="PDF conversion supports docx_text_v1"):
        document_service.generate_pdf_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_generated_document_rejects_unknown_placeholder(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="broken",
        name="Broken",
        template_body="Missing: {{ fields.main.missing }}",
    )

    with pytest.raises(DocumentServiceError):
        document_service.generate_document_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_generated_document_render_requires_cards_manage_in_scope(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="scope",
        name="Scope",
        template_body="Карточка: {{ card.display_name }}",
    )

    with pytest.raises(PermissionDeniedError):
        document_service.generate_document_for_actor(
            actor_user_id=context["sibling_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_generated_document_does_not_render_superseded_card(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="superseded",
        name="Superseded",
        template_body="Карточка: {{ card.display_name }}",
    )
    CardService(db_session).transfer_card_for_actor(
        actor_user_id=context["system_admin"].id,
        card_id=context["card"].id,
        target_organization_id=context["sibling"].id,
    )

    with pytest.raises(DocumentServiceError):
        document_service.generate_document_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )


def test_archived_template_cannot_render_and_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="archive-template",
        name="Archive template",
        template_body="Карточка: {{ card.display_name }}",
    )

    archived = document_service.archive_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        template_id=template.id,
        archive_reason="Replaced",
    )

    with pytest.raises(DocumentServiceError):
        document_service.generate_document_for_actor(
            actor_user_id=context["card_admin"].id,
            template_id=template.id,
            card_id=context["card"].id,
        )

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "document_template",
            AuditEvent.object_id == archived.id,
            AuditEvent.action == "document_template_archive",
        )
    )
    assert archived.archived_at is not None
    assert archived.is_active is False
    assert audit_event is not None


def test_generated_document_archive_preserves_stored_file_and_writes_audit(
    db_session: Session,
    document_service: DocumentService,
) -> None:
    context = _document_context(db_session)
    template = document_service.create_template_for_actor(
        actor_user_id=context["schema_admin"].id,
        registry_id=context["registry"].id,
        code="archive-generated",
        name="Archive generated",
        template_body="Карточка: {{ card.display_name }}",
    )
    generated = document_service.generate_document_for_actor(
        actor_user_id=context["card_admin"].id,
        template_id=template.id,
        card_id=context["card"].id,
    )
    stored_file_id = generated.stored_file_id

    archived = document_service.archive_generated_document_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
        archive_reason="Replaced",
    )

    stored_file = db_session.get(StoredFile, stored_file_id)
    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == archived.id,
            AuditEvent.action == "generated_document_archive",
        )
    )
    assert archived.archived_at is not None
    assert archived.archive_reason == "Replaced"
    assert stored_file is not None
    assert stored_file.archived_at is None
    assert document_service.read_generated_document_content_for_actor(
        actor_user_id=context["card_admin"].id,
        generated_document_id=generated.id,
        include_archive=True,
    )
    assert audit_event is not None
