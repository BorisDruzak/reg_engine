from datetime import UTC, date, datetime
from uuid import UUID, uuid4

import pytest
from fastapi.testclient import TestClient
from sqlalchemy import delete, select, text

from app.api.dependencies import get_actor_user_id, get_db_session
from app.main import create_app
from app.models import Card, CardBlockInstance, CardTemplate, FieldValue, FormBlock, FormField
from app.services.cards import CardService, CardServiceError
from app.services.permissions import PermissionService
from tests.test_registry_card_services import card_event_context as card_event_context

_real_get_active_field = CardService._get_active_field
_real_get_active_block = CardService._get_active_block


@pytest.fixture()
def sorting_context(card_event_context, monkeypatch):
    ctx = card_event_context
    for column, default in [("field_schema_json", "'{}'"), ("default_values_json", "'[]'")]:
        monkeypatch.setattr(CardTemplate.__table__.c[column].server_default, "arg", text(default))
    for model in (FormBlock, FormField, CardTemplate):
        model.__table__.create(ctx.session.get_bind())
    ctx.session.add(
        FormBlock(
            id=ctx.block.id,
            registry_id=ctx.card.registry_id,
            code="base",
            title="Основное",
            is_active=True,
        )
    )
    fio = FormField(
        id=uuid4(),
        block_id=ctx.block.id,
        code="fio",
        label="ФИО",
        field_type="text",
        is_active=True,
    )
    day = FormField(
        id=uuid4(),
        block_id=ctx.block.id,
        code="day",
        label="Дата",
        field_type="date",
        is_active=True,
    )
    ctx.fields.extend([fio, day])
    ctx.session.add_all(
        [
            fio,
            day,
            CardTemplate(
                id=ctx.card.card_template_id,
                registry_id=ctx.card.registry_id,
                code="base",
                name="Основной",
                field_schema_json={"field_ids": [str(fio.id), str(day.id)]},
            ),
        ]
    )
    ctx.cards = []
    for index, (name, day_value) in enumerate(
        [
            ("яков", date(2010, 1, 1)),
            ("Анна", date(2000, 12, 1)),
            ("Борис", date(2005, 2, 1)),
            (None, None),
            ("Анна", date(2000, 12, 1)),
        ],
        start=1,
    ):
        card = Card(
            id=UUID(f"aaaaaaaa-aaaa-aaaa-aaaa-{index:012x}"),
            registry_id=ctx.card.registry_id,
            organization_id=ctx.card.organization_id,
            card_template_id=ctx.card.card_template_id,
        )
        instance = CardBlockInstance(id=uuid4(), card_id=card.id, block_id=ctx.block.id, ordinal=0)
        ctx.session.add_all([card, instance])
        ctx.session.add_all(
            [
                FieldValue(
                    id=uuid4(),
                    card_id=card.id,
                    block_instance_id=instance.id,
                    field_id=fio.id,
                    value_text=name,
                ),
                FieldValue(
                    id=uuid4(),
                    card_id=card.id,
                    block_instance_id=instance.id,
                    field_id=day.id,
                    value_date=day_value,
                ),
            ]
        )
        ctx.cards.append(card)
    # This card has the smallest key but is outside the actor's organization scope.
    ctx.card.organization_id = uuid4()
    ctx.session.commit()
    monkeypatch.setattr(
        PermissionService,
        "get_organization_scope_ids",
        lambda *_args, **_kwargs: {ctx.cards[0].organization_id},
    )
    ctx.fio, ctx.day = fio, day
    return ctx


@pytest.mark.parametrize("mode", ["display_value", "field"])
@pytest.mark.parametrize(
    "direction,expected", [("asc", [2, 5, 3, 1, 4]), ("desc", [1, 3, 2, 5, 4])]
)
def test_sorting_is_typed_stable_empty_last_and_scoped(sorting_context, mode, direction, expected):
    ctx = sorting_context
    result = ctx.service.list_visible_cards(
        actor_user_id=ctx.actor_id,
        registry_id=ctx.card.registry_id,
        sort_by=mode,
        sort_direction=direction,
        sort_field_id=ctx.day.id if mode == "field" else None,
    )
    assert [int(card.id.hex[-1], 16) for card in result] == expected


def test_date_sort_ignores_archived_instances_and_uses_first_active(sorting_context):
    ctx = sorting_context
    for ordinal, archived, value in [(-1, True, date(1900, 1, 1)), (1, False, date(1900, 1, 1))]:
        instance = CardBlockInstance(
            id=uuid4(),
            card_id=ctx.cards[0].id,
            block_id=ctx.block.id,
            ordinal=ordinal,
            archived_at=datetime.now(UTC) if archived else None,
        )
        ctx.session.add_all(
            [
                instance,
                FieldValue(
                    id=uuid4(),
                    card_id=ctx.cards[0].id,
                    block_instance_id=instance.id,
                    field_id=ctx.day.id,
                    value_date=value,
                ),
            ]
        )
    ctx.session.commit()
    result = ctx.service.list_visible_cards(
        actor_user_id=ctx.actor_id,
        registry_id=ctx.card.registry_id,
        sort_by="field",
        sort_field_id=ctx.day.id,
    )
    assert [int(card.id.hex[-1], 16) for card in result] == [2, 5, 3, 1, 4]


