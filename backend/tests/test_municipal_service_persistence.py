from copy import deepcopy
from datetime import UTC, date, datetime, timedelta
from uuid import uuid4

import pytest
from sqlalchemy import select

from app.models import AuditEvent, CardEvent, CardTemplate, FormField, Organization
from app.services.card_events import CardChangeContext
from app.services.cards import CardServiceError, InvalidFieldValueError
from app.services.municipal_service_experience import MunicipalServiceExperienceService
from app.services.permissions import PermissionDeniedError
from tests.test_card_list_sorting import sorting_context as sorting_context
from tests.test_registry_card_services import card_event_context as card_event_context


def calculation():
    return {
        "mode": "calculated",
        "version": 1,
        "method": "calendar_remainder_30_v1",
        "baseline": None,
        "periods": [
            {
                "id": "one",
                "kind": "municipal",
                "start_date": "2024-01-01",
                "end_date": "2024-12-31",
                "included": True,
                "confirmed": True,
                "basis": "Приказ",
                "pension_only": False,
            }
        ],
    }


@pytest.fixture()
def municipal_context(sorting_context, monkeypatch):
    ctx = sorting_context
    monkeypatch.setattr(
        ctx.service.__class__, "synchronize_card_lifecycle", lambda *_a, **_kw: False
    )
    ctx.card = ctx.cards[0]
    ctx.session.add(
        Organization(
            id=ctx.card.organization_id,
            code="org",
            name="Организация",
            type="organization",
            is_active=True,
        )
    )
    field = FormField(
        id=uuid4(),
        block_id=ctx.block.id,
        code="service",
        label="Стаж",
        field_type="work_experience",
        required_mode="not_required",
        is_active=True,
        sensitivity_level="normal",
        options_config_json={"municipal_service_calculator": True},
    )
    ctx.fields.append(field)
    ctx.session.add(field)
    template = ctx.session.get(CardTemplate, ctx.card.card_template_id)
    template.field_schema_json = {"field_ids": [str(ctx.fio.id), str(ctx.day.id), str(field.id)]}
    ctx.session.commit()
    ctx.field = field
    ctx.calc = MunicipalServiceExperienceService(ctx.session)
    ctx.params = dict(actor_user_id=ctx.actor_id, card_id=ctx.card.id, field_id=field.id)
    return ctx


def test_save_reopen_summary_and_generic_overwrite_protection(municipal_context):
    ctx = municipal_context
    before = ctx.calc.read(**ctx.params)
    result = ctx.calc.save(
        **ctx.params, calculation=calculation(), expected_revision=before["revision"]
    )
    assert result["calculation"] == calculation()
    assert result["result"]["value"]["years"] == 1
    assert ctx.calc.read(**ctx.params)["calculation"] == calculation()
    value = ctx.service._read_field_value(ctx.field, ctx.calc._context(**ctx.params)[3], {})
    assert value["mode"] == "calculated"
    assert "periods" not in value
    with pytest.raises(InvalidFieldValueError):
        ctx.service.set_field_value_for_actor(
            **ctx.params, value={"days": 0, "months": 0, "years": 1}
        )
    with pytest.raises(InvalidFieldValueError):
        ctx.service.set_field_value_from_public_link(
            actor_public_link_id=uuid4(),
            card_id=ctx.card.id,
            field_id=ctx.field.id,
            value={"days": 0, "months": 0, "years": 1},
        )
    assert ctx.calc.read(**ctx.params)["calculation"] == calculation()


def test_other_field_bulk_save_and_explicit_manual_transition(municipal_context):
    ctx = municipal_context
    ctx.calc.save(
        **ctx.params,
        calculation=calculation(),
        expected_revision=ctx.calc.read(**ctx.params)["revision"],
    )
    from app.services.cards import BulkFieldValueInput

    ctx.service.set_field_values_for_actor(
        actor_user_id=ctx.actor_id,
        card_id=ctx.card.id,
        values=[BulkFieldValueInput(ctx.fio.id, "После")],
    )
    state = ctx.calc.read(**ctx.params)
    assert state["calculation"] == calculation()
    with pytest.raises(CardServiceError):
        ctx.calc.manual(
            **ctx.params,
            value={"days": 2, "months": 1, "years": 3},
            expected_revision=state["revision"],
            confirm_manual=False,
        )
    after = ctx.calc.manual(
        **ctx.params,
        value={"days": 2, "months": 1, "years": 3},
        expected_revision=state["revision"],
        confirm_manual=True,
    )
    assert after["calculation"] is None
    assert after["manual_value"]["years"] == 3


