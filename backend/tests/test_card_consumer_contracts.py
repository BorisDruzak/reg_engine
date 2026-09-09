import json
from types import SimpleNamespace
from unittest.mock import MagicMock
from uuid import uuid4

import pytest

from app.mcp.api_client import RegEngineApiClient
from app.mcp.tools import call_tool
from app.schemas.public_links import PublicLinkEditRequest
from app.services.attachments import AttachmentService
from app.services.cards import CardDismissalError
from app.services.documents import DocumentService
from app.services.permissions import PermissionDeniedError
from app.services.public_links import PublicLinkService
from tests.test_mcp_phase_5 import RecordingTransport
from tests.test_registry_card_services import card_event_context as event_context  # noqa: F401


def test_public_http_basis_reaches_real_event_transaction(event_context, monkeypatch):  # noqa: F811
    from fastapi import HTTPException
    from sqlalchemy import select

    from app.api.v1.endpoints import public_links as endpoint
    from app.models import CardEvent

    ctx = event_context
    link = SimpleNamespace(id=uuid4(), card_id=ctx.card.id, created_by=ctx.actor_id, used_count=0)
    monkeypatch.setattr(PublicLinkService, "validate_public_field_edit", lambda *a, **kw: link)
    monkeypatch.setattr(PublicLinkService, "_editable_public_link", lambda *a, **kw: link)
    monkeypatch.setattr(PublicLinkService, "_require_field_edit_usage_available", lambda *a: None)
    monkeypatch.setattr(
        PublicLinkService, "_resolve_public_edit_field", lambda *a, **kw: (ctx.card, ctx.fields[0])
    )
    monkeypatch.setattr(endpoint, "coerce_api_field_value", lambda session, field_id, value: value)
    monkeypatch.setattr(endpoint, "field_value_to_read", lambda session, value: value)
    payload = dict(
        raw_token="token",
        actor_name="Иванов Иван Иванович",
        field_id=ctx.fields[0].id,
        value="После",
    )
    with pytest.raises(HTTPException) as error:
        endpoint.edit_card_field_with_public_link(PublicLinkEditRequest(**payload), ctx.session)
    assert error.value.status_code == 400
    assert "Основание" in error.value.detail
    assert ctx.values[0].value_text == "До"
    assert link.used_count == 0
    endpoint.edit_card_field_with_public_link(
        PublicLinkEditRequest(**payload, basis_text="Приказ 17", occurred_on="2026-09-09"),
        ctx.session,
    )
    assert ctx.values[0].value_text == "После"
    event = ctx.session.scalars(select(CardEvent)).one()
    assert event.basis_text == "Приказ 17"
    assert link.used_count == 1


@pytest.mark.parametrize(
    ("tool", "arguments"),
    [
        ("update_card", {"org_unit_id": None}),
        ("set_card_field_value", {"field_id": "field", "value": "Новое"}),
        ("set_card_values", {"values": [{"field_id": "field", "value": "Новое"}]}),
        ("create_card_block_instance", {"block_id": "block"}),
        ("archive_card_block_instance", {"block_instance_id": "instance", "confirm_archive": True}),
        ("archive_card", {"confirm_archive": True}),
        ("transfer_card", {"target_organization_id": "org", "confirm_transfer": True}),
    ],
)
def test_mcp_business_writes_forward_basis(tool, arguments):
    transport = RecordingTransport({"id": "card"})
    client = RegEngineApiClient(base_url="http://api.local", token="token", transport=transport)
    result = call_tool(
        f"reg_engine_{tool}",
        {"card_id": "card", **arguments, "basis_text": "Приказ 17", "occurred_on": "2026-09-09"},
        client=client,
    )
    assert result["isError"] is False
    body = json.loads(transport.requests[0]["body"])
    assert body["basis_text"] == "Приказ 17"
    assert body["occurred_on"] == "2026-09-09"
    if tool == "update_card":
        assert "org_unit_id" in body and body["org_unit_id"] is None
    assert transport.requests[0]["headers"]["X-Reg-Engine-Source"] == "mcp"