def test_date_sort_treats_values_outside_template_as_empty(sorting_context):
    ctx = sorting_context
    template = CardTemplate(
        id=uuid4(),
        registry_id=ctx.card.registry_id,
        code="other",
        name="Другой",
        field_schema_json={"field_ids": [str(ctx.fio.id)]},
    )
    ctx.session.add(template)
    ctx.cards[1].card_template_id = template.id
    ctx.session.commit()
    result = ctx.service.list_visible_cards(
        actor_user_id=ctx.actor_id,
        registry_id=ctx.card.registry_id,
        sort_by="field",
        sort_field_id=ctx.day.id,
    )
    assert [int(card.id.hex[-1], 16) for card in result] == [5, 3, 1, 2, 4]


def test_empty_first_instance_does_not_take_a_later_date(sorting_context):
    ctx = sorting_context
    card = ctx.cards[0]
    ctx.session.execute(
        delete(FieldValue).where(FieldValue.card_id == card.id, FieldValue.field_id == ctx.day.id)
    )
    later = CardBlockInstance(id=uuid4(), card_id=card.id, block_id=ctx.block.id, ordinal=1)
    ctx.session.add_all(
        [
            later,
            FieldValue(
                id=uuid4(),
                card_id=card.id,
                block_instance_id=later.id,
                field_id=ctx.day.id,
                value_date=date(2100, 1, 1),
            ),
        ]
    )
    ctx.session.commit()
    result = ctx.service.list_visible_cards(
        actor_user_id=ctx.actor_id,
        registry_id=ctx.card.registry_id,
        sort_by="field",
        sort_field_id=ctx.day.id,
        sort_direction="desc",
    )
    assert [int(card.id.hex[-1], 16) for card in result] == [3, 2, 5, 1, 4]


@pytest.mark.parametrize(
    "options",
    [
        {"sort_by": "field"},
        {"sort_by": "unknown"},
        {"sort_direction": "unknown"},
        {"sort_by": "display_value", "sort_field_id": uuid4()},
    ],
)
def test_invalid_sort_configuration_is_rejected(sorting_context, options):
    ctx = sorting_context
    with pytest.raises(CardServiceError):
        ctx.service.list_visible_cards(
            actor_user_id=ctx.actor_id, registry_id=ctx.card.registry_id, **options
        )


def test_sort_field_must_be_active_date_in_same_registry(sorting_context):
    ctx = sorting_context
    for field_id in [ctx.fio.id]:
        with pytest.raises(CardServiceError):
            ctx.service.list_visible_cards(
                actor_user_id=ctx.actor_id,
                registry_id=ctx.card.registry_id,
                sort_by="field",
                sort_field_id=field_id,
            )
    ctx.block.registry_id = uuid4()
    with pytest.raises(CardServiceError):
        ctx.service.list_visible_cards(
            actor_user_id=ctx.actor_id,
            registry_id=ctx.card.registry_id,
            sort_by="field",
            sort_field_id=ctx.day.id,
        )


@pytest.mark.parametrize("entity", ["field", "block"])
def test_inactive_schema_cannot_be_used_for_sorting(sorting_context, monkeypatch, entity):
    ctx = sorting_context
    monkeypatch.setattr(CardService, "_get_active_field", _real_get_active_field)
    monkeypatch.setattr(CardService, "_get_active_block", _real_get_active_block)
    target = ctx.day if entity == "field" else ctx.session.get(FormBlock, ctx.block.id)
    target.is_active = False
    ctx.session.commit()
    with pytest.raises(CardServiceError):
        ctx.service.list_visible_cards(
            actor_user_id=ctx.actor_id,
            registry_id=ctx.card.registry_id,
            sort_by="field",
            sort_field_id=ctx.day.id,
        )


def test_datetime_sort_uses_typed_time_values(sorting_context):
    ctx = sorting_context
    ctx.day.field_type = "datetime"
    for value in ctx.session.scalars(select(FieldValue).where(FieldValue.field_id == ctx.day.id)):
        if value.value_date:
            value.value_datetime = datetime.combine(
                value.value_date, datetime.min.time(), tzinfo=UTC
            )
            value.value_date = None
    ctx.session.commit()
    result = ctx.service.list_visible_cards(
        actor_user_id=ctx.actor_id,
        registry_id=ctx.card.registry_id,
        sort_by="field",
        sort_field_id=ctx.day.id,
        sort_direction="desc",
    )
    assert [int(card.id.hex[-1], 16) for card in result] == [1, 3, 2, 5, 4]


def test_omitting_sort_preserves_default_identifier_order(sorting_context):
    ctx = sorting_context
    result = ctx.service.list_visible_cards(
        actor_user_id=ctx.actor_id, registry_id=ctx.card.registry_id
    )
    assert [int(card.id.hex[-1], 16) for card in result] == [1, 2, 3, 4, 5]


@pytest.mark.parametrize("prefix", ["registries", "organizations"])
def test_list_http_forwards_sorting_and_validates_direction(prefix, monkeypatch):
    captured = []

    def record(_self, **kwargs):
        captured.append(kwargs)
        return []

    monkeypatch.setattr(CardService, "list_visible_cards", record)
    monkeypatch.setattr(CardService, "list_visible_cards_for_organization_for_actor", record)
    app = create_app()
    app.dependency_overrides[get_db_session] = lambda: None
    app.dependency_overrides[get_actor_user_id] = uuid4
    field_id = uuid4()
    with TestClient(app) as client:
        path = f"/api/v1/{prefix}/{uuid4()}/cards"
        response = client.get(
            path,
            params={"sort_by": "field", "sort_field_id": str(field_id), "sort_direction": "desc"},
        )
        assert response.status_code == 200
        assert captured[-1]["sort_by"] == "field"
        assert captured[-1]["sort_field_id"] == field_id
        assert captured[-1]["sort_direction"] == "desc"
        assert client.get(path, params={"sort_direction": "wrong"}).status_code == 422
