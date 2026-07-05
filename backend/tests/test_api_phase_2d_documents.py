import os
from collections.abc import Iterator
from io import BytesIO
from pathlib import Path
from typing import Any
from uuid import UUID
from zipfile import ZIP_DEFLATED, ZipFile

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from pypdf import PdfReader
from sqlalchemy import create_engine, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.api.dependencies import get_db_session
from app.core.config import get_settings
from app.main import create_app
from app.models import AccessGrant, AuditEvent, Permission, Role, User, role_permissions
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.registry_schema import RegistrySchemaService

DOCX_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document"


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL document API tests.")

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


@pytest.fixture()
def api_client(db_session: Session, tmp_path: Path) -> Iterator[TestClient]:
    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    previous_storage_root = os.environ.get("REG_ENGINE_STORAGE_ROOT")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    os.environ["REG_ENGINE_STORAGE_ROOT"] = str(tmp_path)
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        _restore_env("ALLOW_DEV_ACTOR_HEADER", previous_allow_dev_actor)
        _restore_env("REG_ENGINE_STORAGE_ROOT", previous_storage_root)
        get_settings.cache_clear()


def _restore_env(name: str, value: str | None) -> None:
    if value is None:
        os.environ.pop(name, None)
    else:
        os.environ[name] = value


def _actor_headers(user_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id)}


def _binary_docx_bytes(body_text: str) -> bytes:
    escaped_text = body_text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")
    document_xml = (
        '<?xml version="1.0" encoding="UTF-8" standalone="yes"?>'
        '<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">'
        f'<w:body><w:p><w:r><w:t xml:space="preserve">{escaped_text}</w:t></w:r></w:p>'
        "</w:body></w:document>"
    )
    buffer = BytesIO()
    with ZipFile(buffer, "w", compression=ZIP_DEFLATED) as archive:
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


def _extract_pdf_text(content: bytes) -> str:
    reader = PdfReader(BytesIO(content))
    return "\n".join(page.extract_text() or "" for page in reader.pages)


def _create_user(session: Session, email: str, *, is_superuser: bool = False) -> User:
    user = User(email=email, display_name=email, is_superuser=is_superuser)
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
            role_permissions.insert().values(role_id=role.id, permission_id=permission.id)
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


def _document_api_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "api-documents-system@example.test", is_superuser=True)
    schema_admin = _create_user(db_session, "api-documents-schema-admin@example.test")
    card_admin = _create_user(db_session, "api-documents-card-admin@example.test")
    sibling_admin = _create_user(db_session, "api-documents-sibling-admin@example.test")
    schema_role = _create_role_with_permissions(
        db_session,
        "api_documents_schema_admin",
        ["registry.schema.manage"],
    )
    card_role = _create_role_with_permissions(
        db_session,
        "api_documents_card_admin",
        ["cards.manage"],
    )
    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="api-documents-root",
        name="API Documents Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="api-documents-child",
        name="API Documents Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="api-documents-sibling",
        name="API Documents Sibling",
        created_by=system_admin.id,
    )
    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="api-documents-registry",
        name="API Documents Registry",
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
        code="title",
        label="Название",
        field_type="text",
    )
    card = CardService(db_session).create_card_for_actor(
        actor_user_id=card_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Документируемая карточка",
    )
    CardService(db_session).set_field_value_for_actor(
        actor_user_id=card_admin.id,
        card_id=card.id,
        field_id=field.id,
        value="Значение поля",
    )
    return {
        "system_admin": system_admin,
        "schema_admin": schema_admin,
        "card_admin": card_admin,
        "sibling_admin": sibling_admin,
        "registry": registry,
        "field": field,
        "card": card,
    }


def _card_print_layout(field_id: UUID, *, heading: str = "Печатная форма") -> dict[str, Any]:
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
                "id": "title",
                "kind": "heading",
                "page": 1,
                "row": 1,
                "column": 1,
                "row_span": 2,
                "column_span": 12,
                "text": heading,
            },
            {
                "id": "field-title",
                "kind": "field",
                "page": 1,
                "row": 4,
                "column": 1,
                "row_span": 2,
                "column_span": 8,
                "field_id": str(field_id),
                "label_position": "left",
            },
        ],
    }