def test_mcp_create_card_has_no_display_name_requirement():
    transport = RecordingTransport({"id": "card"})
    client = RegEngineApiClient(base_url="http://api.local", token="token", transport=transport)
    result = call_tool(
        "reg_engine_create_card",
        {"registry_id": "registry", "organization_id": "org"},
        client=client,
    )
    assert result["isError"] is False
    assert "display_name" not in json.loads(transport.requests[0]["body"])


def test_public_basis_request_accepts_change_context():
    request = PublicLinkEditRequest(
        raw_token="token",
        actor_name="Иванов Иван Иванович",
        field_id=uuid4(),
        value="Новое",
        basis_text="Приказ 17",
        occurred_on="2026-09-09",
    )
    assert request.basis_text == "Приказ 17"


def test_registry_rejects_obsolete_card_title_label():
    from pydantic import ValidationError

    from app.schemas.registries import RegistryCreate, RegistryUpdate

    for schema, data in [
        (RegistryCreate, {"code": "registry", "name": "Реестр"}),
        (RegistryUpdate, {}),
    ]:
        with pytest.raises(ValidationError):
            schema(**data, card_title_label="Заголовок")


def test_card_api_rejects_obsolete_display_name():
    from pydantic import ValidationError

    from app.schemas.cards import CardCreate, CardUpdate, OrganizationCardCreate

    for schema, data in [
        (CardCreate, {"organization_id": uuid4()}),
        (CardUpdate, {}),
        (OrganizationCardCreate, {}),
    ]:
        with pytest.raises(ValidationError):
            schema(**data, display_name="Устаревшее название")


def test_public_preview_exposes_first_activation_for_basis_flow():
    from datetime import UTC, datetime

    from app.api.v1.endpoints.public_links import _public_link_preview_to_read
    from app.services.public_links import PublicLinkPreview

    activated_at = datetime(2026, 9, 1, tzinfo=UTC)
    preview = PublicLinkPreview(
        card_id=uuid4(),
        display_value="Иванов Иван Иванович",
        organization_name="Организация",
        card_template_name="Сведения",
        lifecycle_status="draft",
        expires_at=None,
        can_edit=True,
        form_layout={"columns": 12, "sections": []},
        activated_at=activated_at,
    )
    payload = _public_link_preview_to_read(preview)
    assert payload.activated_at == activated_at
    assert "display_name" not in payload.model_dump()


def test_initial_xlsx_import_applies_all_values_before_activation(event_context, monkeypatch):  # noqa: F811
    from sqlalchemy import select

    from app.models import CardEvent
    from app.services.cards import CardService
    from app.services.import_export import (
        TabularCardExchangeService,
        TabularWorkbookConfiguration,
        TabularWorkbookField,
    )

    ctx = event_context
    configuration = TabularWorkbookConfiguration(
        registry_id=ctx.card.registry_id,
        template=SimpleNamespace(id=ctx.card.card_template_id),
        fields=tuple(
            TabularWorkbookField(field=field, block=ctx.block, header=field.label)
            for field in ctx.fields
        ),
        organizations=(),
        include_organization_column=False,
        fixed_organization_id=ctx.card.organization_id,
        organization_labels={},
        reference_labels={},
        unit_organization_ids={},
    )
    row = {
        "row_number": 2,
        "organization_id": ctx.card.organization_id,
        "organization_label": "Организация",
        "values": {field.id: "После" for field in ctx.fields},
        "errors": [],
    }
    service = TabularCardExchangeService(ctx.session)
    monkeypatch.setattr(
        service, "_read_import_workbook", lambda **kwargs: (configuration, [row], [])
    )
    monkeypatch.setattr(service, "_validate_import_rows", lambda **kwargs: None)
    monkeypatch.setattr(CardService, "create_card_for_actor", lambda *args, **kwargs: ctx.card)
    service.commit_import_xlsx_for_actor(
        actor_user_id=ctx.actor_id, registry_id=ctx.card.registry_id, xlsx_content=b"handled above"
    )
    assert [value.value_text for value in ctx.values] == ["После", "После"]
    assert ctx.card.lifecycle_status == "active"
    assert ctx.card.activated_at is not None
    assert ctx.session.scalars(select(CardEvent)).all() == []