def test_manual_current_date_is_independent_and_repeat_safe(municipal_context):
    ctx = municipal_context
    payload = {"days": 0, "months": 0, "years": 1}
    result = ctx.calc.manual(
        **ctx.params,
        value=payload,
        as_of_date=date(2026, 1, 1),
        confirm_manual=False,
        expected_revision=ctx.calc.read(**ctx.params)["revision"],
    )
    assert result["calculation"] is None
    assert result["manual_input"] == payload
    assert result["manual_as_of_date"] == "2026-01-01"
    second = ctx.calc.manual(
        **ctx.params,
        value=payload,
        as_of_date=date(2026, 1, 1),
        confirm_manual=False,
        expected_revision=result["revision"],
    )
    assert second["manual_value"] == result["manual_value"]
    ctx.service.set_field_value_for_actor(**ctx.params, value={"days": 1, "months": 2, "years": 3})
    plain = ctx.calc.read(**ctx.params)
    assert plain["calculation"] is None
    assert plain["manual_input"] is None
    assert plain["manual_value"]["days"] == 1


def test_stale_revision_scope_and_archived_or_foreign_field(municipal_context, monkeypatch):
    ctx = municipal_context
    revision = ctx.calc.read(**ctx.params)["revision"]
    ctx.calc.save(**ctx.params, calculation=calculation(), expected_revision=revision)
    with pytest.raises(CardServiceError, match="измен"):
        ctx.calc.save(**ctx.params, calculation=calculation(), expected_revision=revision)
    monkeypatch.setattr(
        ctx.service.__class__,
        "_require_card_permission",
        lambda *_args, **_kwargs: (_ for _ in ()).throw(PermissionDeniedError("denied")),
    )
    with pytest.raises(PermissionDeniedError):
        ctx.calc.save(
            **ctx.params,
            calculation=calculation(),
            expected_revision=ctx.calc.read(**ctx.params)["revision"],
        )


def test_active_save_requires_basis_and_preserves_period_audit(municipal_context):
    ctx = municipal_context
    ctx.card.lifecycle_status = "active"
    ctx.card.activated_at = datetime.now(UTC)
    ctx.session.commit()
    revision = ctx.calc.read(**ctx.params)["revision"]
    with pytest.raises(CardServiceError):
        ctx.calc.save(**ctx.params, calculation=calculation(), expected_revision=revision)
    ctx.calc.save(
        **ctx.params,
        calculation=calculation(),
        expected_revision=revision,
        change_context=CardChangeContext("Основание расчёта", date(2026, 10, 26)),
    )
    assert ctx.session.scalars(
        select(AuditEvent).where(AuditEvent.object_type == "field_value")
    ).all()
    assert ctx.session.scalars(select(CardEvent)).all()


def test_dismissed_card_caps_open_period_and_rejects_save(municipal_context):
    ctx = municipal_context
    data = deepcopy(calculation())
    data["periods"][0]["end_date"] = None
    ctx.calc.save(
        **ctx.params, calculation=data, expected_revision=ctx.calc.read(**ctx.params)["revision"]
    )
    ctx.card.lifecycle_status = "dismissed"
    ctx.session.add(
        CardEvent(
            id=uuid4(),
            card_id=ctx.card.id,
            event_type="dismissal",
            occurred_on=date(2024, 12, 31),
            basis_text="Увольнение",
        )
    )
    ctx.session.commit()
    state = ctx.calc.read(**ctx.params)
    assert state["result"]["value"]["years"] == 1
    with pytest.raises(CardServiceError):
        ctx.calc.save(**ctx.params, calculation=data, expected_revision=state["revision"])