def test_generated_document_api_supports_phase_2d_workflow(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _document_api_context(db_session)

    template_response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/document-templates",
        headers=_actor_headers(context["schema_admin"].id),
        json={
            "code": "summary",
            "name": "Сводка",
            "template_body": "Карточка: {{ card.display_name }}\nПоле: {{ fields.main.title }}",
        },
    )
    assert template_response.status_code == 201, template_response.text
    template_payload = template_response.json()
    assert template_payload["code"] == "summary"
    assert template_payload["template_format"] == "docx_text_v1"

    templates_list = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/document-templates",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert templates_list.status_code == 200, templates_list.text
    assert [item["id"] for item in templates_list.json()["items"]] == [template_payload["id"]]

    generate_response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/generated-documents",
        headers=_actor_headers(context["card_admin"].id),
        json={"template_id": template_payload["id"], "title": "Сводка карточки"},
    )
    assert generate_response.status_code == 201, generate_response.text
    generated_payload = generate_response.json()
    assert generated_payload["card_id"] == str(context["card"].id)
    assert generated_payload["template_id"] == template_payload["id"]
    assert generated_payload["title"] == "Сводка карточки"
    assert generated_payload["output_filename"] == "Документируемая карточка.docx"
    assert generated_payload["archived_at"] is None

    sibling_read = api_client.get(
        f"/api/v1/generated-documents/{generated_payload['id']}",
        headers=_actor_headers(context["sibling_admin"].id),
    )
    assert sibling_read.status_code == 403, sibling_read.text

    list_response = api_client.get(
        f"/api/v1/cards/{context['card'].id}/generated-documents",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert list_response.status_code == 200, list_response.text
    assert [item["id"] for item in list_response.json()["items"]] == [generated_payload["id"]]

    download_response = api_client.get(
        f"/api/v1/generated-documents/{generated_payload['id']}/content",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert download_response.status_code == 200, download_response.text
    assert download_response.content.startswith(b"PK")
    assert "attachment;" in download_response.headers["content-disposition"]
    with ZipFile(BytesIO(download_response.content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "Документируемая карточка" in rendered_xml
    assert "Значение поля" in rendered_xml

    archive_response = api_client.delete(
        f"/api/v1/generated-documents/{generated_payload['id']}",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert archive_response.status_code == 200, archive_response.text
    assert archive_response.json()["archived_at"] is not None

    active_after_archive = api_client.get(
        f"/api/v1/cards/{context['card'].id}/generated-documents",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert active_after_archive.status_code == 200, active_after_archive.text
    assert active_after_archive.json()["items"] == []

    audit_actions = set(
        db_session.scalars(
            select(AuditEvent.action).where(AuditEvent.object_type == "generated_document")
        ).all()
    )
    assert {"generated_document_generate", "generated_document_archive"} <= audit_actions


def test_card_print_layout_template_versions_and_generates_pdf_docx(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _document_api_context(db_session)
    layout_v1 = _card_print_layout(context["field"].id, heading="Версия один")

    create_response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/card-print-templates",
        headers=_actor_headers(context["schema_admin"].id),
        json={
            "code": "card-print",
            "name": "Печатная карточка",
            "card_template_id": str(context["card"].card_template_id),
            "layout_json": layout_v1,
            "output_filename_template": "{{ card.display_name }}-print.docx",
        },
    )
    assert create_response.status_code == 201, create_response.text
    template_payload = create_response.json()
    assert template_payload["template_format"] == "card_print_layout_v1"
    assert template_payload["card_template_id"] == str(context["card"].card_template_id)
    assert template_payload["current_layout_json"]["items"][0]["text"] == "Версия один"

    list_response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/card-print-templates",
        params={"card_template_id": str(context["card"].card_template_id)},
        headers=_actor_headers(context["card_admin"].id),
    )
    assert list_response.status_code == 200, list_response.text
    assert [item["id"] for item in list_response.json()["items"]] == [template_payload["id"]]

    layout_v2 = _card_print_layout(context["field"].id, heading="Версия два")
    version_response = api_client.post(
        f"/api/v1/card-print-templates/{template_payload['id']}/versions",
        headers=_actor_headers(context["schema_admin"].id),
        json={"layout_json": layout_v2},
    )
    assert version_response.status_code == 201, version_response.text
    version_payload = version_response.json()
    assert version_payload["version_number"] == 2
    assert version_payload["template_format"] == "card_print_layout_v1"
    assert version_payload["layout_json"]["items"][0]["text"] == "Версия два"

    docx_response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/generated-documents",
        headers=_actor_headers(context["card_admin"].id),
        json={"template_id": template_payload["id"], "title": "Печатная форма DOCX"},
    )
    assert docx_response.status_code == 201, docx_response.text
    docx_payload = docx_response.json()
    assert docx_payload["template_version_id"] == version_payload["id"]
    assert docx_payload["content_type"] == DOCX_CONTENT_TYPE
    assert docx_payload["output_filename"].endswith("-print.docx")

    docx_download = api_client.get(
        f"/api/v1/generated-documents/{docx_payload['id']}/content",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert docx_download.status_code == 200, docx_download.text
    with ZipFile(BytesIO(docx_download.content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "Версия два" in rendered_xml
    assert "Значение поля" in rendered_xml

    pdf_response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/generated-documents/pdf",
        headers=_actor_headers(context["card_admin"].id),
        json={"template_id": template_payload["id"], "title": "Печатная форма PDF"},
    )
    assert pdf_response.status_code == 201, pdf_response.text
    pdf_payload = pdf_response.json()
    assert pdf_payload["content_type"] == "application/pdf"
    pdf_download = api_client.get(
        f"/api/v1/generated-documents/{pdf_payload['id']}/content",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert pdf_download.status_code == 200, pdf_download.text
    pdf_text = _extract_pdf_text(pdf_download.content)
    assert "Версия два" in pdf_text
    assert "Значение поля" in pdf_text

    blank_docx_response = api_client.get(
        f"/api/v1/card-print-templates/{template_payload['id']}/blank-docx",
        headers=_actor_headers(context["schema_admin"].id),
    )
    assert blank_docx_response.status_code == 200, blank_docx_response.text
    assert blank_docx_response.headers["content-type"] == DOCX_CONTENT_TYPE
    assert blank_docx_response.headers["x-document-filename"].endswith(".docx")
    with ZipFile(BytesIO(blank_docx_response.content)) as docx:
        blank_xml = docx.read("word/document.xml").decode("utf-8")
    assert "Версия два" in blank_xml
    assert "Название:" in blank_xml
    assert "Значение поля" not in blank_xml

    blank_pdf_response = api_client.get(
        f"/api/v1/card-print-templates/{template_payload['id']}/blank-pdf",
        headers=_actor_headers(context["schema_admin"].id),
    )
    assert blank_pdf_response.status_code == 200, blank_pdf_response.text
    assert blank_pdf_response.headers["content-type"] == "application/pdf"
    assert blank_pdf_response.headers["x-document-filename"].endswith(".pdf")
    blank_pdf_text = _extract_pdf_text(blank_pdf_response.content)
    assert "Версия два" in blank_pdf_text
    assert "Название:" in blank_pdf_text
    assert "Значение поля" not in blank_pdf_text

    invalid_response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/card-print-templates",
        headers=_actor_headers(context["schema_admin"].id),
        json={
            "code": "bad-card-print",
            "name": "Неверная печатная карточка",
            "card_template_id": str(context["card"].card_template_id),
            "layout_json": _card_print_layout(UUID("00000000-0000-0000-0000-000000000001")),
        },
    )
    assert invalid_response.status_code == 422, invalid_response.text


def test_binary_docx_template_upload_versions_and_generates_latest_version(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _document_api_context(db_session)

    upload_response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/document-templates/upload",
        headers=_actor_headers(context["schema_admin"].id),
        data={
            "code": "binary-summary",
            "name": "Бинарный шаблон",
            "output_filename_template": "{{ card.display_name }}.docx",
        },
        files={
            "file": (
                "summary-v1.docx",
                _binary_docx_bytes("V1 {{ card.display_name }} {{ fields.main.title }}"),
                DOCX_CONTENT_TYPE,
            )
        },
    )
    assert upload_response.status_code == 201, upload_response.text
    template_payload = upload_response.json()
    assert template_payload["template_format"] == "docx_binary_v1"
    assert template_payload["current_version_number"] == 1
    assert template_payload["current_version_id"] is not None

    versions_response = api_client.get(
        f"/api/v1/document-templates/{template_payload['id']}/versions",
        headers=_actor_headers(context["schema_admin"].id),
    )
    assert versions_response.status_code == 200, versions_response.text
    versions = versions_response.json()["items"]
    assert [version["version_number"] for version in versions] == [1]
    assert versions[0]["template_format"] == "docx_binary_v1"
    assert versions[0]["original_filename"] == "summary-v1.docx"
    assert "stored_file_id" not in versions[0]
    assert "checksum_sha256" not in versions[0]

    version_two_response = api_client.post(
        f"/api/v1/document-templates/{template_payload['id']}/versions/upload",
        headers=_actor_headers(context["schema_admin"].id),
        files={
            "file": (
                "summary-v2.docx",
                _binary_docx_bytes("V2 {{ card.display_name }} {{ fields.main.title }}"),
                DOCX_CONTENT_TYPE,
            )
        },
    )
    assert version_two_response.status_code == 201, version_two_response.text
    version_two = version_two_response.json()
    assert version_two["version_number"] == 2
    assert version_two["original_filename"] == "summary-v2.docx"

    generate_response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/generated-documents",
        headers=_actor_headers(context["card_admin"].id),
        json={"template_id": template_payload["id"]},
    )
    assert generate_response.status_code == 201, generate_response.text
    generated_payload = generate_response.json()
    assert generated_payload["template_version_id"] == version_two["id"]
    assert generated_payload["content_type"] == DOCX_CONTENT_TYPE

    download_response = api_client.get(
        f"/api/v1/generated-documents/{generated_payload['id']}/content",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert download_response.status_code == 200, download_response.text
    with ZipFile(BytesIO(download_response.content)) as docx:
        rendered_xml = docx.read("word/document.xml").decode("utf-8")
    assert "V2" in rendered_xml
    assert "{{ card.display_name }}" not in rendered_xml
    assert "{{ fields.main.title }}" not in rendered_xml
    assert "V1" not in rendered_xml

    invalid_upload_response = api_client.post(
        f"/api/v1/document-templates/{template_payload['id']}/versions/upload",
        headers=_actor_headers(context["schema_admin"].id),
        files={"file": ("not-docx.txt", b"not a zip", "text/plain")},
    )
    assert invalid_upload_response.status_code == 422, invalid_upload_response.text

    audit_actions = set(
        db_session.scalars(
            select(AuditEvent.action).where(AuditEvent.object_type == "document_template")
        ).all()
    )
    assert {"document_template_create", "document_template_version_create"} <= audit_actions


def test_generated_document_api_supports_pdf_generation_for_text_template(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _document_api_context(db_session)

    template_response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/document-templates",
        headers=_actor_headers(context["schema_admin"].id),
        json={
            "code": "summary-pdf",
            "name": "PDF summary",
            "template_body": "Карточка: {{ card.display_name }}\nПоле: {{ fields.main.title }}",
        },
    )
    assert template_response.status_code == 201, template_response.text
    template_payload = template_response.json()

    pdf_response = api_client.post(
        f"/api/v1/cards/{context['card'].id}/generated-documents/pdf",
        headers=_actor_headers(context["card_admin"].id),
        json={"template_id": template_payload["id"], "title": "PDF summary"},
    )
    assert pdf_response.status_code == 201, pdf_response.text
    pdf_payload = pdf_response.json()
    assert pdf_payload["card_id"] == str(context["card"].id)
    assert pdf_payload["template_id"] == template_payload["id"]
    assert pdf_payload["content_type"] == "application/pdf"
    assert pdf_payload["output_filename"] == f"{context['card'].display_name}.pdf"
    assert pdf_payload["archived_at"] is None

    download_response = api_client.get(
        f"/api/v1/generated-documents/{pdf_payload['id']}/content",
        headers=_actor_headers(context["card_admin"].id),
    )
    assert download_response.status_code == 200, download_response.text
    assert download_response.headers["content-type"] == "application/pdf"
    assert download_response.headers["x-document-filename"].endswith(".pdf")
    assert not download_response.headers["x-document-filename"].endswith(".docx")
    assert download_response.content.startswith(b"%PDF")
    extracted_text = _extract_pdf_text(download_response.content)
    card_read = CardService(db_session).read_card_for_actor(
        actor_user_id=context["card_admin"].id,
        card_id=context["card"].id,
    )
    field_value = card_read.fields["main.title"].value
    assert f"Карточка: {context['card'].display_name}" in extracted_text
    assert f"Поле: {field_value}" in extracted_text

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.object_type == "generated_document",
            AuditEvent.object_id == UUID(pdf_payload["id"]),
            AuditEvent.action == "generated_document_pdf_generate",
        )
    )
    assert audit_event is not None
