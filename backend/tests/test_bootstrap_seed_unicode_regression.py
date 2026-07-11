from app.services.bootstrap import CORE_PERMISSION_SEEDS, CORE_ROLE_SEEDS


def test_bootstrap_seed_russian_text_is_not_mojibake() -> None:
    role_names = {seed.code: seed.name for seed in CORE_ROLE_SEEDS}
    permission_descriptions = {seed.code: seed.description for seed in CORE_PERMISSION_SEEDS}

    assert role_names["administrator"] == "Администратор"
    assert role_names["organization_administrator"] == "Администратор организации"
    assert (
        role_names["subordinate_organization_administrator"]
        == "Администратор подведомственной организации"
    )
    assert permission_descriptions["users.manage"] == "Управление пользователями."
    assert permission_descriptions["access_grants.manage"] == "Управление правами доступа."