def test_http_routes_preview_save_and_safe_summary(municipal_context):
    from fastapi.testclient import TestClient

    from app.api.dependencies import get_actor_user_id, get_db_session
    from app.api.v1.endpoints._field_values import _read_field_value
    from app.main import create_app

    ctx = municipal_context
    app = create_app()
    app.dependency_overrides[get_actor_user_id] = lambda: ctx.actor_id
    app.dependency_overrides[get_db_session] = lambda: ctx.session
    path = f"/api/v1/cards/{ctx.card.id}/fields/{ctx.field.id}/municipal-service-experience"
    with TestClient(app) as client:
        state = client.get(path).json()
        request = {"calculation": calculation(), "as_of_date": "2024-12-31"}
        preview = client.post(path + "/preview", json=request)
        assert preview.status_code == 200
        assert preview.json()["value"]["years"] == 1
        saved = client.put(path, json={**request, "expected_revision": state["revision"]})
        assert saved.status_code == 200
        assert saved.json()["calculation"] == calculation()
        assert (
            client.put(path, json={**request, "expected_revision": state["revision"]}).status_code
            == 409
        )
        field_value = ctx.calc._context(**ctx.params)[3]
        summary = _read_field_value(ctx.session, ctx.field, field_value)
        assert summary["years"] == 1 and "periods" not in summary
        from app.services.public_links import PublicLinkService

        public_summary = PublicLinkService(ctx.session)._read_field_value(
            ctx.field, field_value, {}
        )
        assert public_summary["years"] == 1 and "periods" not in public_summary
        manual = client.post(
            path + "/manual",
            json={
                "days": 0,
                "months": 0,
                "years": 1,
                "confirm_manual": True,
                "expected_revision": saved.json()["revision"],
            },
        )
        assert manual.status_code == 200
        assert manual.json()["calculation"] is None


def test_schema_configuration_enforces_boolean_and_date_registry(municipal_context):
    from app.models import FormBlock
    from app.services.registry_schema import RegistrySchemaError, RegistrySchemaService

    ctx = municipal_context
    service = RegistrySchemaService(ctx.session)
    config = {
        "municipal_service_calculator": True,
        "municipal_service_start_date_field_id": str(ctx.day.id),
    }
    assert (
        service._normalize_options_config_for_field(
            "work_experience", config, registry_id=ctx.card.registry_id
        )
        == config
    )
    with pytest.raises(RegistrySchemaError):
        service._normalize_options_config_for_field(
            "work_experience", {"municipal_service_calculator": "yes"}
        )
    block = ctx.session.get(FormBlock, ctx.block.id)
    block.registry_id = uuid4()
    ctx.session.commit()
    with pytest.raises(RegistrySchemaError):
        service._normalize_options_config_for_field(
            "work_experience", config, registry_id=ctx.card.registry_id
        )


def test_foreign_template_and_instance_are_rejected(municipal_context):
    ctx = municipal_context
    with pytest.raises(CardServiceError):
        ctx.calc.read(**ctx.params, block_instance_id=uuid4())
    template = ctx.session.get(CardTemplate, ctx.card.card_template_id)
    template.field_schema_json = {"field_ids": [str(ctx.fio.id)]}
    ctx.session.commit()
    with pytest.raises(CardServiceError):
        ctx.calc.read(**ctx.params)


def test_dismissal_cannot_silently_rewind_a_confirmed_baseline(municipal_context):
    ctx = municipal_context
    data = calculation()
    data["periods"] = []
    data["baseline"] = {
        "years": 1,
        "months": 0,
        "days": 0,
        "as_of_date": "2026-01-01",
        "basis": "Подтверждённый стаж",
        "confirmed": True,
    }
    ctx.calc.save(
        **ctx.params, calculation=data, expected_revision=ctx.calc.read(**ctx.params)["revision"]
    )
    ctx.card.lifecycle_status = "active"
    ctx.session.commit()
    with pytest.raises(CardServiceError, match="исходного стажа"):
        ctx.service.dismiss_card_for_actor(
            actor_user_id=ctx.actor_id,
            card_id=ctx.card.id,
            occurred_on=date(2025, 12, 31),
            basis_text="Увольнение",
        )
    assert ctx.card.lifecycle_status == "active"


