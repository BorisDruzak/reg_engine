from app.services.bootstrap import CORE_PERMISSION_SEEDS, CORE_ROLE_SEEDS


def test_bootstrap_seed_russian_text_is_not_mojibake() -> None:
    role_names = {seed.code: seed.name for seed in CORE_ROLE_SEEDS}
    permission_descriptions = {seed.code: seed.description for seed in CORE_PERMISSION_SEEDS}

    assert role_names["system_admin"] == "Системный администратор"
    assert role_names["registry_admin"] == "Администратор реестра"
    assert role_names["org_admin"] == "Администратор организации"
    assert role_names["auditor"] == "Аудитор"
    assert permission_descriptions["users.manage"] == "Управление пользователями."
    assert permission_descriptions["access_grants.manage"] == "Управление правами доступа."
