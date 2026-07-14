import pytest

from app.services.user_access import UserAccessError, UserAccessService


def test_login_normalization_allows_special_characters_without_email_format() -> None:
    assert UserAccessService._normalize_login(None, " Unit_123-Admin ") == "unit_123-admin"
    assert UserAccessService._normalize_login(None, "user@example.test") == "user@example.test"


@pytest.mark.parametrize("login", ["", "   ", "unit 123", "unit\t123", "unit\n123"])
def test_login_normalization_rejects_blank_and_whitespace_values(login: str) -> None:
    with pytest.raises(UserAccessError, match="Valid login is required"):
        UserAccessService._normalize_login(None, login)
