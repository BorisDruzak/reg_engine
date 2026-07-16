from typing import Any


class _FakeSession:
    def __init__(self) -> None:
        self.committed = False

    def __enter__(self) -> "_FakeSession":
        return self

    def __exit__(self, exc_type: object, exc_value: object, traceback: object) -> None:
        return None

    def commit(self) -> None:
        self.committed = True


def test_audit_retention_cli_runs_cleanup_once_and_reports_deleted_count(
    monkeypatch: Any,
    capsys: Any,
) -> None:
    from app.cli import audit_retention

    session = _FakeSession()
    received: dict[str, object] = {}

    def fake_create_database_engine(database_url: str | None) -> object:
        received["database_url"] = database_url
        return object()

    def fake_create_session_factory(engine: object) -> Any:
        received["engine"] = engine
        return lambda: session

    class FakeAuditRetentionService:
        def __init__(self, service_session: _FakeSession) -> None:
            received["session"] = service_session

        def delete_expired_events(self) -> int:
            received["runs"] = int(received.get("runs", 0)) + 1
            return 7

    monkeypatch.setattr(audit_retention, "create_database_engine", fake_create_database_engine)
    monkeypatch.setattr(audit_retention, "create_session_factory", fake_create_session_factory)
    monkeypatch.setattr(audit_retention, "AuditRetentionService", FakeAuditRetentionService)

    assert audit_retention.main(["--database-url", "postgresql+psycopg://example/audit_test"]) == 0
    assert received["database_url"] == "postgresql+psycopg://example/audit_test"
    assert received["session"] is session
    assert received["runs"] == 1
    assert session.committed is True
    assert capsys.readouterr().out == "Audit retention completed: deleted_events=7\n"
