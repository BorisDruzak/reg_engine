import argparse
from collections.abc import Sequence

from app.core.database import create_database_engine, create_session_factory
from app.services.audit import AuditRetentionService
from app.services.card_change_notifications import CardChangeNotificationService


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(description="Delete audit events past their retention period.")
    parser.add_argument("--database-url", default=None)
    return parser


def main(argv: Sequence[str] | None = None) -> int:
    args = build_parser().parse_args(argv)
    engine = create_database_engine(args.database_url)
    session_factory = create_session_factory(engine)
    with session_factory() as session:
        deleted_events = AuditRetentionService(session).delete_expired_events()
        deleted_notifications = CardChangeNotificationService(
            session
        ).delete_expired_notifications()
        session.commit()

    print(
        "Audit retention completed: "
        f"deleted_events={deleted_events} deleted_notifications={deleted_notifications}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