@pytest.mark.parametrize("mode", ["manual", "calculated"])
def test_archiving_a_dismissed_card_preserves_experience_cutoff(municipal_context, mode):
    ctx = municipal_context
    revision = ctx.calc.read(**ctx.params)["revision"]
    if mode == "calculated":
        data = calculation()
        data["periods"][0]["end_date"] = None
        ctx.calc.save(**ctx.params, calculation=data, expected_revision=revision)
    else:
        ctx.calc.manual(
            **ctx.params,
            value={"days": 0, "months": 0, "years": 0},
            as_of_date=date(2024, 1, 1),
            expected_revision=revision,
        )
    ctx.card.lifecycle_status = "active"
    ctx.session.commit()
    ctx.service.dismiss_card_for_actor(
        actor_user_id=ctx.actor_id,
        card_id=ctx.card.id,
        occurred_on=date(2024, 12, 31),
        basis_text="Приказ об увольнении",
    )
    before = ctx.calc.read(**ctx.params)

    ctx.service.archive_card_for_actor(
        actor_user_id=ctx.actor_id,
        card_id=ctx.card.id,
        change_context=CardChangeContext("Приказ об архивировании", date.today()),
    )

    after = ctx.calc.read(**ctx.params)
    assert ctx.card.lifecycle_status == "archived"
    assert after["result"] == before["result"]
    assert after["manual_value"] == before["manual_value"]
    assert after["revision"] == before["revision"]


@pytest.mark.parametrize("mode", ["manual", "calculated"])
def test_archiving_without_dismissal_preserves_current_experience(municipal_context, mode):
    ctx = municipal_context
    revision = ctx.calc.read(**ctx.params)["revision"]
    if mode == "calculated":
        data = calculation()
        data["periods"][0]["end_date"] = None
        ctx.calc.save(**ctx.params, calculation=data, expected_revision=revision)
    else:
        ctx.service.set_field_value_for_actor(
            **ctx.params, value={"days": 0, "months": 0, "years": 1}
        )
    ctx.card.lifecycle_status = "active"
    ctx.session.commit()
    before = ctx.calc.read(**ctx.params)

    ctx.service.archive_card_for_actor(
        actor_user_id=ctx.actor_id,
        card_id=ctx.card.id,
        change_context=CardChangeContext("Приказ об архивировании", date.today()),
    )

    after = ctx.calc.read(**ctx.params)
    assert after["result"] == before["result"]
    assert after["manual_value"] == before["manual_value"]
    assert (
        ctx.session.scalars(select(CardEvent).where(CardEvent.event_type == "dismissal")).all()
        == []
    )


@pytest.mark.parametrize("dated", [False, True])
def test_dismissal_cannot_precede_a_manual_experience_anchor(municipal_context, dated):
    ctx = municipal_context
    value = {"days": 0, "months": 0, "years": 0}
    if dated:
        ctx.calc.manual(
            **ctx.params,
            value=value,
            as_of_date=date.today(),
            expected_revision=ctx.calc.read(**ctx.params)["revision"],
        )
    else:
        ctx.service.set_field_value_for_actor(**ctx.params, value=value)
    ctx.card.lifecycle_status = "active"
    ctx.session.commit()
    before = ctx.calc.read(**ctx.params)

    with pytest.raises(CardServiceError, match="исходного стажа"):
        ctx.service.dismiss_card_for_actor(
            actor_user_id=ctx.actor_id,
            card_id=ctx.card.id,
            occurred_on=date.today() - timedelta(days=1),
            basis_text="Приказ об увольнении",
        )

    assert ctx.card.lifecycle_status == "active"
    assert ctx.calc.read(**ctx.params) == before
    assert (
        ctx.session.scalars(select(CardEvent).where(CardEvent.event_type == "dismissal")).all()
        == []
    )


@pytest.mark.parametrize("dated", [False, True])
def test_dismissal_on_a_manual_experience_anchor_remains_allowed(municipal_context, dated):
    ctx = municipal_context
    value = {"days": 0, "months": 0, "years": 0}
    if dated:
        ctx.calc.manual(
            **ctx.params,
            value=value,
            as_of_date=date.today(),
            expected_revision=ctx.calc.read(**ctx.params)["revision"],
        )
    else:
        ctx.service.set_field_value_for_actor(**ctx.params, value=value)
    ctx.card.lifecycle_status = "active"
    ctx.session.commit()

    ctx.service.dismiss_card_for_actor(
        actor_user_id=ctx.actor_id,
        card_id=ctx.card.id,
        occurred_on=date.today(),
        basis_text="Приказ об увольнении",
    )

    assert ctx.card.lifecycle_status == "dismissed"
    assert ctx.calc.read(**ctx.params)["manual_value"]["years"] == 0