def test_initial_public_creation_link_save_is_basis_free(event_context, monkeypatch):  # noqa: F811
    from app.models import CardCreationLinkCard, CardPublicLink
    from app.services.card_creation_links import CardCreationLinkService
    from app.services.cards import CardService

    ctx = event_context
    CardPublicLink.__table__.create(ctx.session.get_bind())
    CardCreationLinkCard.__table__.create(ctx.session.get_bind())
    service = CardCreationLinkService(ctx.session)
    monkeypatch.setattr(CardService, "create_card", lambda *args, **kwargs: ctx.card)
    monkeypatch.setattr(
        service, "_token_cipher", lambda: SimpleNamespace(encrypt=lambda value: "ciphertext")
    )
    service._create_public_card(
        creation_link=SimpleNamespace(
            id=uuid4(), registry_id=ctx.card.registry_id, created_by=ctx.actor_id
        ),
        template=SimpleNamespace(id=ctx.card.card_template_id),
        organization=SimpleNamespace(id=ctx.card.organization_id),
        initial_field=(ctx.fields[0], "После", ctx.instance.id),
        actor_display_name="Иванов Иван Иванович",
    )
    assert ctx.values[0].value_text == "После"


@pytest.mark.parametrize("consumer", ["attachment", "public_link", "document", "pdf"])
@pytest.mark.parametrize("authorized", [True, False])
def test_dismissed_card_consumers_refuse_writes(consumer, authorized, monkeypatch):
    session = MagicMock()
    card = SimpleNamespace(
        id=uuid4(),
        organization_id=uuid4(),
        registry_id=uuid4(),
        lifecycle_status="dismissed",
        archived_at=None,
    )
    session.get.return_value = card

    def permission(*args, **kwargs):
        if not authorized:
            raise PermissionDeniedError("Denied")

    if consumer == "attachment":
        service = AttachmentService(session, storage=MagicMock())
        monkeypatch.setattr(service, "_require_card_permission", permission)
        monkeypatch.setattr(service, "_create_attachment", lambda **kw: None)

        def operation():
            return service.create_attachment_for_actor(
                actor_user_id=uuid4(),
                card_id=card.id,
                original_filename="test.txt",
                content_type="text/plain",
                content=b"text",
            )
    elif consumer == "public_link":
        service = PublicLinkService(session)
        monkeypatch.setattr(service, "_require_card_permission", permission)

        def operation():
            return service.create_public_link_for_actor(actor_user_id=uuid4(), card_id=card.id)
    else:
        from app.services.cards import CardService

        service = DocumentService(session, storage=MagicMock())
        monkeypatch.setattr(
            service,
            "_get_active_template",
            lambda *args: SimpleNamespace(registry_id=card.registry_id),
        )

        def reached_render(*args):
            pytest.fail("Dismissed card reached document rendering")

        monkeypatch.setattr(service, "_validate_card_print_template_for_card", reached_render)
        monkeypatch.setattr(CardService, "read_card_for_actor", lambda *args, **kwargs: card)
        monkeypatch.setattr(service, "_require_card_manage_permission", permission)
        method = (
            service.generate_document_for_actor
            if consumer == "document"
            else service.generate_pdf_for_actor
        )

        def operation():
            return method(actor_user_id=uuid4(), card_id=card.id, template_id=uuid4())

    with pytest.raises(CardDismissalError if authorized else PermissionDeniedError):
        operation()


