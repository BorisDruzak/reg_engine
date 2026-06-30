import csv
import io
import os
from collections.abc import Iterator
from decimal import Decimal
from pathlib import Path
from tempfile import SpooledTemporaryFile
from typing import Any
from uuid import UUID

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import create_engine, func, select, text
from sqlalchemy.engine import Engine, make_url
from sqlalchemy.orm import Session

from app.core.config import get_settings
from app.main import create_app
from app.models import (
    AccessGrant,
    AuditEvent,
    Card,
    CardAttachment,
    DocumentTemplate,
    FieldValue,
    GeneratedDocument,
    Permission,
    Role,
    StoredFile,
    User,
    role_permissions,
)
from app.services.cards import CardService
from app.services.organizations import OrganizationService
from app.services.references import ReferenceListService
from app.services.registry_schema import RegistrySchemaService


def _load_xlsx_rows(content: bytes) -> list[dict[str, str]]:
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(content), read_only=True, data_only=True)
    sheet = workbook.active
    rows = list(sheet.iter_rows(values_only=True))
    assert rows
    headers = [str(value) for value in rows[0]]
    return [
        {
            header: "" if value is None else str(value)
            for header, value in zip(headers, row, strict=False)
        }
        for row in rows[1:]
    ]


def _xlsx_upload(
    rows: list[dict[str, str]],
) -> tuple[str, tuple[str, SpooledTemporaryFile[bytes], str]]:
    from openpyxl import Workbook

    columns = [
        "import_key",
        "card_id",
        "organization_id",
        "display_name",
        "block_code",
        "field_code",
        "value",
    ]
    workbook = Workbook()
    sheet = workbook.active
    sheet.title = "cards"
    sheet.append(columns)
    for row in rows:
        sheet.append([row.get(column, "") for column in columns])

    file = SpooledTemporaryFile[bytes]()
    workbook.save(file)
    file.seek(0)
    return (
        "file",
        (
            "cards.xlsx",
            file,
            "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        ),
    )


def _require_test_database_url() -> str:
    database_url = os.environ.get("TEST_DATABASE_URL")
    if not database_url:
        pytest.skip("TEST_DATABASE_URL is required for disposable PostgreSQL API tests.")

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
def api_client(db_session: Session) -> Iterator[TestClient]:
    from app.api.dependencies import get_db_session
    from app.core.config import get_settings

    previous_allow_dev_actor = os.environ.get("ALLOW_DEV_ACTOR_HEADER")
    os.environ["ALLOW_DEV_ACTOR_HEADER"] = "true"
    get_settings.cache_clear()
    app = create_app()

    def override_session() -> Iterator[Session]:
        yield db_session

    app.dependency_overrides[get_db_session] = override_session
    try:
        with TestClient(app) as client:
            yield client
    finally:
        if previous_allow_dev_actor is None:
            os.environ.pop("ALLOW_DEV_ACTOR_HEADER", None)
        else:
            os.environ["ALLOW_DEV_ACTOR_HEADER"] = previous_allow_dev_actor
        get_settings.cache_clear()


def _actor_headers(user_id: UUID) -> dict[str, str]:
    return {"X-Actor-User-Id": str(user_id)}


def _create_user(
    session: Session,
    email: str,
    *,
    is_superuser: bool = False,
) -> User:
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


def _phase_3_export_context(db_session: Session) -> dict[str, Any]:
    system_admin = _create_user(db_session, "phase3-export-system@example.test", is_superuser=True)
    org_admin = _create_user(db_session, "phase3-export-org-admin@example.test")
    sibling_admin = _create_user(db_session, "phase3-export-sibling-admin@example.test")
    card_role = _create_role_with_permissions(
        db_session,
        "phase3_export_card_admin",
        ["cards.manage"],
    )

    organization_service = OrganizationService(db_session)
    root = organization_service.create_root_for_actor(
        actor_user_id=system_admin.id,
        code="phase3-export-root",
        name="Phase 3 Export Root",
    )
    child = organization_service.create_child(
        parent_id=root.id,
        code="phase3-export-child",
        name="Phase 3 Export Child",
        created_by=system_admin.id,
    )
    sibling = organization_service.create_child(
        parent_id=root.id,
        code="phase3-export-sibling",
        name="Phase 3 Export Sibling",
        created_by=system_admin.id,
    )

    schema_service = RegistrySchemaService(db_session)
    registry = schema_service.create_registry_for_actor(
        actor_user_id=system_admin.id,
        code="phase3-export-registry",
        name="Phase 3 Export Registry",
    )
    main_block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="main",
        title="Main",
    )
    details_block = schema_service.create_block_for_actor(
        actor_user_id=system_admin.id,
        registry_id=registry.id,
        code="details",
        title="Details",
    )
    main_status = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=main_block.id,
        code="status",
        label="Status",
        field_type="text",
    )
    details_status = schema_service.create_field_for_actor(
        actor_user_id=system_admin.id,
        block_id=details_block.id,
        code="status",
        label="Status",
        field_type="text",
    )

    _grant_access(
        db_session,
        user_id=org_admin.id,
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

    card_service = CardService(db_session)
    child_card = card_service.create_card_for_actor(
        actor_user_id=org_admin.id,
        registry_id=registry.id,
        organization_id=child.id,
        display_name="Visible export card",
    )
    sibling_card = card_service.create_card_for_actor(
        actor_user_id=sibling_admin.id,
        registry_id=registry.id,
        organization_id=sibling.id,
        display_name="Hidden sibling card",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=org_admin.id,
        card_id=child_card.id,
        field_id=main_status.id,
        value="ready",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=org_admin.id,
        card_id=child_card.id,
        field_id=details_status.id,
        value="secondary",
    )
    card_service.set_field_value_for_actor(
        actor_user_id=sibling_admin.id,
        card_id=sibling_card.id,
        field_id=main_status.id,
        value="hidden",
    )

    stored_attachment = StoredFile(
        storage_key="phase3/export/attachment.txt",
        original_filename="attachment.txt",
        content_type="text/plain",
        content_length_bytes=12,
        checksum_sha256="a" * 64,
        created_by=system_admin.id,
    )
    stored_document = StoredFile(
        storage_key="phase3/export/generated.docx",
        original_filename="generated.docx",
        content_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
        content_length_bytes=128,
        checksum_sha256="b" * 64,
        created_by=system_admin.id,
    )
    db_session.add_all([stored_attachment, stored_document])
    db_session.flush()
    attachment = CardAttachment(
        card_id=child_card.id,
        stored_file_id=stored_attachment.id,
        title="Attachment metadata",
        created_by=system_admin.id,
    )
    template = DocumentTemplate(
        registry_id=registry.id,
        code="phase3_export_template",
        name="Phase 3 Export Template",
        template_body="{{ card.display_name }}",
        created_by=system_admin.id,
    )
    db_session.add_all([attachment, template])
    db_session.flush()
    generated_document = GeneratedDocument(
        card_id=child_card.id,
        template_id=template.id,
        stored_file_id=stored_document.id,
        title="Generated metadata",
        output_filename="generated.docx",
        content_type=stored_document.content_type,
        generated_by=system_admin.id,
    )
    db_session.add(generated_document)
    db_session.flush()

    return {
        "system_admin": system_admin,
        "org_admin": org_admin,
        "sibling_admin": sibling_admin,
        "registry": registry,
        "child_card": child_card,
        "sibling_card": sibling_card,
    }


def test_card_json_export_is_schema_driven_scoped_and_metadata_only(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_export_context(db_session)

    response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/exports/cards?format=json",
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("application/json")
    payload = response.json()
    assert payload["format_version"] == "card_export_v1"
    assert payload["registry_id"] == str(context["registry"].id)
    assert [card["id"] for card in payload["cards"]] == [str(context["child_card"].id)]
    exported_card = payload["cards"][0]
    assert exported_card["display_name"] == "Visible export card"
    assert exported_card["blocks"]["main"]["instances"][0]["fields"]["status"]["value"] == "ready"
    assert (
        exported_card["blocks"]["details"]["instances"][0]["fields"]["status"]["value"]
        == "secondary"
    )
    assert exported_card["attachments"] == [
        {
            "id": exported_card["attachments"][0]["id"],
            "title": "Attachment metadata",
            "original_filename": "attachment.txt",
            "content_type": "text/plain",
            "content_length_bytes": 12,
            "archived_at": None,
        }
    ]
    assert exported_card["generated_documents"] == [
        {
            "id": exported_card["generated_documents"][0]["id"],
            "title": "Generated metadata",
            "output_filename": "generated.docx",
            "content_type": (
                "application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            ),
            "render_status": "generated",
            "archived_at": None,
        }
    ]
    serialized_payload = response.text
    assert "Hidden sibling card" not in serialized_payload
    assert "storage_key" not in serialized_payload
    assert "checksum_sha256" not in serialized_payload
    assert "stored_file_id" not in serialized_payload
    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "export",
            AuditEvent.object_type == "registry",
            AuditEvent.object_id == context["registry"].id,
        )
    )
    assert audit_event is not None
    assert audit_event.new_data_json == {
        "export_type": "cards",
        "format": "json",
        "card_count": 1,
    }


def test_card_csv_export_uses_block_field_rows_for_duplicate_field_codes(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_export_context(db_session)

    response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/exports/cards?format=csv",
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith("text/csv")
    rows = list(csv.DictReader(io.StringIO(response.text)))
    assert {
        (
            row["card_id"],
            row["block_code"],
            row["block_instance_ordinal"],
            row["field_code"],
            row["field_type"],
            row["value"],
        )
        for row in rows
    } == {
        (str(context["child_card"].id), "main", "0", "status", "text", "ready"),
        (str(context["child_card"].id), "details", "0", "status", "text", "secondary"),
    }
    assert "Hidden sibling card" not in response.text
    assert "storage_key" not in response.text
    assert "checksum_sha256" not in response.text
    assert "stored_file_id" not in response.text


def test_card_xlsx_export_uses_same_scoped_row_contract_as_csv(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_export_context(db_session)

    response = api_client.get(
        f"/api/v1/registries/{context['registry'].id}/exports/cards?format=xlsx",
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    assert response.headers["content-type"].startswith(
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    )
    assert response.headers["content-disposition"] == (
        'attachment; filename="registry-cards-export.xlsx"'
    )
    rows = _load_xlsx_rows(response.content)
    assert {
        (
            row["card_id"],
            row["block_code"],
            row["block_instance_ordinal"],
            row["field_code"],
            row["field_type"],
            row["value"],
        )
        for row in rows
    } == {
        (str(context["child_card"].id), "main", "0", "status", "text", "ready"),
        (str(context["child_card"].id), "details", "0", "status", "text", "secondary"),
    }
    serialized_rows = repr(rows)
    assert "Hidden sibling card" not in serialized_rows
    assert "storage_key" not in serialized_rows
    assert "checksum_sha256" not in serialized_rows
    assert "stored_file_id" not in serialized_rows

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "export",
            AuditEvent.object_type == "registry",
            AuditEvent.object_id == context["registry"].id,
        )
    )
    assert audit_event is not None
    assert audit_event.new_data_json == {
        "export_type": "cards",
        "format": "xlsx",
        "card_count": 1,
    }


def _phase_3_import_context(db_session: Session) -> dict[str, Any]:
    context = _phase_3_export_context(db_session)
    schema_service = RegistrySchemaService(db_session)
    reference_service = ReferenceListService(db_session)

    metrics_block = schema_service.create_block_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        code="metrics",
        title="Metrics",
    )
    priority_field = schema_service.create_field_for_actor(
        actor_user_id=context["system_admin"].id,
        block_id=metrics_block.id,
        code="priority",
        label="Priority",
        field_type="number",
    )
    states = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        code="phase3_import_states",
        name="Phase 3 Import States",
    )
    ready = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=states.id,
        code="ready",
        label="Ready",
    )
    other_states = reference_service.create_reference_list_for_actor(
        actor_user_id=context["system_admin"].id,
        registry_id=context["registry"].id,
        code="phase3_import_other_states",
        name="Phase 3 Import Other States",
    )
    invalid_state = reference_service.create_reference_item_for_actor(
        actor_user_id=context["system_admin"].id,
        list_id=other_states.id,
        code="invalid",
        label="Invalid",
    )
    state_field = schema_service.create_field_for_actor(
        actor_user_id=context["system_admin"].id,
        block_id=metrics_block.id,
        code="state",
        label="State",
        field_type="select",
        options_source_type="reference_list",
        options_source_id=states.id,
    )
    context.update(
        {
            "priority_field": priority_field,
            "state_field": state_field,
            "ready_item": ready,
            "invalid_state_item": invalid_state,
        }
    )
    return context


def test_card_csv_import_preview_validates_mapping_scope_values_and_does_not_mutate(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_import_context(db_session)
    card_count_before = db_session.scalar(select(func.count()).select_from(Card))
    value_count_before = db_session.scalar(select(func.count()).select_from(FieldValue))
    audit_count_before = db_session.scalar(select(func.count()).select_from(AuditEvent))
    csv_content = "\n".join(
        [
            "card_id,organization_id,display_name,block_code,field_code,value",
            (f"{context['child_card'].id},,,main,status,valid update preview"),
            (f",{context['child_card'].organization_id},Preview create,metrics,priority,42.5"),
            (f"{context['child_card'].id},,,metrics,state,{context['ready_item'].id}"),
            (f"{context['child_card'].id},,,metrics,priority,not-a-number"),
            (f"{context['sibling_card'].id},,,main,status,forbidden sibling update"),
            (
                f",{context['sibling_card'].organization_id},Forbidden create,"
                "main,status,forbidden create"
            ),
            (f"{context['child_card'].id},,,metrics,state,{context['invalid_state_item'].id}"),
            f"{context['child_card'].id},,,unknown,status,unknown field",
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/preview",
        json={"csv_content": csv_content},
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["format_version"] == "card_import_preview_v1"
    assert payload["summary"] == {
        "total_rows": 8,
        "valid_rows": 3,
        "invalid_rows": 5,
        "would_create_rows": 1,
        "would_update_rows": 2,
    }
    rows_by_number = {row["row_number"]: row for row in payload["rows"]}
    assert rows_by_number[2]["status"] == "valid"
    assert rows_by_number[2]["action"] == "update"
    assert rows_by_number[2]["field_path"] == "main.status"
    assert rows_by_number[3]["status"] == "valid"
    assert rows_by_number[3]["action"] == "create"
    assert rows_by_number[3]["parsed_value"] == "42.5"
    assert rows_by_number[4]["status"] == "valid"
    assert rows_by_number[4]["field_path"] == "metrics.state"
    assert rows_by_number[5]["status"] == "invalid"
    assert rows_by_number[5]["errors"] == ["Number fields require a numeric value."]
    assert rows_by_number[6]["status"] == "invalid"
    assert rows_by_number[7]["status"] == "invalid"
    assert rows_by_number[8]["status"] == "invalid"
    assert rows_by_number[8]["errors"] == ["Reference item does not belong to the configured list."]
    assert rows_by_number[9]["status"] == "invalid"
    assert rows_by_number[9]["errors"] == ["Import field mapping was not found."]
    assert db_session.scalar(select(func.count()).select_from(Card)) == card_count_before
    assert db_session.scalar(select(func.count()).select_from(FieldValue)) == value_count_before
    assert db_session.scalar(select(func.count()).select_from(AuditEvent)) == audit_count_before


def test_card_csv_import_preview_rejects_missing_required_columns(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_import_context(db_session)

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/preview",
        json={"csv_content": "card_id,block_code,value\n,,x"},
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 400, response.text
    assert response.json()["detail"] == (
        "CSV import preview requires columns: block_code, card_id, display_name, "
        "field_code, organization_id, value."
    )


def test_card_csv_import_preview_rejects_oversized_payload(
    api_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_3_import_context(db_session)
    monkeypatch.setenv("REG_ENGINE_MAX_IMPORT_BYTES", "64")
    get_settings.cache_clear()
    csv_content = "\n".join(
        [
            "card_id,organization_id,display_name,block_code,field_code,value",
            f"{context['child_card'].id},,,main,status,oversized payload",
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/preview",
        json={"csv_content": csv_content},
        headers=_actor_headers(context["org_admin"].id),
    )

    get_settings.cache_clear()
    assert response.status_code == 413, response.text
    assert response.json()["detail"] == "Import payload exceeds REG_ENGINE_MAX_IMPORT_BYTES=64."


def test_card_csv_import_preview_rejects_rows_over_limit(
    api_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_3_import_context(db_session)
    monkeypatch.setenv("REG_ENGINE_MAX_IMPORT_ROWS", "1")
    get_settings.cache_clear()
    csv_content = "\n".join(
        [
            "card_id,organization_id,display_name,block_code,field_code,value",
            f"{context['child_card'].id},,,main,status,first",
            f"{context['child_card'].id},,,main,status,second",
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/preview",
        json={"csv_content": csv_content},
        headers=_actor_headers(context["org_admin"].id),
    )

    get_settings.cache_clear()
    assert response.status_code == 400, response.text
    assert response.json()["detail"] == "Card import row limit exceeded; maximum 1 rows."


def test_card_xlsx_import_preview_rejects_oversized_file(
    api_client: TestClient,
    db_session: Session,
    monkeypatch: pytest.MonkeyPatch,
) -> None:
    context = _phase_3_import_context(db_session)
    monkeypatch.setenv("REG_ENGINE_MAX_IMPORT_BYTES", "64")
    get_settings.cache_clear()
    file_field = _xlsx_upload(
        [
            {
                "card_id": str(context["child_card"].id),
                "block_code": "main",
                "field_code": "status",
                "value": "oversized",
            }
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/preview",
        files=[file_field],
        headers=_actor_headers(context["org_admin"].id),
    )

    get_settings.cache_clear()
    assert response.status_code == 413, response.text
    assert response.json()["detail"] == "Import file exceeds REG_ENGINE_MAX_IMPORT_BYTES=64."


def test_card_xlsx_import_preview_reuses_csv_contract_and_does_not_mutate(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_import_context(db_session)
    card_count_before = db_session.scalar(select(func.count()).select_from(Card))
    value_count_before = db_session.scalar(select(func.count()).select_from(FieldValue))
    audit_count_before = db_session.scalar(select(func.count()).select_from(AuditEvent))
    file_field = _xlsx_upload(
        [
            {
                "card_id": str(context["child_card"].id),
                "block_code": "main",
                "field_code": "status",
                "value": "valid xlsx update preview",
            },
            {
                "organization_id": str(context["child_card"].organization_id),
                "display_name": "XLSX preview create",
                "block_code": "metrics",
                "field_code": "priority",
                "value": "42.5",
            },
            {
                "card_id": str(context["child_card"].id),
                "block_code": "metrics",
                "field_code": "priority",
                "value": "not-a-number",
            },
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/preview",
        files=[file_field],
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["format_version"] == "card_import_preview_v1"
    assert payload["summary"] == {
        "total_rows": 3,
        "valid_rows": 2,
        "invalid_rows": 1,
        "would_create_rows": 1,
        "would_update_rows": 1,
    }
    rows_by_number = {row["row_number"]: row for row in payload["rows"]}
    assert rows_by_number[2]["status"] == "valid"
    assert rows_by_number[2]["field_path"] == "main.status"
    assert rows_by_number[3]["status"] == "valid"
    assert rows_by_number[3]["parsed_value"] == "42.5"
    assert rows_by_number[4]["status"] == "invalid"
    assert rows_by_number[4]["errors"] == ["Number fields require a numeric value."]
    assert db_session.scalar(select(func.count()).select_from(Card)) == card_count_before
    assert db_session.scalar(select(func.count()).select_from(FieldValue)) == value_count_before
    assert db_session.scalar(select(func.count()).select_from(AuditEvent)) == audit_count_before


def test_card_csv_import_commit_creates_updates_and_records_audit(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_import_context(db_session)
    csv_content = "\n".join(
        [
            "import_key,card_id,organization_id,display_name,block_code,field_code,value",
            f",{context['child_card'].id},,,main,status,committed update",
            (
                f"new-1,,{context['child_card'].organization_id},Committed import card,"
                "metrics,priority,10.5"
            ),
            (
                f"new-1,,{context['child_card'].organization_id},Committed import card,"
                "main,status,created status"
            ),
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/commit",
        json={"csv_content": csv_content},
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["format_version"] == "card_import_commit_v1"
    assert payload["summary"] == {
        "total_rows": 3,
        "committed_rows": 3,
        "created_cards": 1,
        "updated_cards": 1,
        "field_values_written": 3,
    }

    card_service = CardService(db_session)
    updated_card = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=context["child_card"].id,
    )
    assert updated_card.blocks["main"].instances[0].fields["status"].value == "committed update"

    created_card = db_session.scalar(
        select(Card).where(
            Card.registry_id == context["registry"].id,
            Card.display_name == "Committed import card",
        )
    )
    assert created_card is not None
    created_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=created_card.id,
    )
    assert created_read.blocks["main"].instances[0].fields["status"].value == "created status"
    assert created_read.blocks["metrics"].instances[0].fields["priority"].value == Decimal("10.5")
    assert payload["cards"] == [
        {"card_id": str(context["child_card"].id), "action": "update", "import_key": None},
        {"card_id": str(created_card.id), "action": "create", "import_key": "new-1"},
    ]

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "import_commit",
            AuditEvent.object_type == "registry",
            AuditEvent.object_id == context["registry"].id,
        )
    )
    assert audit_event is not None
    assert audit_event.new_data_json == {
        "import_type": "cards",
        "format": "csv",
        "total_rows": 3,
        "committed_rows": 3,
        "created_cards": 1,
        "updated_cards": 1,
        "field_values_written": 3,
    }


def test_card_xlsx_import_commit_creates_updates_and_records_xlsx_audit(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_import_context(db_session)
    file_field = _xlsx_upload(
        [
            {
                "card_id": str(context["child_card"].id),
                "block_code": "main",
                "field_code": "status",
                "value": "committed xlsx update",
            },
            {
                "import_key": "xlsx-new-1",
                "organization_id": str(context["child_card"].organization_id),
                "display_name": "Committed XLSX import card",
                "block_code": "metrics",
                "field_code": "priority",
                "value": "10.5",
            },
            {
                "import_key": "xlsx-new-1",
                "organization_id": str(context["child_card"].organization_id),
                "display_name": "Committed XLSX import card",
                "block_code": "main",
                "field_code": "status",
                "value": "created xlsx status",
            },
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/commit",
        files=[file_field],
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 200, response.text
    payload = response.json()
    assert payload["format_version"] == "card_import_commit_v1"
    assert payload["summary"] == {
        "total_rows": 3,
        "committed_rows": 3,
        "created_cards": 1,
        "updated_cards": 1,
        "field_values_written": 3,
    }

    card_service = CardService(db_session)
    updated_card = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=context["child_card"].id,
    )
    assert updated_card.blocks["main"].instances[0].fields["status"].value == (
        "committed xlsx update"
    )

    created_card = db_session.scalar(
        select(Card).where(
            Card.registry_id == context["registry"].id,
            Card.display_name == "Committed XLSX import card",
        )
    )
    assert created_card is not None
    created_read = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=created_card.id,
    )
    assert created_read.blocks["main"].instances[0].fields["status"].value == (
        "created xlsx status"
    )
    assert created_read.blocks["metrics"].instances[0].fields["priority"].value == Decimal("10.5")
    assert payload["cards"] == [
        {"card_id": str(context["child_card"].id), "action": "update", "import_key": None},
        {"card_id": str(created_card.id), "action": "create", "import_key": "xlsx-new-1"},
    ]

    audit_event = db_session.scalar(
        select(AuditEvent).where(
            AuditEvent.action == "import_commit",
            AuditEvent.object_type == "registry",
            AuditEvent.object_id == context["registry"].id,
        )
    )
    assert audit_event is not None
    assert audit_event.new_data_json == {
        "import_type": "cards",
        "format": "xlsx",
        "total_rows": 3,
        "committed_rows": 3,
        "created_cards": 1,
        "updated_cards": 1,
        "field_values_written": 3,
    }


def test_card_csv_import_commit_rejects_invalid_batch_without_partial_writes(
    api_client: TestClient,
    db_session: Session,
) -> None:
    context = _phase_3_import_context(db_session)
    card_count_before = db_session.scalar(select(func.count()).select_from(Card))
    field_value_count_before = db_session.scalar(select(func.count()).select_from(FieldValue))
    audit_count_before = db_session.scalar(
        select(func.count()).select_from(AuditEvent).where(AuditEvent.action == "import_commit")
    )
    csv_content = "\n".join(
        [
            "import_key,card_id,organization_id,display_name,block_code,field_code,value",
            f",{context['child_card'].id},,,main,status,should not persist",
            (
                f"new-1,,{context['child_card'].organization_id},Rejected import card,"
                "metrics,priority,not-a-number"
            ),
        ]
    )

    response = api_client.post(
        f"/api/v1/registries/{context['registry'].id}/imports/cards/commit",
        json={"csv_content": csv_content},
        headers=_actor_headers(context["org_admin"].id),
    )

    assert response.status_code == 400, response.text
    detail = response.json()["detail"]
    assert detail["format_version"] == "card_import_preview_v1"
    assert detail["summary"]["invalid_rows"] == 1
    assert detail["rows"][1]["errors"] == ["Number fields require a numeric value."]

    card_service = CardService(db_session)
    updated_card = card_service.read_card_for_actor(
        actor_user_id=context["org_admin"].id,
        card_id=context["child_card"].id,
    )
    assert updated_card.blocks["main"].instances[0].fields["status"].value == "ready"
    assert db_session.scalar(select(func.count()).select_from(Card)) == card_count_before
    assert (
        db_session.scalar(select(func.count()).select_from(FieldValue)) == field_value_count_before
    )
    assert (
        db_session.scalar(
            select(func.count()).select_from(AuditEvent).where(AuditEvent.action == "import_commit")
        )
        == audit_count_before
    )