@pytest.mark.parametrize(
    "consumer",
    [
        "attachment_archive",
        "document_archive",
        "public_access",
        "public_upload",
        "submit",
        "disable",
        "baseline",
        "changes",
        "approve",
    ],
)
@pytest.mark.parametrize("authorized", [True, False])
def test_terminal_consumers_authorize_before_lifecycle(consumer, authorized, monkeypatch):
    from app.schemas.cards import CardPublicAccessUpdate
    from app.services.card_public_access import CardPublicAccessService

    card = SimpleNamespace(
        id=uuid4(),
        organization_id=uuid4(),
        registry_id=uuid4(),
        lifecycle_status="dismissed",
        archived_at=None,
        public_edit_enabled=True,
    )
    link = SimpleNamespace(
        id=uuid4(),
        card_id=card.id,
        created_by=uuid4(),
        max_attachment_uploads=None,
        status="active",
        can_edit=True,
    )
    session = MagicMock()
    session.get.return_value = card

    def permission(*args, **kwargs):
        if not authorized:
            raise PermissionDeniedError("Denied")

    def resolve_token(*args, **kwargs):
        permission()
        return link

    if consumer in {"attachment_archive", "public_upload"}:
        service = AttachmentService(session, storage=MagicMock())
        monkeypatch.setattr(service, "_require_card_permission", permission)
        monkeypatch.setattr(
            service,
            "_get_attachment",
            lambda *args: SimpleNamespace(card_id=card.id, archived_at=None),
        )
        monkeypatch.setattr(service, "_get_public_attachment_link", resolve_token)
        if consumer == "attachment_archive":

            def operation():
                service.archive_attachment_for_actor(actor_user_id=uuid4(), attachment_id=uuid4())
        else:

            def operation():
                service.create_attachment_from_public_link(
                    actor_public_link_id=link.id,
                    card_id=card.id,
                    original_filename="test.txt",
                    content_type="text/plain",
                    content=b"text",
                    actor_name="Иванов Иван Иванович",
                )
    elif consumer == "document_archive":
        service = DocumentService(session, storage=MagicMock())
        monkeypatch.setattr(service, "_require_card_manage_permission", permission)
        monkeypatch.setattr(
            service,
            "_get_generated_document",
            lambda *args: SimpleNamespace(card_id=card.id, archived_at=None),
        )

        def operation():
            service.archive_generated_document_for_actor(
                actor_user_id=uuid4(), generated_document_id=uuid4()
            )
    elif consumer == "public_access":
        service = CardPublicAccessService(session)
        monkeypatch.setattr(service, "_require_manage_permission", permission)

        def operation():
            service.update_for_actor(
                actor_user_id=uuid4(),
                card_id=card.id,
                payload=CardPublicAccessUpdate(public_edit_enabled=True),
            )
    else:
        service = PublicLinkService(session)
        monkeypatch.setattr(service, "_require_card_permission", permission)
        monkeypatch.setattr(service, "_require_review_permission", permission)
        monkeypatch.setattr(service, "_locked_public_link", lambda *args: link)
        monkeypatch.setattr(service, "_public_link_for_token", resolve_token)
        monkeypatch.setattr(service, "_require_not_expired", lambda *args: None)

        def operation():
            if consumer == "submit":
                service.submit_for_review(raw_token="token", actor_name="Иванов Иван Иванович")
            else:
                method = {
                    "disable": service.disable_public_link_for_actor,
                    "baseline": service.capture_review_baseline,
                    "changes": service.request_changes_for_actor,
                    "approve": service.approve_for_actor,
                }[consumer]
                method(
                    actor_user_id=uuid4(),
                    public_link_id=link.id,
                    **({"comment": "Уточните сведения"} if consumer == "changes" else {}),
                )

    with pytest.raises(CardDismissalError if authorized else PermissionDeniedError):
        operation()


def test_disabled_public_submit_does_not_disclose_card_lifecycle(monkeypatch):
    service = PublicLinkService(MagicMock())
    link = SimpleNamespace(
        card_id=uuid4(),
        status="disabled",
        can_edit=False,
        review_enabled=True,
        baseline_snapshot_json={},
    )
    service.session.get.return_value = SimpleNamespace(lifecycle_status="dismissed")
    monkeypatch.setattr(service, "_public_link_for_token", lambda *a, **kw: link)
    monkeypatch.setattr(service, "_require_not_expired", lambda *a: None)
    with pytest.raises(PermissionDeniedError):
        service.submit_for_review(raw_token="revoked", actor_name="Иванов Иван Иванович")
